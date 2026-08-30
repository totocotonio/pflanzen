"""Grünzeug API – Anmeldung und Geräte-Sync.

Hält je Benutzer genau einen Datensatz (Pflanzen, Verlauf, Einstellungen) als
JSON. Der Client behält localStorage als Primärspeicher und schiebt Änderungen
hoch; die Revisionsnummer verhindert, dass ein Gerät die Änderungen eines
anderen unbemerkt überschreibt.

Start:  uvicorn main:app --host 127.0.0.1 --port 8500

© 2026 Torsten Michaely – Alle Rechte vorbehalten
"""
from __future__ import annotations

import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import (Column, DateTime, ForeignKey, Integer, String, Text,
                        create_engine)
from sqlalchemy.orm import Session, declarative_base, sessionmaker

BASIS = os.path.dirname(os.path.abspath(__file__))
DB_PFAD = os.environ.get("GRUENZEUG_DB", os.path.join(BASIS, "gruenzeug.db"))
COOKIE = "gz_session"
SESSION_TAGE = 90
# Bei Entwicklung über http://localhost muss das Secure-Flag weg
COOKIE_SECURE = os.environ.get("GRUENZEUG_UNSICHER", "") != "1"

engine = create_engine(f"sqlite:///{DB_PFAD}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()


# --------------------------------------------------------------- Modelle
class User(Base):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True)
    name = Column(String(64), unique=True, nullable=False)
    passwort_hash = Column(String(128), nullable=False)
    erstellt = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Sitzung(Base):
    __tablename__ = "sitzung"
    token = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
    erstellt = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    letzter_zugriff = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Datensatz(Base):
    __tablename__ = "datensatz"
    user_id = Column(Integer, ForeignKey("user.id"), primary_key=True)
    inhalt = Column(Text, nullable=False, default="{}")
    rev = Column(Integer, nullable=False, default=0)
    geaendert = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class Version(Base):
    """Früherer Stand eines Datensatzes.

    Die App überschreibt beim Sync immer den ganzen Datensatz. Ohne diese
    Tabelle wäre ein versehentliches "Alle Daten löschen" endgültig – es
    verteilt sich in Sekunden auf alle Geräte.
    """
    __tablename__ = "version"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("user.id"), nullable=False, index=True)
    inhalt = Column(Text, nullable=False)
    rev = Column(Integer, nullable=False)
    pflanzen = Column(Integer, nullable=False, default=0)
    erstellt = Column(DateTime, default=lambda: datetime.now(timezone.utc))


import push  # noqa: E402  (braucht Base, deshalb hier)
import wetter  # noqa: E402
import backup as sicherung  # noqa: E402

PushAbo = push.modell_anlegen(Base)

Base.metadata.create_all(engine)


def spalten_ergaenzen() -> None:
    """Ergänzt nachträglich hinzugekommene Spalten.

    `create_all` legt nur fehlende Tabellen an, keine fehlenden Spalten. Ohne
    das hier würde ein Update mit neuem Feld auf einer bestehenden Datenbank
    beim ersten Zugriff scheitern.
    """
    from sqlalchemy import inspect, text

    noetig = {
        "push_abo": {
            "nicht_vor": "VARCHAR(20) NOT NULL DEFAULT ''",
            # Die Frostwarnung laeuft neben der taeglichen Erinnerung und
            # braucht ihre eigene Merkspalte, sonst faellt eine von beiden aus.
            "frost_zuletzt": "VARCHAR(20) NOT NULL DEFAULT ''",
        },
    }
    pruefer = inspect(engine)
    with engine.connect() as conn:
        for tabelle, spalten in noetig.items():
            if not pruefer.has_table(tabelle):
                continue
            vorhanden = {s["name"] for s in pruefer.get_columns(tabelle)}
            for name, typ in spalten.items():
                if name not in vorhanden:
                    conn.execute(text(f"ALTER TABLE {tabelle} ADD COLUMN {name} {typ}"))
                    conn.commit()
                    print(f"Spalte ergänzt: {tabelle}.{name}")


spalten_ergaenzen()


# --------------------------------------------------------------- Hilfen
def db() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()


def pruefe_passwort(klartext: str, hash_: str) -> bool:
    try:
        return bcrypt.checkpw(klartext.encode(), hash_.encode())
    except ValueError:
        return False


def aktueller_user(
    gz_session: str | None = Cookie(default=None, alias=COOKIE),
    s: Session = Depends(db),
) -> User:
    """Löst das Session-Cookie auf. 401, wenn es fehlt oder abgelaufen ist."""
    if not gz_session:
        raise HTTPException(401, "nicht angemeldet")
    sitzung = s.get(Sitzung, gz_session)
    if not sitzung:
        raise HTTPException(401, "Sitzung unbekannt")

    letzter = sitzung.letzter_zugriff or sitzung.erstellt
    if letzter.tzinfo is None:
        letzter = letzter.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - letzter > timedelta(days=SESSION_TAGE):
        s.delete(sitzung)
        s.commit()
        raise HTTPException(401, "Sitzung abgelaufen")

    sitzung.letzter_zugriff = datetime.now(timezone.utc)
    s.commit()
    user = s.get(User, sitzung.user_id)
    if not user:
        raise HTTPException(401, "Benutzer entfernt")
    return user


# Einfache Bremse gegen Passwort-Raten: Zeitstempel je IP im Speicher
_versuche: dict[str, list[float]] = {}


def client_ip(request: Request) -> str:
    """IP des Aufrufers. Die App läuft hinter Nginx und dem Proxy Manager,
    request.client wäre also immer 127.0.0.1. X-Forwarded-For ist fälschbar –
    für eine grobe Bremse gegen Passwort-Raten reicht es trotzdem."""
    weiter = request.headers.get("x-forwarded-for")
    if weiter:
        return weiter.split(",")[0].strip()
    return request.client.host if request.client else "?"


def bremse(ip: str, limit: int = 8, fenster: int = 300) -> None:
    jetzt = time.time()
    liste = [t for t in _versuche.get(ip, []) if jetzt - t < fenster]
    if len(liste) >= limit:
        raise HTTPException(429, "Zu viele Versuche. Bitte ein paar Minuten warten.")
    liste.append(jetzt)
    _versuche[ip] = liste


# --------------------------------------------------------------- Versionen
VERSIONEN_MAX = 20          # je Benutzer
VERSION_ABSTAND_MIN = 60    # Minuten zwischen zwei regulären Schnappschüssen


def version_sichern(s: Session, user_id: int, alt: "Datensatz", anzahl_neu: int) -> None:
    """Legt den bisherigen Stand ab, bevor er überschrieben wird.

    Nicht bei jedem Sync – der Client schiebt oft. Gesichert wird, wenn die
    letzte Sicherung eine Stunde her ist, oder sobald Pflanzen verschwinden.
    Verglichen wird dafür der neue Stand mit dem, der gleich überschrieben
    wird – nicht mit der letzten Sicherung, die kann Stunden alt sein.
    """
    try:
        anzahl_alt = len(json.loads(alt.inhalt).get("plants") or [])
    except ValueError:
        return

    verlust = anzahl_neu < anzahl_alt

    letzte = (s.query(Version)
              .filter(Version.user_id == user_id)
              .order_by(Version.id.desc()).first())

    if letzte and not verlust:
        vorher = letzte.erstellt or datetime.now(timezone.utc)
        if vorher.tzinfo is None:
            vorher = vorher.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - vorher) < timedelta(minutes=VERSION_ABSTAND_MIN):
            return

    s.add(Version(user_id=user_id, inhalt=alt.inhalt, rev=alt.rev, pflanzen=anzahl_alt))
    s.flush()   # sonst zählt die neue Version beim Aufräumen nicht mit

    # Älteste über der Grenze wegräumen
    ueberzaehlig = (s.query(Version)
                    .filter(Version.user_id == user_id)
                    .order_by(Version.id.desc())
                    .offset(VERSIONEN_MAX).all())
    for v in ueberzaehlig:
        s.delete(v)


# --------------------------------------------------------------- Schemas
class LoginDaten(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    passwort: str = Field(min_length=1, max_length=256)


class SyncDaten(BaseModel):
    rev: int = 0
    daten: dict


# --------------------------------------------------------------- App
app = FastAPI(title="Grünzeug API", docs_url=None, redoc_url=None)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.post("/api/login")
def login(daten: LoginDaten, request: Request, response: Response, s: Session = Depends(db)):
    bremse(client_ip(request))
    user = s.query(User).filter(User.name == daten.name.strip()).first()
    if not user or not pruefe_passwort(daten.passwort, user.passwort_hash):
        raise HTTPException(401, "Name oder Passwort stimmt nicht")

    token = secrets.token_urlsafe(32)
    s.add(Sitzung(token=token, user_id=user.id))
    s.commit()
    response.set_cookie(
        COOKIE, token,
        max_age=SESSION_TAGE * 86400,
        httponly=True, secure=COOKIE_SECURE, samesite="lax", path="/",
    )
    return {"name": user.name}


@app.post("/api/logout")
def logout(response: Response,
           gz_session: str | None = Cookie(default=None, alias=COOKIE),
           s: Session = Depends(db)):
    if gz_session:
        sitzung = s.get(Sitzung, gz_session)
        if sitzung:
            s.delete(sitzung)
            s.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(aktueller_user)):
    return {"name": user.name}


@app.get("/api/data")
def daten_holen(user: User = Depends(aktueller_user), s: Session = Depends(db)):
    d = s.get(Datensatz, user.id)
    if not d:
        return {"rev": 0, "daten": None, "geaendert": None}
    return {
        "rev": d.rev,
        "daten": json.loads(d.inhalt),
        "geaendert": (d.geaendert.isoformat() if d.geaendert else None),
    }


@app.put("/api/data")
def daten_speichern(eingabe: SyncDaten,
                    user: User = Depends(aktueller_user),
                    s: Session = Depends(db)):
    """Speichert den kompletten Datensatz.

    Passt `rev` nicht zur gespeicherten Revision, hat ein anderes Gerät
    zwischendurch geschrieben: 409 mit dem Serverstand, damit der Client
    nachfragen kann, statt fremde Änderungen zu überschreiben.
    """
    inhalt = json.dumps(eingabe.daten, ensure_ascii=False, separators=(",", ":"))
    if len(inhalt.encode()) > 12 * 1024 * 1024:
        raise HTTPException(413, "Datensatz zu groß (max. 12 MB)")

    d = s.get(Datensatz, user.id)
    if not d:
        d = Datensatz(user_id=user.id, inhalt=inhalt, rev=1)
        s.add(d)
        s.commit()
        return {"rev": d.rev}

    if eingabe.rev != d.rev:
        raise HTTPException(
            409,
            detail={"grund": "konflikt", "rev": d.rev, "daten": json.loads(d.inhalt)},
        )

    version_sichern(s, user.id, d, len(eingabe.daten.get("plants") or []))
    d.inhalt = inhalt
    d.rev += 1
    d.geaendert = datetime.now(timezone.utc)
    s.commit()
    return {"rev": d.rev}


@app.get("/api/versionen")
def versionen_liste(user: User = Depends(aktueller_user), s: Session = Depends(db)):
    """Frühere Stände, neuester zuerst."""
    liste = (s.query(Version)
             .filter(Version.user_id == user.id)
             .order_by(Version.id.desc()).all())
    return {"versionen": [{
        "id": v.id,
        "rev": v.rev,
        "pflanzen": v.pflanzen,
        "groesse": len(v.inhalt),
        "erstellt": (v.erstellt.replace(tzinfo=timezone.utc).isoformat()
                     if v.erstellt and v.erstellt.tzinfo is None
                     else (v.erstellt.isoformat() if v.erstellt else None)),
    } for v in liste]}


@app.post("/api/versionen/{version_id}/wiederherstellen")
def version_wiederherstellen(version_id: int,
                             user: User = Depends(aktueller_user),
                             s: Session = Depends(db)):
    """Macht einen früheren Stand zum aktuellen.

    Der bisherige Stand wird vorher gesichert – auch ein Wiederherstellen
    soll sich rückgängig machen lassen.
    """
    v = s.get(Version, version_id)
    if not v or v.user_id != user.id:
        raise HTTPException(404, "Diesen Stand gibt es nicht")

    d = s.get(Datensatz, user.id)
    if d:
        s.add(Version(user_id=user.id, inhalt=d.inhalt, rev=d.rev,
                      pflanzen=len((json.loads(d.inhalt).get("plants") or []))))
        d.inhalt = v.inhalt
        d.rev += 1
        d.geaendert = datetime.now(timezone.utc)
    else:
        d = Datensatz(user_id=user.id, inhalt=v.inhalt, rev=1)
        s.add(d)
    s.commit()
    return {"rev": d.rev, "daten": json.loads(d.inhalt)}


@app.get("/api/qr")
def qr_code(p: str = "", name: str = ""):
    """QR-Code als SVG für den Aufkleber am Topf.

    Ohne Anmeldung erreichbar: Der Code enthält nur eine Pflanzen-ID, keine
    Daten. Wer ihn scannt, landet in der App und muss sich dort anmelden.
    """
    import io as _io
    import re as _re

    import segno
    from fastapi.responses import Response as DateiAntwort

    if not _re.fullmatch(r"[A-Za-z0-9_-]{1,40}", p):
        raise HTTPException(400, "ungültige Kennung")

    ziel = f"https://pflanzen.michaely.de/#p={p}"
    puffer = _io.BytesIO()
    segno.make(ziel, error="m").save(puffer, kind="svg", scale=6, border=2,
                                     dark="#000000", light="#ffffff")
    return DateiAntwort(content=puffer.getvalue(), media_type="image/svg+xml",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/health")
def health():
    return {"ok": True}


# --------------------------------------------------------------- Sicherung
# Die naechtliche Sicherung laeuft per systemd-Timer. Hier laesst sie sich
# zusaetzlich von Hand anstossen - sonst braeuchte es dafuer jedes Mal SSH.
_letzte_sicherung = [0.0]


@app.get("/api/backup")
def backup_liste(user: User = Depends(aktueller_user)):
    return {"sicherungen": sicherung.liste()}


@app.post("/api/backup")
def backup_starten(user: User = Depends(aktueller_user)):
    # Eine Bremse reicht: Der Dateiname enthaelt das Datum, ein zweiter Lauf
    # am selben Tag ueberschreibt nur - vollaufen kann die Platte also nicht.
    jetzt = time.time()
    if jetzt - _letzte_sicherung[0] < 60:
        raise HTTPException(429, "Gerade eben schon gesichert")
    _letzte_sicherung[0] = jetzt
    try:
        datei = sicherung.sichern()
        weg = sicherung.aufraeumen()
    except Exception as fehler:                       # noqa: BLE001
        raise HTTPException(500, f"Sicherung fehlgeschlagen: {fehler}")
    return {"datei": os.path.basename(datei),
            "bytes": os.path.getsize(datei),
            "entfernt": weg,
            "sicherungen": sicherung.liste()}


# --------------------------------------------------------------- Wetter
# Die Geräte fragen nie selbst bei Open-Meteo an: Der Server holt die Daten
# und gibt nur die abgeleitete Lage weiter. Anmeldung ist Pflicht, damit der
# Server nicht als offener Wetter-Proxy im Netz steht.
@app.get("/api/wetter")
def wetter_lage(lat: float, lon: float, user: User = Depends(aktueller_user)):
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise HTTPException(400, "Koordinaten unplausibel")
    ergebnis = wetter.lage_sicher(lat, lon)
    if not ergebnis:
        raise HTTPException(503, "Wetterdienst nicht erreichbar")
    return ergebnis


@app.get("/api/orte")
def orte(q: str = "", user: User = Depends(aktueller_user)):
    return {"orte": wetter.orte_suchen(q[:60])}


# --------------------------------------------------------------- Push
class AboDaten(BaseModel):
    endpoint: str = Field(min_length=10, max_length=500)
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=4, max_length=100)
    zeit: str = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")


class AboEnde(BaseModel):
    endpoint: str


@app.get("/api/push/key")
def push_key():
    """Öffentlicher VAPID-Schlüssel. Der Client braucht ihn zum Anmelden,
    deshalb ist er bewusst ohne Anmeldung abrufbar."""
    return {"key": push.schluessel_laden()["public"]}


@app.post("/api/push/subscribe")
def push_anmelden(daten: AboDaten,
                  user: User = Depends(aktueller_user),
                  s: Session = Depends(db)):
    vorhanden = s.query(PushAbo).filter(PushAbo.endpoint == daten.endpoint).first()
    if vorhanden:
        vorhanden.user_id = user.id
        vorhanden.p256dh = daten.p256dh
        vorhanden.auth = daten.auth
        vorhanden.zeit = daten.zeit
        vorhanden.zuletzt = ""
    else:
        s.add(PushAbo(user_id=user.id, endpoint=daten.endpoint, p256dh=daten.p256dh,
                      auth=daten.auth, zeit=daten.zeit))
    s.commit()
    return {"ok": True}


@app.post("/api/push/unsubscribe")
def push_abmelden(daten: AboEnde,
                  user: User = Depends(aktueller_user),
                  s: Session = Depends(db)):
    s.query(PushAbo).filter(PushAbo.endpoint == daten.endpoint,
                            PushAbo.user_id == user.id).delete()
    s.commit()
    return {"ok": True}


class Verschieben(BaseModel):
    stunden: float = Field(default=2, ge=0.25, le=24)


@app.post("/api/push/spaeter")
def push_spaeter(daten: Verschieben,
                 user: User = Depends(aktueller_user),
                 s: Session = Depends(db)):
    """Verschiebt die heutige Erinnerung. Ohne das hieße Wegwischen: heute
    kommt nichts mehr, obwohl die Pflanze weiter Durst hat."""
    ziel = datetime.now() + timedelta(hours=daten.stunden)
    abos = s.query(PushAbo).filter(PushAbo.user_id == user.id).all()
    for abo in abos:
        abo.nicht_vor = ziel.isoformat(timespec="minutes")
        abo.zuletzt = ""          # heute darf erneut gesendet werden
    s.commit()
    return {"ok": True, "wieder_ab": ziel.strftime("%H:%M")}


@app.post("/api/push/test")
def push_test(user: User = Depends(aktueller_user), s: Session = Depends(db)):
    """Schickt sofort eine Nachricht an alle Geräte des Benutzers."""
    abos = s.query(PushAbo).filter(PushAbo.user_id == user.id).all()
    if not abos:
        raise HTTPException(400, "Für dieses Konto ist kein Gerät angemeldet")
    erfolge, fehler = 0, []
    for abo in abos:
        ok, hinweis = push.senden(abo, "Grünzeug", "Die Erinnerungen sind eingerichtet.", "test")
        if ok:
            erfolge += 1
        elif hinweis == "abgemeldet":
            s.delete(abo)
        else:
            fehler.append(hinweis)
    s.commit()
    if not erfolge:
        raise HTTPException(502, "Versand fehlgeschlagen: " + ("; ".join(fehler) or "kein Gerät mehr angemeldet"))
    return {"gesendet": erfolge}

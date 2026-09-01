"""Web-Push für Grünzeug.

Hält die Push-Abos je Benutzer und verschickt die Erinnerungen. Die
VAPID-Schlüssel werden beim ersten Start erzeugt und in vapid.json abgelegt –
sie bleiben damit über Neustarts hinweg gleich, was Bedingung dafür ist, dass
bestehende Abos weiter funktionieren.

Der Versand wird von cron.py angestoßen, nicht von der App.

© 2026 Torsten Michaely – Alle Rechte vorbehalten
"""
from __future__ import annotations

import base64
import json
import os
from datetime import datetime, timezone

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String

BASIS = os.path.dirname(os.path.abspath(__file__))
VAPID_DATEI = os.environ.get("GRUENZEUG_VAPID", os.path.join(BASIS, "vapid.json"))
# pywebpush kann mit einem PEM-*String* nichts anfangen: es reicht ihn an
# Vapid.from_string() weiter, das base64-kodiertes DER erwartet. Mit einem
# Dateipfad greift dagegen Vapid.from_file(), und das liest PEM.
VAPID_PEM = os.path.splitext(VAPID_DATEI)[0] + "_private.pem"
# Pflichtangabe des Web-Push-Protokolls: Kontakt des Absenders
VAPID_KONTAKT = os.environ.get("GRUENZEUG_VAPID_MAIL", "mailto:info@michaely.de")


def _b64(roh: bytes) -> str:
    """URL-sicheres Base64 ohne Auffüllzeichen, wie es Web Push verlangt."""
    return base64.urlsafe_b64encode(roh).decode().rstrip("=")


def _pem_sicherstellen(pem: str) -> None:
    """Legt die PEM-Datei an, die pywebpush als Pfad bekommt."""
    if not os.path.exists(VAPID_PEM):
        with open(VAPID_PEM, "w", encoding="utf-8") as f:
            f.write(pem)
        os.chmod(VAPID_PEM, 0o600)


def schluessel_laden() -> dict:
    """Liest das VAPID-Schlüsselpaar, erzeugt es beim ersten Aufruf."""
    if os.path.exists(VAPID_DATEI):
        with open(VAPID_DATEI, encoding="utf-8") as f:
            daten = json.load(f)
        _pem_sicherstellen(daten["private_pem"])
        return daten

    privat = ec.generate_private_key(ec.SECP256R1())
    oeffentlich = privat.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    pem = privat.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()

    daten = {"public": _b64(oeffentlich), "private_pem": pem}
    with open(VAPID_DATEI, "w", encoding="utf-8") as f:
        json.dump(daten, f)
    os.chmod(VAPID_DATEI, 0o600)
    _pem_sicherstellen(pem)
    return daten


def modell_anlegen(Base):
    """Definiert die Abo-Tabelle auf der Basis des Haupt-Moduls."""

    class PushAbo(Base):
        __tablename__ = "push_abo"
        id = Column(Integer, primary_key=True)
        user_id = Column(Integer, ForeignKey("user.id"), nullable=False)
        endpoint = Column(String(500), unique=True, nullable=False)
        p256dh = Column(String(200), nullable=False)
        auth = Column(String(100), nullable=False)
        zeit = Column(String(5), nullable=False, default="09:00")   # HH:MM, lokale Zeit
        zuletzt = Column(String(10), nullable=False, default="")    # ISO-Datum des letzten Versands
        nicht_vor = Column(String(20), nullable=False, default="")   # ISO-Zeit, bis dahin nicht senden
        # Eigene Merkspalte: Die Frostwarnung laeuft neben der taeglichen
        # Erinnerung, sonst faellt eine von beiden aus.
        frost_zuletzt = Column(String(20), nullable=False, default="")
        rueckblick_zuletzt = Column(String(20), nullable=False, default="")
        erstellt = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    return PushAbo


def senden(abo, titel: str, text: str, marke: str = "giessen") -> tuple[bool, str]:
    """Verschickt eine Nachricht an ein Abo.

    Rückgabe (erfolg, hinweis). Bei 404/410 gilt das Abo als abgemeldet –
    der Aufrufer sollte es dann löschen.
    """
    from pywebpush import WebPushException, webpush

    schluessel_laden()   # stellt vapid.json und die PEM-Datei sicher
    try:
        webpush(
            subscription_info={
                "endpoint": abo.endpoint,
                "keys": {"p256dh": abo.p256dh, "auth": abo.auth},
            },
            data=json.dumps({"title": titel, "body": text, "tag": marke}, ensure_ascii=False),
            vapid_private_key=VAPID_PEM,
            vapid_claims={"sub": VAPID_KONTAKT},
            ttl=43200,
        )
        return True, "ok"
    except WebPushException as e:
        code = getattr(e.response, "status_code", None)
        if code in (404, 410):
            return False, "abgemeldet"
        return False, f"Fehler {code}: {e}"
    except Exception as e:  # Netzfehler und Ähnliches
        return False, str(e)

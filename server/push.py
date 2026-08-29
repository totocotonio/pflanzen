"""Web-Push für Grünzeug.

Hält die Push-Abos je Benutzer und verschickt die Erinnerungen. Die
VAPID-Schlüssel werden beim ersten Start erzeugt und in vapid.json abgelegt –
sie bleiben damit über Neustarts hinweg gleich, was Bedingung dafür ist, dass
bestehende Abos weiter funktionieren.

Der Versand wird von cron.py angestoßen, nicht von der App.
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
# Pflichtangabe des Web-Push-Protokolls: Kontakt des Absenders
VAPID_KONTAKT = os.environ.get("GRUENZEUG_VAPID_MAIL", "mailto:info@michaely.de")


def _b64(roh: bytes) -> str:
    """URL-sicheres Base64 ohne Auffüllzeichen, wie es Web Push verlangt."""
    return base64.urlsafe_b64encode(roh).decode().rstrip("=")


def schluessel_laden() -> dict:
    """Liest das VAPID-Schlüsselpaar, erzeugt es beim ersten Aufruf."""
    if os.path.exists(VAPID_DATEI):
        with open(VAPID_DATEI, encoding="utf-8") as f:
            return json.load(f)

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
        erstellt = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    return PushAbo


def senden(abo, titel: str, text: str, marke: str = "giessen") -> tuple[bool, str]:
    """Verschickt eine Nachricht an ein Abo.

    Rückgabe (erfolg, hinweis). Bei 404/410 gilt das Abo als abgemeldet –
    der Aufrufer sollte es dann löschen.
    """
    from pywebpush import WebPushException, webpush

    schluessel = schluessel_laden()
    try:
        webpush(
            subscription_info={
                "endpoint": abo.endpoint,
                "keys": {"p256dh": abo.p256dh, "auth": abo.auth},
            },
            data=json.dumps({"title": titel, "body": text, "tag": marke}, ensure_ascii=False),
            vapid_private_key=schluessel["private_pem"],
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

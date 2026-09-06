"""Unveränderliche, kontogebundene Bilder für den kompakten Geräte-Sync."""
import copy
import hashlib
import re

from fastapi import HTTPException
from sqlalchemy.dialects.sqlite import insert

PREFIX = "gzbild:"
MAX_BILD = 8 * 1024 * 1024


def felder(daten):
    """Nur bekannte Bildfelder; Notizen und sonstige Texte bleiben unverändert."""
    for pflanze in daten.get("plants", []):
        if "foto" in pflanze:
            yield pflanze, "foto"
        for foto in pflanze.get("fotos") or []:
            if "bild" in foto:
                yield foto, "bild"
    settings = daten.get("settings") or {}
    for name in ("avatarFoto", "hintergrundFoto"):
        if name in settings:
            yield settings, name


def kennung(inhalt):
    return hashlib.sha256(inhalt.encode("utf-8")).hexdigest()


def pruefe_id(id_):
    if not re.fullmatch(r"[0-9a-f]{64}", id_):
        raise HTTPException(400, "Ungültige Bildkennung")


def ablegen(s, modell, user_id, inhalt):
    id_ = kennung(inhalt)
    s.execute(insert(modell).values(user_id=user_id, id=id_, inhalt=inhalt)
              .on_conflict_do_nothing(index_elements=["user_id", "id"]))
    return id_


def kompakt(daten, s, modell, user_id):
    """Alte Inline-Bilder deduplizieren; Verweise dürfen nur eigene Bilder nennen."""
    kopie = copy.deepcopy(daten)
    for objekt, feld in felder(kopie):
        wert = objekt[feld]
        if not isinstance(wert, str):
            continue
        if wert.startswith("data:image/"):
            objekt[feld] = PREFIX + ablegen(s, modell, user_id, wert)
        elif wert.startswith(PREFIX):
            id_ = wert[len(PREFIX):]
            pruefe_id(id_)
            if s.get(modell, (user_id, id_)) is None:
                raise HTTPException(422, "Ein benötigtes Bild fehlt. Bitte erneut synchronisieren.")
    return kopie


def inline(daten, s, modell, user_id):
    """Kompatible Antwort für ältere Clients und vollständige JSON-Backups."""
    kopie = copy.deepcopy(daten)
    cache = {}
    for objekt, feld in felder(kopie):
        wert = objekt[feld]
        if isinstance(wert, str) and wert.startswith(PREFIX):
            id_ = wert[len(PREFIX):]
            if id_ not in cache:
                bild = s.get(modell, (user_id, id_))
                if bild is None:
                    raise HTTPException(500, "Ein gespeichertes Bild fehlt")
                cache[id_] = bild.inhalt
            objekt[feld] = cache[id_]
    return kopie

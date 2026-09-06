"""Sync-Regressionen mit isolierter SQLite-Datei; keine Produktivdaten/Push."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

TEMP = tempfile.TemporaryDirectory(prefix="gruenzeug-tests-")
os.environ["GRUENZEUG_DB"] = str(Path(TEMP.name) / "test.db")
sys.path.insert(0, os.environ.get("SERVER_SOURCE", str(Path(__file__).resolve().parents[1] / "server")))
import main
from fastapi import HTTPException
from fastapi.testclient import TestClient


def payload(name):
    return {"plants": [{"id": name}], "logs": [], "settings": {}}


class SyncTests(unittest.TestCase):
    def setUp(self):
        main.Base.metadata.drop_all(main.engine)
        main.Base.metadata.create_all(main.engine)
        with main.SessionLocal() as s:
            s.add(main.User(id=1, name="test", passwort_hash="unused"))
            s.add(main.Sitzung(token="test-token", user_id=1))
            s.commit()

    def write(self, rev, name):
        with main.SessionLocal() as s:
            return main.daten_speichern(main.SyncDaten(rev=rev, daten=payload(name)),
                                       SimpleNamespace(id=1), s)

    def concurrent(self, rev):
        barrier = threading.Barrier(2)
        def send(name):
            barrier.wait(timeout=5)
            try:
                return 200, self.write(rev, name)
            except HTTPException as error:
                return error.status_code, error.detail
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(send, ["a", "b"]))
        self.assertEqual(sorted(r[0] for r in results), [200, 409])
        with main.SessionLocal() as s:
            stored = s.get(main.Datensatz, 1)
            self.assertEqual(stored.rev, rev + 1)
            conflict = next(body for status, body in results if status == 409)
            self.assertEqual(conflict["daten"], json.loads(stored.inhalt))

    def test_concurrent_first_upload(self):
        self.concurrent(0)

    def test_concurrent_update(self):
        self.write(0, "original")
        self.concurrent(1)
        with main.SessionLocal() as s:
            versions = s.query(main.Version).all()
            self.assertEqual(len(versions), 1)
            self.assertEqual(json.loads(versions[0].inhalt), payload("original"))

    def test_stale_session_cannot_overwrite_new_revision(self):
        self.write(0, "original")
        with main.SessionLocal() as stale:
            cached = stale.get(main.Datensatz, 1)
            self.write(1, "other-device")
            self.assertEqual(cached.rev, 1)
            with self.assertRaises(HTTPException) as caught:
                main.daten_speichern(main.SyncDaten(rev=1, daten=payload("stale")),
                                    SimpleNamespace(id=1), stale)
            self.assertEqual(caught.exception.status_code, 409)
            self.assertEqual(caught.exception.detail["rev"], 2)

    def test_restore_advances_revision_and_preserves_previous_state(self):
        self.write(0, "original")
        self.write(1, "changed")
        with main.SessionLocal() as s:
            version_id = s.query(main.Version).first().id
            result = main.version_wiederherstellen(version_id, SimpleNamespace(id=1), s)
            self.assertEqual(result, {"rev": 3, "daten": payload("original")})
            versions = [json.loads(v.inhalt) for v in s.query(main.Version).all()]
            self.assertIn(payload("changed"), versions)
        with self.assertRaises(HTTPException) as caught:
            self.write(2, "late-upload")
        self.assertEqual(caught.exception.status_code, 409)

    def test_http_roundtrip_and_conflict(self):
        with TestClient(main.app) as client:
            client.cookies.set(main.COOKIE, "test-token")
            first = client.put("/api/data", json={"rev": 0, "daten": payload("first")})
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json(), {"rev": 1})
            second = client.put("/api/data", json={"rev": 0, "daten": payload("stale")})
            self.assertEqual(second.status_code, 409)
            self.assertEqual(client.get("/api/data").json()["daten"], payload("first"))

    def test_unauthenticated_upload_is_rejected(self):
        with TestClient(main.app) as client:
            self.assertEqual(client.put("/api/data", json={"daten": payload("x")}).status_code, 401)

    def test_expired_session_is_rejected(self):
        with main.SessionLocal() as s:
            session = s.get(main.Sitzung, "test-token")
            session.letzter_zugriff = datetime.now(timezone.utc) - timedelta(days=91)
            s.commit()
        with TestClient(main.app) as client:
            client.cookies.set(main.COOKIE, "test-token")
            self.assertEqual(client.put("/api/data", json={"daten": payload("x")}).status_code, 401)

    def test_other_users_version_is_inaccessible(self):
        self.write(0, "a"); self.write(1, "b")
        with main.SessionLocal() as s:
            version_id = s.query(main.Version).first().id
            with self.assertRaises(HTTPException) as caught:
                main.version_wiederherstellen(version_id, SimpleNamespace(id=2), s)
            self.assertEqual(caught.exception.status_code, 404)


def tearDownModule():
    main.engine.dispose()
    TEMP.cleanup()


if __name__ == "__main__":
    unittest.main()

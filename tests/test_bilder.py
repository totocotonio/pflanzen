"""Bildtransfer, Altclients, Konto-Isolation und verlustfreie Migration."""
import json
import unittest

from fastapi.testclient import TestClient
import test_sync
import bilder
import bilder_migration

main = test_sync.main
FOTO = "data:image/jpeg;base64," + "YWJj" * 10000
NEU = "data:image/jpeg;base64,ZGVm"


def bestand(foto=FOTO):
    return {"plants": [{"id": "p1", "foto": foto, "fotos": [{"id": "g1", "bild": foto}]}],
            "settings": {"avatarFoto": foto, "hintergrundFoto": foto}, "logs": []}


class BildTests(unittest.TestCase):
    def setUp(self):
        test_sync.SyncTests.setUp(self)
        self.client = TestClient(main.app)
        self.client.cookies.set(main.COOKIE, "test-token")

    def tearDown(self):
        self.client.close()

    def put(self, daten, rev=0, kompakt=False):
        return self.client.put("/api/data" + ("?bilder=referenzen" if kompakt else ""),
                               json={"rev": rev, "daten": daten})

    def test_legacy_upload_deduplicated_and_legacy_read_unchanged(self):
        self.assertEqual(self.put(bestand()).status_code, 200)
        self.assertEqual(self.client.get("/api/data").json()["daten"], bestand())
        compact = self.client.get("/api/data?bilder=referenzen").json()
        self.assertEqual(compact["daten"]["plants"][0]["foto"], bilder.PREFIX + bilder.kennung(FOTO))
        self.assertLess(len(json.dumps(compact)), 1500)
        with main.SessionLocal() as s:
            self.assertEqual(s.query(main.Bild).count(), 1)

    def test_missing_image_cannot_commit_metadata(self):
        id_ = bilder.kennung(FOTO)
        refs = bestand(bilder.PREFIX + id_)
        self.assertEqual(self.put(refs, kompakt=True).status_code, 422)
        self.assertEqual(self.client.get("/api/data").json()["rev"], 0)
        self.assertEqual(self.client.post("/api/bilder/abgleichen", json={"ids": [id_]}).json(), {"fehlen": [id_]})
        self.assertEqual(self.client.put("/api/bilder/" + id_, json={"inhalt": NEU}).status_code, 422)
        self.assertEqual(self.client.put("/api/bilder/" + id_, json={"inhalt": FOTO}).status_code, 200)
        self.assertEqual(self.put(refs, kompakt=True).status_code, 200)
        self.assertEqual(self.client.get("/api/data").json()["daten"], bestand())

    def test_metadata_changes_reuse_images(self):
        self.put(bestand())
        compact = self.client.get("/api/data?bilder=referenzen").json()
        compact["daten"]["plants"][0]["letzt"] = "2026-09-06"
        self.assertEqual(self.put(compact["daten"], 1, True).json(), {"rev": 2})
        self.assertEqual(self.client.post("/api/bilder/abgleichen", json={"ids": [bilder.kennung(FOTO)]}).json(), {"fehlen": []})
        with main.SessionLocal() as s:
            self.assertEqual(s.query(main.Bild).count(), 1)

    def test_delete_and_restore_preserves_historical_image(self):
        self.put(bestand())
        self.put(bestand(None), 1)
        self.assertIsNone(self.client.get("/api/data").json()["daten"]["plants"][0]["foto"])
        id_ = self.client.get("/api/versionen").json()["versionen"][0]["id"]
        restored = self.client.post(f"/api/versionen/{id_}/wiederherstellen?bilder=referenzen")
        self.assertEqual(restored.status_code, 200)
        self.assertTrue(restored.json()["daten"]["plants"][0]["foto"].startswith(bilder.PREFIX))
        self.assertEqual(self.client.get("/api/data").json()["daten"], bestand())
        self.assertEqual(self.client.get("/api/bilder/" + bilder.kennung(FOTO)).json()["inhalt"], FOTO)

    def test_conflict_formats_for_old_and_new_clients(self):
        self.put(bestand())
        old = self.put(bestand(NEU))
        new = self.put(bestand(NEU), kompakt=True)
        self.assertEqual(old.status_code, 409)
        self.assertEqual(new.status_code, 409)
        self.assertEqual(old.json()["detail"]["daten"], bestand())
        self.assertEqual(new.json()["detail"]["daten"]["plants"][0]["foto"], bilder.PREFIX + bilder.kennung(FOTO))

    def test_media_is_private_to_own_account(self):
        self.put(bestand())
        with main.SessionLocal() as s:
            s.add(main.User(id=2, name="other", passwort_hash="unused"))
            s.add(main.Sitzung(token="other-token", user_id=2)); s.commit()
        self.client.cookies.set(main.COOKIE, "other-token")
        id_ = bilder.kennung(FOTO)
        self.assertEqual(self.client.get("/api/bilder/" + id_).status_code, 404)
        self.assertEqual(self.client.post("/api/bilder/abgleichen", json={"ids": [id_]}).json(), {"fehlen": [id_]})
        self.assertEqual(self.put(bestand(bilder.PREFIX + id_), kompakt=True).status_code, 422)
        self.client.cookies.clear()
        self.assertEqual(self.client.get("/api/bilder/" + id_).status_code, 401)

    def test_migration_roundtrip_and_repeated_execution(self):
        with main.SessionLocal() as s:
            s.add(main.Datensatz(user_id=1, inhalt=json.dumps(bestand()), rev=7))
            s.add(main.Version(user_id=1, inhalt=json.dumps(bestand(NEU)), rev=6, pflanzen=1))
            s.commit()
        self.assertEqual(bilder_migration.migrieren(True), 2)
        self.assertEqual(bilder_migration.migrieren(True), 2)
        self.assertEqual(self.client.get("/api/data").json()["daten"], bestand())
        with main.SessionLocal() as s:
            self.assertEqual(s.get(main.Datensatz, 1).rev, 7)
            self.assertEqual(s.query(main.Bild).count(), 2)
        self.assertEqual(bilder_migration.migrieren(False), 2)
        with main.SessionLocal() as s:
            self.assertEqual(json.loads(s.get(main.Datensatz, 1).inhalt), bestand())
            self.assertEqual(json.loads(s.query(main.Version).first().inhalt), bestand(NEU))

    def test_identical_image_upload_is_idempotent(self):
        id_ = bilder.kennung(FOTO)
        for _ in range(2):
            self.assertEqual(self.client.put("/api/bilder/" + id_, json={"inhalt": FOTO}).status_code, 200)
        with main.SessionLocal() as s:
            self.assertEqual(s.query(main.Bild).count(), 1)

from contextlib import closing
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import patch
import zipfile

from flask import Flask
from user_backup_system import UserBackupService, MANIFEST, INVENTORY
from portable_content import UserContentImporter
from ui.backups import register_backup_routes


SCHEMA = """
CREATE TABLE sets(set_code TEXT PRIMARY KEY, set_name TEXT);
CREATE TABLE chaos_cards(card_uuid TEXT PRIMARY KEY, set_code TEXT REFERENCES sets(set_code), card_name TEXT, collector_number TEXT, scryfall_id TEXT, image_cache_path TEXT);
CREATE TABLE cards(card_key TEXT PRIMARY KEY, name TEXT);
CREATE TABLE app_config(config_key TEXT PRIMARY KEY, config_value TEXT NOT NULL);
CREATE TABLE selected_sets(set_code TEXT PRIMARY KEY REFERENCES sets(set_code));
CREATE TABLE chaos_session_state(state_key TEXT PRIMARY KEY, state_value TEXT);
CREATE TABLE alternate_image_scopes(image_scope_id TEXT PRIMARY KEY, revision INTEGER);
CREATE TABLE alternate_sources(alternate_source_id INTEGER PRIMARY KEY AUTOINCREMENT, card_uuid TEXT, local_image_path TEXT, fullbleed_image_path TEXT);
CREATE TABLE alternate_image_isolation(alternate_source_id INTEGER PRIMARY KEY AUTOINCREMENT, image_scope_id TEXT REFERENCES alternate_image_scopes(image_scope_id), original_alternate_source_id INTEGER, card_uuid TEXT, local_image_path TEXT);
CREATE TABLE upscaled_images(upscaled_image_id INTEGER PRIMARY KEY AUTOINCREMENT, card_uuid TEXT, alternate_source_id INTEGER, source_image_scope_id TEXT, output_image_path TEXT, source_image_path TEXT);
CREATE TABLE custom_draft_sets(set_code TEXT PRIMARY KEY REFERENCES sets(set_code), alternate_image_scope_id TEXT REFERENCES alternate_image_scopes(image_scope_id), icon_svg_path TEXT, card_back_key TEXT);
CREATE TABLE custom_draft_set_cards(custom_set_card_id INTEGER PRIMARY KEY AUTOINCREMENT, set_code TEXT REFERENCES custom_draft_sets(set_code), card_uuid TEXT REFERENCES chaos_cards(card_uuid), UNIQUE(set_code,card_uuid));
CREATE TABLE custom_draft_pack_slots(custom_pack_slot_id INTEGER PRIMARY KEY AUTOINCREMENT, set_code TEXT REFERENCES custom_draft_sets(set_code), slot_number INTEGER);
CREATE TABLE chaos_booster_variants(set_code TEXT, booster_name TEXT, booster_index INTEGER, PRIMARY KEY(set_code,booster_name,booster_index));
CREATE TABLE chaos_campaigns(campaign_id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_name TEXT UNIQUE);
CREATE TABLE chaos_players(player_id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER REFERENCES chaos_campaigns(campaign_id), player_name TEXT UNIQUE, portrait_image_path TEXT);
CREATE TABLE chaos_draft_games(draft_game_id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER REFERENCES chaos_campaigns(campaign_id));
CREATE TABLE tracked_chaos_packs(tracked_pack_id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER REFERENCES chaos_campaigns(campaign_id), pack_tracking_code TEXT UNIQUE, set_code TEXT, alternate_image_scope_id TEXT, source_json TEXT);
CREATE TABLE tracked_chaos_pack_cards(tracked_pack_card_id INTEGER PRIMARY KEY AUTOINCREMENT, tracked_pack_id INTEGER REFERENCES tracked_chaos_packs(tracked_pack_id), card_uuid TEXT);
CREATE TABLE tracked_chaos_pack_campaigns(tracked_pack_campaign_id INTEGER PRIMARY KEY AUTOINCREMENT, tracked_pack_id INTEGER REFERENCES tracked_chaos_packs(tracked_pack_id), campaign_key TEXT, campaign_id INTEGER REFERENCES chaos_campaigns(campaign_id), UNIQUE(tracked_pack_id,campaign_key));
CREATE TABLE tracked_chaos_pack_openings(opening_id INTEGER PRIMARY KEY AUTOINCREMENT, tracked_pack_id INTEGER REFERENCES tracked_chaos_packs(tracked_pack_id), opened_by_player_id INTEGER REFERENCES chaos_players(player_id), campaign_id INTEGER, draft_game_id INTEGER);
CREATE TABLE decks(deck_id INTEGER PRIMARY KEY AUTOINCREMENT, deck_name TEXT, campaign_id INTEGER, player_id INTEGER, alternate_image_scope_id TEXT, deck_art_json TEXT, card_back_key TEXT, source_type TEXT, source_id INTEGER);
CREATE TABLE deck_cards(deck_card_id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id INTEGER REFERENCES decks(deck_id), card_uuid TEXT, quantity INTEGER);
CREATE TABLE deck_builder_layouts(deck_builder_layout_id INTEGER PRIMARY KEY AUTOINCREMENT, deck_id INTEGER REFERENCES decks(deck_id), layout_json TEXT);
CREATE TABLE card_prices(card_key TEXT, price REAL);
CREATE TABLE unrelated_table(id INTEGER);
"""


class PortableBackupTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / "source"
        self.target = Path(self.directory.name) / "target"
        for root in (self.source, self.target):
            root.mkdir()
            with closing(sqlite3.connect(root / "cards.db")) as connection:
                connection.executescript(SCHEMA)
        self.exporter = UserBackupService(self.source, self.source, "source-version")
        self.importer = UserBackupService(self.target, self.target, "newer-compatible-version")
        self._seed(self.source, "Source")
        self._seed(self.target, "Existing")

    def _file(self, root, relative, data=b"custom image"):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def _seed(self, root, label):
        self._file(root, "data/alternate_sources/custom.png")
        self._file(root, "data/alternate_sources/isolation/scope/art.png", b"isolated art")
        self._file(root, "data/upscaled_scryfall/output.png", b"upscaled art")
        self._file(root, "data/chaos_image_cache/base.jpg", b"base scryfall image")
        self._file(root, "data/custom_set_icons/icon.svg", b"<svg>custom</svg>")
        self._file(root, "data/img/card_backs/back.png")
        self._file(root, "data/img/card_backs/fullbleed/back.png", b"bleed back")
        self._file(root, "data/deck_art_generated/cover.png", b"exported deck cover")
        self._file(root, "data/campaign_player_portraits/player.png")
        with closing(sqlite3.connect(root / "cards.db")) as connection:
            connection.executescript("""
INSERT INTO sets VALUES ('TST','Official'),('MY^','Custom'),('BASE','Unreferenced');
INSERT INTO chaos_cards VALUES ('card-1','TST','Card','1','scryfall-1','data/chaos_image_cache/base.jpg');
INSERT INTO chaos_cards VALUES ('base-card','BASE','Unreferenced','2','scryfall-base',NULL);
INSERT INTO alternate_image_scopes VALUES ('scope',1);
INSERT INTO alternate_sources VALUES (1,'card-1','data/alternate_sources/custom.png',NULL);
INSERT INTO alternate_image_isolation VALUES (1,'scope',1,'card-1','data/alternate_sources/isolation/scope/art.png');
INSERT INTO upscaled_images VALUES (1,'card-1',1,'scope','output.png','data/chaos_image_cache/base.jpg');
INSERT INTO custom_draft_sets VALUES ('MY^','scope','../data/custom_set_icons/icon.svg','custom:back.png');
INSERT INTO custom_draft_set_cards VALUES (1,'MY^','card-1');
INSERT INTO custom_draft_pack_slots VALUES (1,'MY^',1);
INSERT INTO chaos_booster_variants VALUES ('MY^','play',0),('TST','play',0);
INSERT INTO chaos_campaigns VALUES (1,'Campaign');
INSERT INTO chaos_players VALUES (1,1,'Player','data/campaign_player_portraits/player.png');
INSERT INTO chaos_draft_games VALUES (1,1);
INSERT INTO tracked_chaos_packs VALUES (1,1,'TST.P.1234','MY^','scope','{"campaign_id":1,"tracked_pack_id":1,"pack_tracking_code":"TST.P.1234","cards":[{"card_uuid":"card-1","image_scope_id":"scope","alternate_source_id":1}],"opened_by_player_id":1}');
INSERT INTO tracked_chaos_pack_cards VALUES (1,1,'card-1');
INSERT INTO tracked_chaos_pack_campaigns VALUES (1,1,'1',1);
INSERT INTO tracked_chaos_pack_openings VALUES (1,1,1,1,1);
INSERT INTO deck_cards VALUES (1,1,'card-1',3);
INSERT INTO deck_builder_layouts VALUES (1,1,'{"deck_card_ids":[1]}');
INSERT INTO app_config VALUES ('selected_deck_id','1'),('card_back_key','custom:back.png');
INSERT INTO chaos_session_state VALUES ('selected_chaos_campaign_id','1');
INSERT INTO selected_sets VALUES ('MY^');
INSERT INTO card_prices VALUES ('base',100);
INSERT INTO unrelated_table VALUES (1);
""")
            connection.execute("INSERT INTO decks VALUES (1,?,1,1,'scope',NULL,'custom:back.png','standalone',NULL)", (label,))
            connection.commit()

    def _backup(self):
        return Path(self.exporter.create_backup()["zip_path"])

    def _row(self, query):
        with closing(sqlite3.connect(self.target / "cards.db")) as connection:
            connection.row_factory = sqlite3.Row
            return dict(connection.execute(query).fetchone())

    def test_merge_remaps_ids_json_scopes_and_custom_codes(self):
        result = self.importer.import_backup(self._backup())
        self.assertGreater(result["imported_rows"], 0)
        self.assertFalse(self.importer.pending.exists())
        self.assertEqual(self._row("SELECT * FROM decks WHERE deck_id=1")["deck_name"], "Existing")
        deck = self._row("SELECT * FROM decks WHERE deck_id=2")
        self.assertEqual(deck["deck_name"], "Source")
        self.assertEqual(deck["campaign_id"], 2)
        self.assertEqual(deck["player_id"], 2)
        self.assertNotEqual(deck["alternate_image_scope_id"], "scope")
        pack = self._row("SELECT * FROM tracked_chaos_packs WHERE tracked_pack_id=2")
        self.assertEqual(pack["set_code"], "MY_IMP2^")
        self.assertNotEqual(pack["pack_tracking_code"], "TST.P.1234")
        payload = json.loads(pack["source_json"])
        self.assertEqual(payload["campaign_id"], 2)
        self.assertEqual(payload["tracked_pack_id"], 2)
        self.assertEqual(payload["cards"][0]["image_scope_id"], deck["alternate_image_scope_id"])
        self.assertEqual(payload["cards"][0]["alternate_source_id"], 2)
        self.assertEqual(payload["pack_tracking_code"], pack["pack_tracking_code"])
        self.assertEqual(self._row("SELECT * FROM deck_cards WHERE deck_card_id=2")["deck_id"], 2)
        layout = self._row("SELECT * FROM deck_builder_layouts WHERE deck_builder_layout_id=2")
        self.assertEqual(json.loads(layout["layout_json"])["deck_card_ids"], [2])
        self.assertEqual(self._row("SELECT * FROM app_config WHERE config_key='selected_deck_id'")["config_value"], "2")
        self.assertEqual(self._row("SELECT * FROM tracked_chaos_pack_campaigns WHERE tracked_pack_campaign_id=2")["campaign_key"], "2")
        upscale = self._row("SELECT * FROM upscaled_images WHERE upscaled_image_id=2")
        self.assertIsNone(upscale["source_image_path"])
        self.assertEqual((self.target / "data/upscaled_scryfall" / upscale["output_image_path"]).read_bytes(), b"upscaled art")
        isolated = self._row("SELECT * FROM alternate_image_isolation WHERE alternate_source_id=2")
        self.assertEqual((self.target / isolated["local_image_path"]).read_bytes(), b"isolated art")
        self.assertTrue(deck["card_back_key"].startswith("custom:back_import_"))
        filename = deck["card_back_key"].split(":", 1)[1]
        self.assertTrue((self.target / "data/img/card_backs/fullbleed" / filename).is_file())
        with closing(sqlite3.connect(self.target / "cards.db")) as connection:
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_excludes_base_database_images_plugins_code_exports_and_defaults(self):
        for relative in ("plugins/model.bin", "plugins/plugin.py", "Export/file.png", "data/scryfall/cards.json", "static/css/custom.css", "static/js/custom.js", "data/image_cache/base.png"):
            self._file(self.source, relative, b"excluded")
        default = self._file(self.source, "print/templates/Default.ini", b"[Template]\r\nTemplate_ID=default\r\n")
        self._file(self.source, "backup_defaults.json", json.dumps({"files": {"print/templates/Default.ini": hashlib.sha256(default.read_bytes().replace(b"\r\n", b"\n")).hexdigest()}}).encode())
        with zipfile.ZipFile(self._backup()) as archive:
            names = archive.namelist()
            self.assertFalse(any("cards.db" in name or "model.bin" in name or "custom.css" in name or "base.png" in name or "Default.ini" in name for name in names))
            records = [json.loads(line) for line in archive.read("payload/records.jsonl").splitlines()]
            self.assertFalse(any(record["table"] in {"card_prices", "unrelated_table"} for record in records))
            self.assertFalse(any(record["row"].get("card_uuid") == "base-card" for record in records))
            self.assertFalse(any(record["table"] == "chaos_booster_variants" and record["row"]["set_code"] == "TST" for record in records))

    def test_templates_cutting_external_images_and_settings(self):
        self._file(self.source, "print/templates/Custom.ini", b"[Template]\nTemplate_ID = custom\n[Silhouette]\nRegistration_Background = assets/background.png\n")
        self._file(self.source, "print/templates/assets/background.png")
        self._file(self.source, "static/sil/Studio3/cut.svg", b"<svg>cut</svg>")
        self._file(self.source, "static/sil/Studio3/templates.json", b'{"version":1,"templates":[{"filename":"cut.svg","name":"Cut","print_template":"custom"}]}')
        external = self._file(Path(self.directory.name), "external/art.png", b"outside artwork")
        with closing(sqlite3.connect(self.source / "cards.db")) as connection:
            connection.execute("UPDATE decks SET deck_art_json=?", (json.dumps({"artwork_path": str(external)}),))
            connection.execute("INSERT INTO app_config VALUES ('print_template','custom')")
            connection.commit()
        self._file(self.source, "settings.json", b'{"paper":"A4","card_back_key":"custom:back.png"}')
        self._file(self.target, "settings.json", b'{"destination_only":true,"paper":"Letter"}')
        self.importer.import_backup(self._backup())
        deck = self._row("SELECT * FROM decks WHERE deck_id=2")
        self.assertEqual(Path(json.loads(deck["deck_art_json"])["artwork_path"]).read_bytes(), b"outside artwork")
        templates = list((self.target / "print/templates").glob("*.ini"))
        self.assertEqual(len(templates), 1)
        self.assertIn("custom_import_", templates[0].read_text())
        document = json.loads((self.target / "static/sil/Studio3/templates.json").read_text())
        entry = document["templates"][0]
        self.assertIn("_import_", entry["filename"])
        self.assertIn("custom_import_", entry["print_template"])
        settings = json.loads((self.target / "settings.json").read_text())
        self.assertTrue(settings["destination_only"])
        self.assertEqual(settings["paper"], "A4")

    def test_static_custom_icon_is_captured_and_served_without_overwriting_destination(self):
        self._file(self.source, "static/img/set_icons/MY.svg", b"<svg>source icon</svg>")
        self._file(self.target, "static/img/set_icons/MY.svg", b"<svg>existing icon</svg>")
        with closing(sqlite3.connect(self.source / "cards.db")) as connection:
            connection.execute("UPDATE custom_draft_sets SET icon_svg_path='img/set_icons/MY.svg'")
            connection.commit()
        self.importer.import_backup(self._backup())
        row = self._row("SELECT * FROM custom_draft_sets WHERE set_code='MY_IMP2^'")
        self.assertEqual((self.target / "static" / row["icon_svg_path"]).read_bytes(), b"<svg>source icon</svg>")
        self.assertEqual((self.target / "static/img/set_icons/MY.svg").read_bytes(), b"<svg>existing icon</svg>")

    def test_external_print_background_is_referenced_after_import(self):
        background = self._file(Path(self.directory.name), "external/background.png", b"outside print background")
        self._file(self.source, "print/templates/Custom.ini", f"[Template]\nTemplate_ID=custom\n[Silhouette]\nRegistration_Background={background}\n".encode())
        self.importer.import_backup(self._backup())
        import configparser
        parser = configparser.ConfigParser()
        template = next((self.target / "print/templates").glob("*.ini"))
        parser.read(template)
        imported_background = template.parent / parser.get("Silhouette", "Registration_Background")
        self.assertEqual(imported_background.read_bytes(), b"outside print background")

    def test_assets_with_identical_filenames_remain_distinct(self):
        first = self._file(Path(self.directory.name), "first/shared.png", b"first art")
        second = self._file(Path(self.directory.name), "second/shared.png", b"second art")
        with closing(sqlite3.connect(self.source / "cards.db")) as connection:
            connection.execute("UPDATE alternate_sources SET local_image_path=? WHERE alternate_source_id=1", (str(first),))
            connection.execute("INSERT INTO alternate_sources VALUES (2,'card-1',?,NULL)", (str(second),))
            connection.commit()
        self.importer.import_backup(self._backup())
        first_row = self._row("SELECT * FROM alternate_sources WHERE alternate_source_id=2")
        second_row = self._row("SELECT * FROM alternate_sources WHERE alternate_source_id=3")
        self.assertNotEqual(first_row["local_image_path"], second_row["local_image_path"])
        self.assertEqual(Path(first_row["local_image_path"]).read_bytes(), b"first art")
        self.assertEqual(Path(second_row["local_image_path"]).read_bytes(), b"second art")

    def test_uncommitted_interruption_recovers_files_and_settings(self):
        token = "a" * 32
        path = self.target / "data/alternate_sources/imports" / token / "art.png"
        settings = self._file(self.target, "settings.json", b'{"before":true}')
        self.importer.work.mkdir()
        self.importer.begin_import_journal(token, [path], [settings])
        path.parent.mkdir(parents=True)
        path.write_bytes(b"interrupted asset")
        settings.write_bytes(b'{"after":true}')
        self.importer.recover_import()
        self.assertFalse(path.exists())
        self.assertEqual(settings.read_bytes(), b'{"before":true}')
        self.assertFalse((self.importer.work / "import-journal.json").exists())

    def test_committed_interruption_keeps_imported_files_and_settings(self):
        token = "b" * 32
        path = self.target / "data/alternate_sources/imports" / token / "art.png"
        settings = self._file(self.target, "settings.json", b'{"before":true}')
        self.importer.work.mkdir()
        self.importer.begin_import_journal(token, [path], [settings])
        path.parent.mkdir(parents=True)
        path.write_bytes(b"committed asset")
        settings.write_bytes(b'{"after":true}')
        with closing(sqlite3.connect(self.target / "cards.db")) as connection:
            connection.execute("CREATE TABLE _user_backup_imports(import_token TEXT PRIMARY KEY, imported_at_utc TEXT)")
            connection.execute("INSERT INTO _user_backup_imports VALUES (?, 'now')", (token,))
            connection.commit()
        self.importer.recover_import()
        self.assertEqual(path.read_bytes(), b"committed asset")
        self.assertEqual(settings.read_bytes(), b'{"after":true}')

    def test_full_database_archive_rejected_without_modifying_destination(self):
        archive = self.source / "old.zip"
        with zipfile.ZipFile(archive, "w") as writer:
            writer.writestr(MANIFEST, json.dumps({"format": "deckadence_application_backup", "version": 2}))
            writer.writestr("payload/cards.db", b"old database")
        with self.assertRaisesRegex(ValueError, "cannot be merged"):
            self.importer.import_backup(archive)
        self.assertEqual(self._row("SELECT * FROM decks WHERE deck_id=1")["deck_name"], "Existing")

    def test_autoincrement_ids_are_not_reused_after_deleted_high_id(self):
        with closing(sqlite3.connect(self.target / "cards.db")) as connection:
            connection.execute("INSERT INTO decks(deck_id,deck_name) VALUES (100,'Deleted')")
            connection.execute("DELETE FROM decks WHERE deck_id=100")
            connection.commit()
        self.importer.import_backup(self._backup())
        self.assertEqual(self._row("SELECT * FROM decks WHERE deck_id=101")["deck_name"], "Source")

    def test_raw_upload_confirmation_and_cleanup(self):
        app = Flask(__name__)
        jobs = register_backup_routes(app, service=self.importer)
        client = app.test_client()
        content = self._backup().read_bytes()
        denied = client.post("/maintenance/backups/import", data=content, content_type="application/zip")
        self.assertEqual(denied.status_code, 400)
        response = client.post("/maintenance/backups/import", data=content, content_type="application/zip", headers={"X-Backup-Confirmation": "IMPORT"})
        self.assertEqual(response.status_code, 202)
        deadline = time.monotonic() + 10
        while jobs.busy and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(jobs.status()["state"], "complete", jobs.status())
        self.assertEqual(list(self.importer.work.glob("upload-*.zip")), [])

    def test_repeated_imports_never_overwrite_existing_entities(self):
        archive = self._backup()
        self.importer.import_backup(archive)
        self.importer.import_backup(archive)
        self.assertEqual(self._row("SELECT COUNT(*) AS total FROM decks")["total"], 3)
        self.assertEqual(self._row("SELECT COUNT(*) AS total FROM custom_draft_sets")["total"], 3)

    def test_failed_merge_rolls_back_database_assets_and_manifests(self):
        archive = self._backup()
        before = {path.relative_to(self.target).as_posix(): path.read_bytes() for path in self.target.rglob("*") if path.is_file()}
        with patch.object(UserContentImporter, "_import_rows", side_effect=ValueError("simulated failure")):
            with self.assertRaisesRegex(ValueError, "simulated"):
                self.importer.import_backup(archive)
        self.assertEqual(self._row("SELECT COUNT(*) AS total FROM decks")["total"], 1)
        after = {path.relative_to(self.target).as_posix(): path.read_bytes() for path in self.target.rglob("*") if path.is_file() and ".backup-work" not in path.parts}
        self.assertEqual(before, after)

    def _rewrite_zip(self, source, transform):
        result = self.source / "changed.zip"
        with zipfile.ZipFile(source) as original, zipfile.ZipFile(result, "w") as writer:
            for name in original.namelist():
                name, content = transform(name, original.read(name))
                writer.writestr(name, content)
        return result

    def test_corrupt_asset_rejected_before_merging(self):
        archive = self._rewrite_zip(self._backup(), lambda name, data: (name, b"x" * len(data) if name.endswith("custom.png") else data))
        with self.assertRaisesRegex(ValueError, "Checksum"):
            self.importer.import_backup(archive)
        self.assertEqual(self._row("SELECT COUNT(*) AS total FROM decks")["total"], 1)

    def test_unsafe_paths_rejected(self):
        archive = self._rewrite_zip(self._backup(), lambda name, data: ("payload/assets/../escape.png" if name.endswith("custom.png") else name, data))
        with self.assertRaisesRegex(ValueError, "unsafe"):
            self.importer.import_backup(archive)

    def test_missing_custom_asset_fails_export_without_partial_archive(self):
        (self.source / "data/alternate_sources/custom.png").unlink()
        with self.assertRaisesRegex(ValueError, "missing"):
            self._backup()
        self.assertEqual(list((self.source / "Backups").glob("*.partial")), [])

    def test_low_disk_space_fails_without_partial_archive(self):
        with patch("backup_system.shutil.disk_usage", return_value=type("Usage", (), {"free": 0})()):
            with self.assertRaisesRegex(ValueError, "space"):
                self._backup()
        self.assertEqual(list((self.source / "Backups").glob("*.partial")), [])

    def test_zip64_is_used_for_large_assets(self):
        self._file(self.source, "data/deck_art_generated/large.png", b"x" * 8192)
        with patch("zipfile.ZIP64_LIMIT", 1024):
            archive = self._backup()
        with zipfile.ZipFile(archive) as handle:
            self.assertGreaterEqual(next(item for item in handle.infolist() if item.filename.endswith("large.png")).extract_version, 45)

    def test_unsupported_destination_schema_fails_before_files_or_rows_change(self):
        archive = self._backup()
        with closing(sqlite3.connect(self.target / "cards.db")) as connection:
            connection.execute("DROP TABLE upscaled_images")
            connection.commit()
        with self.assertRaisesRegex(ValueError, "does not support"):
            self.importer.import_backup(archive)
        self.assertEqual(self._row("SELECT COUNT(*) AS total FROM decks")["total"], 1)
        self.assertFalse((self.target / "data/alternate_sources/imports").exists())

    def test_api_confirmation_progress_download_range_and_local_import(self):
        app = Flask(__name__)
        jobs = register_backup_routes(app, service=self.importer)
        client = app.test_client()
        archive = self._backup()
        self.assertEqual(client.post("/maintenance/backups/import", json={"archive_path": str(archive), "confirmation": "RESTORE"}).status_code, 400)
        response = client.post("/maintenance/backups/import", json={"archive_path": str(archive), "confirmation": "IMPORT"})
        self.assertEqual(response.status_code, 202)
        deadline = time.monotonic() + 10
        while jobs.busy and time.monotonic() < deadline:
            time.sleep(0.01)
        status = client.get("/maintenance/backups/status").json
        self.assertEqual(status["state"], "complete", status)
        self.assertIsNone(status["pending_restore"])
        response = client.post("/maintenance/backups/create", json={})
        self.assertEqual(response.status_code, 202)
        while jobs.busy and time.monotonic() < deadline:
            time.sleep(0.01)
        status = client.get("/maintenance/backups/status").json
        self.assertEqual(status["state"], "complete", status)
        downloaded = client.get(status["download_url"], headers={"Range": "bytes=0-31"})
        self.assertEqual(downloaded.status_code, 206)
        self.assertEqual(len(downloaded.data), 32)
        downloaded.close()


if __name__ == "__main__":
    unittest.main()

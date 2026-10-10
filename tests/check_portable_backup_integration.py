"""Real-schema/Flask integration in a child process with temporary runtime paths."""
from contextlib import closing
import json
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import zipfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def child(root):
    import paths
    repository = paths.RUNTIME_BASE_DIR
    for name, value in list(vars(paths).items()):
        if name != "BUNDLE_BASE_DIR" and isinstance(value, str) and value.startswith(repository):
            setattr(paths, name, str(root) + value[len(repository):])
    import app
    from db.database import initialize_database
    from db.deckdb import ensure_deck_schema, create_standalone_deck
    from db.draftdb import ensure_draft_testing_schema
    from db.externaldeckdb import ensure_external_deck_schema
    from db.upscalyingdb import ensure_upscaling_schema
    from db.helpdb import ensure_help_schema
    from modes.chaos import ensure_chaos_campaign_schema, ensure_campaign_player_schema, ensure_chaos_draft_game_schema, ensure_tracked_pack_campaign_schema
    initialize_database()
    for initialize in (ensure_deck_schema, ensure_draft_testing_schema, ensure_external_deck_schema, ensure_upscaling_schema, ensure_help_schema,
                       ensure_chaos_campaign_schema, ensure_campaign_player_schema, ensure_chaos_draft_game_schema, ensure_tracked_pack_campaign_schema):
        initialize()
    create_standalone_deck("Portable integration deck")
    art = root / "data/alternate_sources/fixture.png"
    art.parent.mkdir(parents=True, exist_ok=True)
    art.write_bytes(b"custom fixture")
    upscale = root / "data/upscaled_scryfall/fixture.png"
    upscale.parent.mkdir(parents=True, exist_ok=True)
    upscale.write_bytes(b"upscaled fixture")
    icon = root / 'static/img/set_icons/custom.svg'
    icon.parent.mkdir(parents=True, exist_ok=True)
    icon.write_bytes(b'<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    with closing(sqlite3.connect(root / "cards.db")) as connection:
        connection.executescript("""
INSERT INTO sets(set_code,set_name) VALUES ('TST','Test set'),('MY^','Custom test set');
INSERT INTO chaos_cards(card_uuid,set_code,card_name) VALUES ('portable-card','TST','Portable card');
INSERT INTO alternate_image_scopes(image_scope_id,created_at_utc) VALUES ('scope-fixture','2026-10-10');
INSERT INTO alternate_sources(source_name,source_type,card_uuid,local_image_path,created_at_utc) VALUES ('Custom art','upload','portable-card','data/alternate_sources/fixture.png','2026-10-10');
INSERT INTO alternate_image_isolation(image_scope_id,original_alternate_source_id,source_name,source_type,card_uuid,local_image_path,created_at_utc) VALUES ('scope-fixture',1,'Isolated art','upload','portable-card','data/alternate_sources/fixture.png','2026-10-10');
INSERT INTO custom_draft_sets(set_code,created_at_utc,alternate_image_scope_id) VALUES ('MY^','2026-10-10','scope-fixture');
INSERT INTO custom_draft_set_cards(set_code,card_uuid,added_at_utc) VALUES ('MY^','portable-card','2026-10-10');
INSERT INTO deck_cards(deck_id,card_uuid,card_name,created_at_utc) VALUES (1,'portable-card','Portable card','2026-10-10');
INSERT INTO chaos_campaigns(campaign_name,created_at_utc) VALUES ('Portable campaign','2026-10-10');
INSERT INTO chaos_players(player_name,campaign_id,created_at_utc) VALUES ('Portable player',1,'2026-10-10');
INSERT INTO chaos_draft_games(campaign_id,started_at_utc) VALUES (1,'2026-10-10');
INSERT INTO tracked_chaos_packs(pack_tracking_code,set_code,booster_name,booster_index,pack_display_name,added_at_utc,campaign_id) VALUES ('TST.P.TEST','TST','play',0,'Portable pack','2026-10-10',1);
INSERT INTO tracked_chaos_pack_cards(tracked_pack_id,card_order,card_uuid,card_name) VALUES (1,0,'portable-card','Portable card');
INSERT INTO tracked_chaos_pack_campaigns(tracked_pack_id,campaign_key,campaign_id,added_at_utc) VALUES (1,'1',1,'2026-10-10');
INSERT INTO tracked_chaos_pack_openings(tracked_pack_id,opened_at_utc,opened_by_player_id,campaign_id,draft_game_id) VALUES (1,'2026-10-10',1,1,1);
INSERT INTO draft_test_sessions(campaign_id,created_at_utc) VALUES (1,'2026-10-10');
INSERT INTO draft_test_players(draft_test_id,seat_index,display_name,campaign_player_id,created_at_utc) VALUES (1,0,'Draft player',1,'2026-10-10');
INSERT INTO draft_test_pack_pool(draft_test_id,tracked_pack_id,pool_order,created_at_utc) VALUES (1,1,0,'2026-10-10');
INSERT INTO draft_test_packs(draft_test_id,pack_number,original_seat_index,current_seat_index,tracked_pack_id,pack_tracking_code,created_at_utc) VALUES (1,1,0,0,1,'TST.P.TEST','2026-10-10');
INSERT INTO draft_test_pack_cards(draft_test_pack_id,draft_test_id,card_order,card_uuid,card_name,image_scope_id) VALUES (1,1,0,'portable-card','Portable card','scope-fixture');
INSERT INTO draft_test_picks(draft_test_id,draft_test_player_id,draft_test_pack_id,draft_test_pack_card_id,seat_index,pack_number,pick_number,card_uuid,card_name,picked_at_utc) VALUES (1,1,1,1,0,1,1,'portable-card','Portable card','2026-10-10');
UPDATE draft_test_sessions SET current_human_pack_id=1;
UPDATE deck_cards SET source_type='draft_pick', source_id=1, source_item_id=1;
UPDATE decks SET source_type='draft_test', source_id=1;
INSERT INTO upscaled_images(card_uuid,source_type,alternate_source_id,source_image_scope_id,output_image_path,plugin_id,created_at_utc) VALUES ('portable-card','alternate',1,'scope-fixture','fixture.png','fixture-plugin','2026-10-10');
UPDATE decks SET alternate_image_scope_id='scope-fixture';
UPDATE custom_draft_sets SET icon_svg_path='img/set_icons/custom.svg';
UPDATE sets SET local_icon_svg_path='img/set_icons/custom.svg' WHERE set_code='MY^';
""")
        connection.commit()
    client = app.app.test_client()
    response = client.get("/config")
    assert response.status_code == 200, response.status_code
    assert b'applicationBackupModal' in response.data and b'Export User Content' in response.data
    response = client.post("/maintenance/backups/create", json={})
    assert response.status_code == 202, response.json
    jobs = app.application_backup_jobs
    deadline = time.monotonic() + 60
    while jobs.busy and time.monotonic() < deadline:
        time.sleep(0.05)
    status = jobs.status()
    assert status['state'] == 'complete', status
    archive = status['result']['zip_path']
    with zipfile.ZipFile(archive) as handle:
        assert not any(name.endswith('cards.db') or name.endswith('.js') or name.endswith('.css') for name in handle.namelist())
        manifest = json.loads(handle.read('backup_manifest.json'))
        assert manifest['format'] == 'deckadence_user_content'
    target = root / 'destination'
    target.mkdir()
    shutil.copytree(root / 'data', target / 'data')
    with closing(sqlite3.connect(root / 'cards.db')) as source, closing(sqlite3.connect(target / 'cards.db')) as destination:
        source.backup(destination)
    from user_backup_system import UserBackupService
    imported = UserBackupService(target, Path(repository), 'compatible-newer-version').import_backup(archive)
    with closing(sqlite3.connect(target / 'cards.db')) as connection:
        assert connection.execute('SELECT COUNT(*) FROM decks').fetchone()[0] == 2
        assert connection.execute('PRAGMA foreign_key_check').fetchall() == []
        assert connection.execute('SELECT COUNT(*) FROM custom_draft_sets').fetchone()[0] == 2
        assert connection.execute('SELECT source_image_scope_id FROM upscaled_images WHERE upscaled_image_id=2').fetchone()[0] != 'scope-fixture'
        assert connection.execute('SELECT source_id FROM decks WHERE deck_id=2').fetchone()[0] == 2
        assert connection.execute('SELECT source_id,source_item_id FROM deck_cards WHERE deck_card_id=2').fetchone() == (2,2)
        assert connection.execute('SELECT current_human_pack_id FROM draft_test_sessions WHERE draft_test_id=2').fetchone()[0] == 2
        assert connection.execute('SELECT tracked_pack_id,campaign_player_id FROM draft_test_pack_pool JOIN draft_test_players USING(draft_test_id) WHERE draft_test_id=2').fetchone() == (2,2)
    response = client.post('/maintenance/backups/import', json={'archive_path': archive, 'confirmation': 'IMPORT'})
    assert response.status_code == 202, response.json
    while jobs.busy and time.monotonic() < deadline:
        time.sleep(0.05)
    assert jobs.status()['state'] == 'complete', jobs.status()
    with closing(sqlite3.connect(root / 'cards.db')) as connection:
        icon_path = connection.execute("SELECT local_icon_svg_path FROM sets WHERE set_code='MY_IMP2^'").fetchone()[0]
    served = client.get('/static/' + icon_path)
    assert served.status_code == 200 and served.data == icon.read_bytes(), (served.status_code, icon_path)
    served.close()
    assert Path(app.get_pack_label_set_icon_path('MY_IMP2^')).read_bytes() == icon.read_bytes()
    print(json.dumps({'real_schema_imported_rows': imported['imported_rows'], 'archive_bytes': Path(archive).stat().st_size, 'archive_files': manifest['file_count'], 'config_http_status': response.status_code}))


if __name__ == '__main__':
    if len(sys.argv) == 2:
        child(Path(sys.argv[1]))
    else:
        with tempfile.TemporaryDirectory() as temporary:
            subprocess.run([sys.executable, __file__, temporary], check=True, cwd=Path(__file__).resolve().parents[1])

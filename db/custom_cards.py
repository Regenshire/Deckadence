"""User-created printings and their permanent original artwork."""
import re
import json
import logging
import os
from pathlib import Path
from contextlib import closing
from datetime import datetime, timezone

from db.database import get_db_connection, isolation_operation
from paths import RUNTIME_BASE_DIR, CUSTOM_CARD_DIR, ALTERNATE_SOURCE_DIR, UPSCALED_SCRYFALL_DIR, CHAOS_IMAGE_CACHE_DIR


def initialize_custom_cards(cursor):
    cursor.execute("CREATE TABLE IF NOT EXISTS _custom_card_file_cleanup (path TEXT PRIMARY KEY)")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS custom_cards (
            card_uuid TEXT PRIMARY KEY REFERENCES chaos_cards(card_uuid),
            creator TEXT NOT NULL DEFAULT '',
            artist TEXT NOT NULL DEFAULT '',
            source_type TEXT NOT NULL,
            external_image_url TEXT NOT NULL DEFAULT '',
            local_image_path TEXT NOT NULL,
            fullbleed_image_path TEXT NOT NULL DEFAULT '',
            remove_bleed INTEGER NOT NULL DEFAULT 0,
            bleed_size_mm REAL,
            export_frame_template TEXT NOT NULL DEFAULT 'auto',
            created_at_utc TEXT NOT NULL
        )
    """)


def normalize_custom_card_fields(values):
    result = {}
    for key, label, limit in (
        ('card_name', 'Custom Card Name', 256), ('set_code', 'Set Code', 20),
        ('collector_number', 'Card #', 64), ('creator', 'Creator', 256),
        ('artist', 'Artist', 256),
    ):
        value = str(values.get(key) or '').strip()
        if len(value) > limit or any(ord(char) < 32 for char in value):
            raise ValueError(f'{label} must be at most {limit} characters on one line.')
        result[key] = value
    if not result['card_name']:
        raise ValueError('Custom Card Name is required.')
    result['set_code'] = (result['set_code'] or 'CUSTOM').upper()
    if not re.fullmatch(r'[A-Z0-9][A-Z0-9_-]{0,19}', result['set_code']):
        raise ValueError('Set Code must use letters, numbers, underscores, or hyphens.')
    return result


def get_custom_card(card_uuid):
    if not str(card_uuid or '').startswith('custom-'):
        return None
    with closing(get_db_connection()) as conn:
        row = conn.execute("""
            SELECT custom.*, card.card_name, card.set_code, card.collector_number
            FROM custom_cards custom JOIN chaos_cards card USING (card_uuid)
            WHERE custom.card_uuid = ?
        """, (card_uuid,)).fetchone()
        return dict(row) if row else None


def insert_custom_card(card_uuid, fields, image):
    """Publish the card and its artwork together, after image validation."""
    with closing(get_db_connection()) as conn, conn:
        conn.execute("""
            INSERT INTO chaos_cards (
                card_uuid, card_name, set_code, collector_number, layout,
                rarity, type_line, mana_value, mana_cost, faces_json,
                face_count, is_dual_faced, is_booster, colors_json,
                color_identity_json, frame_version
            ) VALUES (?, ?, ?, ?, 'normal', 'common', 'Custom Card', 0, '',
                      '[]', 1, 0, 0, '[]', '[]', '2015')
        """, (card_uuid, fields['card_name'], fields['set_code'], fields['collector_number']))
        conn.execute("""
            INSERT INTO custom_cards (
                card_uuid, creator, artist, source_type, external_image_url,
                local_image_path, fullbleed_image_path, remove_bleed,
                bleed_size_mm, export_frame_template, created_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            card_uuid, fields['creator'], fields['artist'], image['source_type'],
            image.get('external_image_url', ''), image['local_image_path'],
            image.get('fullbleed_image_path', ''), int(image.get('remove_bleed', False)),
            image.get('bleed_size_mm'), image.get('export_frame_template', 'auto'),
            datetime.now(timezone.utc).isoformat(),
        ))


# Only app-managed artwork is eligible for removal. A Local File alternate
# can point at the user's own file; deleting the card must never delete it.
_IMAGE_REFERENCES = {
    'custom_cards': (RUNTIME_BASE_DIR, ('local_image_path', 'fullbleed_image_path')),
    'alternate_sources': (RUNTIME_BASE_DIR, ('local_image_path', 'fullbleed_image_path')),
    'alternate_image_isolation': (RUNTIME_BASE_DIR, ('local_image_path', 'fullbleed_image_path')),
    'upscaled_images': (UPSCALED_SCRYFALL_DIR, ('output_image_path', 'fullbleed_image_path')),
    'chaos_cards': (RUNTIME_BASE_DIR, ('image_cache_path',)),
}


def _canonical_image_path(root, value):
    return os.path.normcase(os.path.realpath(os.path.join(root, value)))


def _managed_image_root(path):
    for root in (CUSTOM_CARD_DIR, ALTERNATE_SOURCE_DIR, UPSCALED_SCRYFALL_DIR, CHAOS_IMAGE_CACHE_DIR):
        root = _canonical_image_path(root, '')
        try:
            if path != root and os.path.commonpath((root, path)) == root:
                return root
        except ValueError:
            pass
    return None


def _image_paths(conn, tables, card_uuid=None):
    result = set()
    for table, (root, columns) in _IMAGE_REFERENCES.items():
        if table not in tables:
            continue
        sql = f"SELECT {', '.join(columns)} FROM {table}"
        populated = ' OR '.join(f"COALESCE({column}, '') <> ''" for column in columns)
        rows = conn.execute(sql + (' WHERE card_uuid = ?' if card_uuid else ' WHERE '+populated),
                            (card_uuid,) if card_uuid else ())
        result.update(_canonical_image_path(root, path) for row in rows for path in row if path)
    # Upscalers may retain a source image belonging to another printing.
    if card_uuid is None and 'upscaled_images' in tables:
        result.update(_canonical_image_path(RUNTIME_BASE_DIR, row[0]) for row in conn.execute(
            'SELECT source_image_path FROM upscaled_images WHERE source_image_path IS NOT NULL') if row[0])
    return result


_DELETED_CARD = object()


def _without_card(value, card_uuid):
    """Remove a printing from stored previews without discarding other cards."""
    if isinstance(value, list):
        return [clean for item in value if (clean := _without_card(item, card_uuid)) is not _DELETED_CARD]
    if isinstance(value, dict):
        if value.get('card_uuid') == card_uuid:
            return _DELETED_CARD
        result = {key: clean for key, item in value.items()
                  if (clean := _without_card(item, card_uuid)) is not _DELETED_CARD}
        if isinstance(result.get('cards'), list) and 'total_cards' in result:
            result['total_cards'] = len(result['cards'])
        return result
    return _DELETED_CARD if value == card_uuid else value


def _collect_deleted_card_images():
    with closing(get_db_connection()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        referenced = _image_paths(conn, tables)
        for row in conn.execute('SELECT path FROM _custom_card_file_cleanup').fetchall():
            path = row['path']
            root = _managed_image_root(path)
            if root and path not in referenced:
                try:
                    Path(path).unlink(missing_ok=True)
                except OSError:
                    logging.exception('Could not remove deleted custom-card image: %s', path)
                    continue  # Keep the queue entry for the next cleanup.
                parent = Path(path).parent
                while str(parent) != root:
                    try:
                        parent.rmdir()  # Empty directories only.
                    except OSError:
                        break
                    parent = parent.parent
            conn.execute('DELETE FROM _custom_card_file_cleanup WHERE path=?', (path,))


def guard_custom_card_image_write(conn, card_uuid, output_path):
    """An upscale finishing after deletion must not resurrect its image row."""
    if not str(card_uuid or '').startswith('custom-'):
        return
    conn.execute('BEGIN IMMEDIATE')
    if conn.execute('SELECT 1 FROM custom_cards WHERE card_uuid=?', (card_uuid,)).fetchone():
        return
    conn.rollback()
    conn.close()
    _discard_deleted_card_output(output_path)
    raise ValueError('This custom card was deleted while its image was processing.')


@isolation_operation
def _discard_deleted_card_output(output_path):
    path = _canonical_image_path(UPSCALED_SCRYFALL_DIR, output_path)
    if _managed_image_root(path):
        with closing(get_db_connection()) as conn, conn:
            conn.execute('INSERT OR IGNORE INTO _custom_card_file_cleanup(path) VALUES(?)', (path,))
        _collect_deleted_card_images()


@isolation_operation
def delete_custom_card(card_uuid):
    """Delete one custom printing everywhere, then collect unshared artwork."""
    if not str(card_uuid or '').startswith('custom-'):
        raise LookupError('Custom card was not found.')
    with closing(get_db_connection()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        card = conn.execute('SELECT * FROM custom_cards WHERE card_uuid=?', (card_uuid,)).fetchone()
        if card is None:
            # A network retry after a successful delete is harmless.
            if conn.execute('SELECT 1 FROM chaos_cards WHERE card_uuid=?', (card_uuid,)).fetchone():
                raise LookupError('Custom card was not found.')
            return {'card_uuid': card_uuid, 'deleted': False}
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        paths = _image_paths(conn, tables, card_uuid)
        conn.executemany('INSERT OR IGNORE INTO _custom_card_file_cleanup(path) VALUES(?)',
                         [(path,) for path in paths if _managed_image_root(path)])
        now = datetime.now(timezone.utc).isoformat()
        for parent, parent_key, child in (
            ('decks', 'deck_id', 'deck_cards'),
            ('custom_draft_sets', 'set_code', 'custom_draft_set_cards'),
        ):
            if parent in tables and child in tables:
                conn.execute(f'UPDATE {parent} SET updated_at_utc=? WHERE {parent_key} IN '
                             f'(SELECT {parent_key} FROM {child} WHERE card_uuid=?)', (now, card_uuid))
        packs = [row[0] for row in conn.execute(
            'SELECT DISTINCT tracked_pack_id FROM tracked_chaos_pack_cards WHERE card_uuid=?', (card_uuid,))]
        conn.execute('UPDATE alternate_image_scopes SET revision=revision+1, updated_at_utc=? '
                     'WHERE image_scope_id IN (SELECT image_scope_id FROM alternate_image_isolation WHERE card_uuid=?)',
                     (now, card_uuid))

        # Picks and job items precede their referenced card/image records.
        for table in (
            'draft_test_picks', 'draft_test_pack_cards', 'upscaling_job_items',
            'deck_cards', 'deck_basic_land_printings', 'tracked_chaos_pack_cards',
            'custom_draft_set_cards', 'chaos_booster_sheet_cards', 'card_prices',
            'card_spot_foil_save_receipts', 'card_spot_foil_summary', 'card_spot_foil',
            'upscaled_images', 'alternate_image_isolation', 'alternate_sources',
            'custom_cards', 'chaos_cards',
        ):
            if table in tables:
                conn.execute(f'DELETE FROM {table} WHERE card_uuid=?', (card_uuid,))
        for table in ('market_price_checks', 'market_price_quotes'):
            if table in tables:
                conn.execute(f'DELETE FROM {table} WHERE printing_id=?', (card_uuid,))
        for pack_id in packs:
            conn.execute('UPDATE tracked_chaos_packs SET total_cards='
                         '(SELECT COUNT(*) FROM tracked_chaos_pack_cards WHERE tracked_pack_id=?) '
                         'WHERE tracked_pack_id=?', (pack_id, pack_id))

        for table, key, column in (
            ('chaos_session_state', 'state_key', 'state_value'),
            ('tracked_chaos_packs', 'tracked_pack_id', 'source_json'),
            ('decks', 'deck_id', 'deck_art_json'),
            ('simulator_openings', 'id', 'payload_json'),
        ):
            if table not in tables:
                continue
            for row in conn.execute(f'SELECT {key},{column} FROM {table} WHERE instr({column},?)>0', (card_uuid,)).fetchall():
                try:
                    original = json.loads(row[column])
                except (TypeError, ValueError):
                    continue
                updated = _without_card(original, card_uuid)
                if original != updated:
                    if table == 'decks':
                        updated = {}
                    elif updated is _DELETED_CARD:
                        updated = None
                    conn.execute(f'UPDATE {table} SET {column}=? WHERE {key}=?',
                                 (json.dumps(updated), row[key]))
    _collect_deleted_card_images()
    return {'card_uuid': card_uuid, 'deleted': True}

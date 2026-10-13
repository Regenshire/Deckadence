"""Simulator-only metadata and saved openings. Never writes draft state."""
import json
import time
from contextlib import closing
from uuid import NAMESPACE_URL, uuid5

from db.database import get_db_connection
from product_images import import_product_image_catalog, product_image_type
from db.sealed_recipes import SealedRecipeCatalog


def simulator_pack_key(opening_id, pack_index):
    """Stable save identity; never used as the human-facing pack code."""
    return uuid5(NAMESPACE_URL, f'deckadence:simulator:{opening_id}:{pack_index}').hex


def ensure_simulator_pack_code_schema(conn):
    # Use execute, not executescript: callers may already hold a write transaction.
    conn.execute('''CREATE TABLE IF NOT EXISTS simulator_pack_codes (
        simulator_pack_key TEXT PRIMARY KEY, pack_tracking_code TEXT NOT NULL UNIQUE
    )''')


def get_or_create_simulator_tracking_code(conn, key, set_code, booster_name, booster_index=0):
    """Reuse one code for printing, exporting and saving under a write transaction."""
    from modes.chaos import build_unique_simulator_tracking_code

    ensure_simulator_pack_code_schema(conn)
    saved = conn.execute(
        "SELECT pack_tracking_code FROM tracked_chaos_packs "
        "WHERE json_extract(CASE WHEN json_valid(source_json) THEN source_json "
        "ELSE '{}' END, '$.simulator_pack_key') = ?", (key,),
    ).fetchone()
    reserved = conn.execute(
        'SELECT pack_tracking_code FROM simulator_pack_codes WHERE simulator_pack_key=?', (key,),
    ).fetchone()
    if not saved and reserved and conn.execute(
        'SELECT 1 FROM tracked_chaos_packs WHERE pack_tracking_code=?',
        (reserved['pack_tracking_code'],),
    ).fetchone():
        # An imported/non-simulator pack may have claimed a previously printed
        # code. Never treat that unrelated pack as a retry of this one.
        raise ValueError("This simulator pack's code is already used by another saved pack. "
                         "Resolve the conflicting pack code before printing or saving it again.")
    code = (saved or reserved)['pack_tracking_code'] if saved or reserved else (
        build_unique_simulator_tracking_code(conn, set_code, booster_name, booster_index)
    )
    conn.execute('''INSERT INTO simulator_pack_codes VALUES (?,?)
        ON CONFLICT(simulator_pack_key) DO UPDATE SET pack_tracking_code=excluded.pack_tracking_code''',
        (key, code))
    return code


def get_simulator_pack_tracking_codes(opening_id, indexed_packs):
    """Reserve printed codes without adding packs to a campaign or changing cards."""
    with closing(get_db_connection()) as conn, conn:
        conn.execute('BEGIN IMMEDIATE')
        return {index: get_or_create_simulator_tracking_code(
            conn, simulator_pack_key(opening_id, index), pack['set_code'],
            pack['booster_name'], pack.get('variant_index', 0),
        ) for index, pack in indexed_packs}


def repair_simulator_tracking_codes():
    """Repair codes from the original simulator without replacing saved packs."""
    from modes.chaos import build_unique_simulator_tracking_code

    repaired = []
    with closing(get_db_connection()) as conn, conn:
        if not conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='simulator_openings'"
        ).fetchone():
            return repaired
        conn.execute('BEGIN IMMEDIATE')
        candidates = {}
        for row in conn.execute("SELECT tracked_pack_id, pack_tracking_code, set_code, "
                                "booster_name, booster_index, source_json FROM tracked_chaos_packs "
                                "WHERE pack_tracking_code LIKE '%.S.%'"):
            suffix = row['pack_tracking_code'].rsplit('.', 1)[-1]
            if len(suffix) == 12 and all(c in '0123456789ABCDEF' for c in suffix):
                candidates[row['pack_tracking_code']] = row
        if not candidates:
            return repaired
        has_draft_packs = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='draft_test_packs'"
        ).fetchone()
        # Match the exact old deterministic ID, rather than shortening arbitrary
        # imported codes or guessing which opening owns a saved pack.
        for opening in conn.execute('SELECT id, payload_json FROM simulator_openings'):
            for index, pack in enumerate(json.loads(opening['payload_json'])['packs']):
                key = simulator_pack_key(opening['id'], index)
                old_code = f"{pack['set_code']}.S.{key[:12].upper()}"
                row = candidates.pop(old_code, None)
                if row is None:
                    continue
                new_code = build_unique_simulator_tracking_code(
                    conn, row['set_code'], row['booster_name'], row['booster_index'])
                source = json.loads(row['source_json'])
                source.update(pack_tracking_code=new_code, simulator_pack_key=key)
                conn.execute('UPDATE tracked_chaos_packs SET pack_tracking_code=?, source_json=? '
                             'WHERE tracked_pack_id=?',
                             (new_code, json.dumps(source), row['tracked_pack_id']))
                if has_draft_packs:
                    conn.execute('UPDATE draft_test_packs SET pack_tracking_code=? '
                                 'WHERE tracked_pack_id=? AND pack_tracking_code=?',
                                 (new_code, row['tracked_pack_id'], old_code))
                repaired.append({'tracked_pack_id': row['tracked_pack_id'],
                                 'old_code': old_code, 'new_code': new_code})
    return repaired


def ensure_simulator_schema(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS simulator_booster_rules (
            set_code TEXT NOT NULL, booster_name TEXT NOT NULL, rules_json TEXT NOT NULL,
            PRIMARY KEY(set_code, booster_name)
        );
        CREATE TABLE IF NOT EXISTS simulator_boxes (
            product_uuid TEXT PRIMARY KEY, set_code TEXT NOT NULL,
            booster_name TEXT NOT NULL, name TEXT NOT NULL, packs_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS simulator_product_details (
            product_uuid TEXT PRIMARY KEY, image_type TEXT NOT NULL,
            accessories_json TEXT NOT NULL, unavailable_reason TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS simulator_openings (
            id TEXT PRIMARY KEY, created_at REAL NOT NULL, payload_json TEXT NOT NULL,
            revealed_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS simulator_sealed_products (
            product_uuid TEXT PRIMARY KEY, set_code TEXT NOT NULL, booster_name TEXT NOT NULL,
            category TEXT NOT NULL, name TEXT NOT NULL, ck_id TEXT, tcg_id TEXT
        );
    """)
    ensure_simulator_pack_code_schema(conn)


def import_simulator_metadata(all_sets):
    """Called alongside the existing AllPrintings import; no extra download.

    Keep optional sheet rules which the booster CSV files do not carry. Box
    recipes are resolved by exact product IDs, never inferred from a box name.
    """
    recipes = SealedRecipeCatalog(all_sets)

    rules, boxes, products, details = [], [], [], []
    for code, data in all_sets.items():
        for name, booster in data.get('booster', {}).items():
            sheet_rules = {name: {k: v for k, v in sheet.items() if k != 'cards'}
                           for name, sheet in booster.get('sheets', {}).items()}
            rules.append((code.upper(), name.lower(), json.dumps(sheet_rules)))
        for product in data.get('sealedProduct', []):
            category = product.get('category')
            contents = product.get('contents') or {}
            pack_contents = contents.get('pack') or []
            booster = pack_contents[0].get('code') if category == 'booster_pack' and len(pack_contents) == 1 else product.get('subtype')
            if category in {'booster_pack', 'booster_box'} and booster in data.get('booster', {}) and 'case' not in product.get('name', '').lower():
                ids = product.get('identifiers') or {}
                products.append((product['uuid'], code.upper(), booster, category, product['name'],
                                 str(ids.get('cardKingdomId') or ''), str(ids.get('tcgplayerProductId') or '')))
            image_type = product_image_type(product.get('name', ''), category or '', product.get('subtype', ''))
            if category not in {'booster_box', 'bundle'} or not image_type:
                continue
            unavailable = ''
            try:
                packs, accessories = recipes.resolve(product)
            except ValueError as error:
                packs, accessories, unavailable = [], [], str(error)
            booster = product.get('subtype')
            if category == 'bundle':
                candidates = [p for p in packs if 'cards' not in p and p['set_code'] == code.upper()]
                booster = max(candidates, key=lambda p: p['count'])['booster_name'] if candidates else next(
                    (key for key in ('play', 'draft', 'set', 'default', 'collector') if key in data.get('booster', {})), None)
            if booster not in data.get('booster', {}):
                continue
            boxes.append((product['uuid'], code.upper(), booster, product['name'], json.dumps(packs)))
            details.append((product['uuid'], image_type, json.dumps(accessories), unavailable))
            if category == 'bundle':
                ids = product.get('identifiers') or {}
                products.append((product['uuid'], code.upper(), booster, category, product['name'],
                                 str(ids.get('cardKingdomId') or ''), str(ids.get('tcgplayerProductId') or '')))
    with closing(get_db_connection()) as conn:
        ensure_simulator_schema(conn)
        with conn:
            import_product_image_catalog(conn, all_sets)
            conn.execute('DELETE FROM simulator_booster_rules')
            conn.execute('DELETE FROM simulator_boxes')
            conn.execute('DELETE FROM simulator_product_details')
            conn.execute('DELETE FROM simulator_sealed_products')
            conn.executemany('INSERT INTO simulator_booster_rules VALUES (?,?,?)', rules)
            conn.executemany('INSERT INTO simulator_boxes VALUES (?,?,?,?,?)', boxes)
            conn.executemany('INSERT INTO simulator_product_details VALUES (?,?,?,?)', details)
            conn.executemany('INSERT INTO simulator_sealed_products VALUES (?,?,?,?,?,?,?)', products)
    return {'booster_rules': len(rules), 'boxes': len(boxes), 'sealed_products': len(products)}


def get_opening(opening_id, conn=None):
    if conn is None:
        with closing(get_db_connection()) as connection:
            ensure_simulator_schema(connection)
            return get_opening(opening_id, connection)
    row = conn.execute('SELECT * FROM simulator_openings WHERE id=?', (opening_id,)).fetchone()
    if not row:
        return None
    opening = {**json.loads(row['payload_json']), 'revealed': json.loads(row['revealed_json']),
               'id': row['id'], 'created_at': row['created_at']}
    # Match /play/draft: read persisted card_order, never re-sort a saved pack
    # by rarity, name or sheet. JSON array positions preserve older saves.
    rows = conn.execute('''SELECT CAST(pack.key AS INTEGER) AS pack_index, card.value
        FROM simulator_openings opening, json_each(opening.payload_json, '$.packs') pack,
             json_each(pack.value, '$.cards') card
        WHERE opening.id=?
        ORDER BY pack_index ASC,
                 COALESCE(json_extract(card.value, '$.card_order'), CAST(card.key AS INTEGER) + 1) ASC
        ''', (opening_id,)).fetchall()
    for pack in opening['packs']:
        pack['cards'] = []
    for card in rows:
        opening['packs'][card['pack_index']]['cards'].append(json.loads(card['value']))
    return opening


def save_opening(opening_id, payload):
    # Chaos Draft assigns card_order when saving. Keep reveal identity separate
    # from ordering so sorting a view cannot change which cards are revealed.
    payload = {**payload, 'packs': [{**pack, 'cards': [
        {**card, 'card_order': order} for order, card in enumerate(pack['cards'], start=1)
    ]} for pack in payload['packs']]}
    with closing(get_db_connection()) as conn:
        ensure_simulator_schema(conn)
        with conn:
            conn.execute('INSERT OR IGNORE INTO simulator_openings(id,created_at,payload_json) VALUES (?,?,?)',
                         (opening_id, time.time(), json.dumps(payload)))
        return get_opening(opening_id, conn)


def reveal_cards(opening_id, indices):
    with closing(get_db_connection()) as conn:
        ensure_simulator_schema(conn)
        with conn:
            # Serialize the read/merge so reveals in two tabs cannot overwrite one another.
            conn.execute('BEGIN IMMEDIATE')
            opening = get_opening(opening_id, conn)
            if not opening:
                return None
            valid = {card['index'] for pack in opening['packs'] for card in pack['cards']}
            revealed = set(opening['revealed']) | (set(indices) & valid)
            conn.execute('UPDATE simulator_openings SET revealed_json=? WHERE id=?',
                         (json.dumps(sorted(revealed)), opening_id))
        return sorted(revealed)


def list_openings(limit=30):
    with closing(get_db_connection()) as conn:
        ensure_simulator_schema(conn)
        rows = conn.execute('SELECT id,created_at,payload_json,revealed_json FROM simulator_openings '
                            'ORDER BY created_at DESC LIMIT ?', (limit,)).fetchall()
    result = []
    for row in rows:
        payload = json.loads(row['payload_json'])
        result.append({'id': row['id'], 'created_at': row['created_at'], 'name': payload['name'],
                       'pack_count': len(payload['packs']), 'card_count': payload['card_count'],
                       'revealed_count': len(json.loads(row['revealed_json']))})
    return result

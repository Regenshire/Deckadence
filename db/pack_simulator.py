"""Simulator-only metadata and saved openings. Never writes draft state."""
import json
import time
from contextlib import closing

from db.database import get_db_connection


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
        CREATE TABLE IF NOT EXISTS simulator_openings (
            id TEXT PRIMARY KEY, created_at REAL NOT NULL, payload_json TEXT NOT NULL,
            revealed_json TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS simulator_sealed_products (
            product_uuid TEXT PRIMARY KEY, set_code TEXT NOT NULL, booster_name TEXT NOT NULL,
            category TEXT NOT NULL, name TEXT NOT NULL, ck_id TEXT, tcg_id TEXT
        );
    """)


def import_simulator_metadata(all_sets):
    """Called alongside the existing AllPrintings import; no extra download.

    Keep optional sheet rules which the booster CSV files do not carry. Box
    recipes are resolved by exact product IDs, never inferred from a box name.
    """
    sealed = {p['uuid']: p for s in all_sets.values() for p in s.get('sealedProduct', []) if p.get('uuid')}

    def recipe(product, seen=()):
        product_id = product.get('uuid')
        if product_id in seen or len(seen) > 5:
            return None
        contents = product.get('contents') or {}
        if any(key not in {'pack', 'sealed'} and value for key, value in contents.items()):
            return None  # Do not silently omit a fixed card, deck, or other bonus.
        packs = []
        for pack in contents.get('pack', []):
            code, booster = str(pack.get('set', '')).upper(), pack.get('code')
            if booster not in all_sets.get(code, {}).get('booster', {}):
                return None
            packs.append({'set_code': code, 'booster_name': booster, 'count': 1})
        for child in contents.get('sealed', []):
            nested = recipe(sealed.get(child.get('uuid'), {}), (*seen, product_id))
            count = child.get('count', 1)
            if not nested or not isinstance(count, int) or not 1 <= count <= 100:
                return None
            packs.extend({**pack, 'count': pack['count'] * count} for pack in nested)
        return packs or None

    rules, boxes, products = [], [], []
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
            if product.get('category') != 'booster_box' or 'case' in product.get('name', '').lower():
                continue
            packs = recipe(product)
            booster = product.get('subtype')
            if packs and booster in data.get('booster', {}) and sum(p['count'] for p in packs) <= 72:
                boxes.append((product['uuid'], code.upper(), booster, product['name'], json.dumps(packs)))
    with closing(get_db_connection()) as conn:
        ensure_simulator_schema(conn)
        with conn:
            conn.execute('DELETE FROM simulator_booster_rules')
            conn.execute('DELETE FROM simulator_boxes')
            conn.execute('DELETE FROM simulator_sealed_products')
            conn.executemany('INSERT INTO simulator_booster_rules VALUES (?,?,?)', rules)
            conn.executemany('INSERT INTO simulator_boxes VALUES (?,?,?,?,?)', boxes)
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

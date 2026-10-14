# *** PRODUCT IMAGES - Match Images to Product Types ***
import re


def product_image_type(name, category='', subtype=''):
    name = re.sub(r"[^a-z0-9]+", ' ', name.lower()).strip()
    if 'case' in name.split() or category.endswith('_case'):
        return None
    if category == 'bundle' or not category:
        for phrase, key in (
            ('secret lair bundle', 'secret_lair_bundle'),
            ('commanders bundle', 'commander_bundle'),
            ('commander s bundle', 'commander_bundle'),
            ('commander bundle', 'commander_bundle'),
            ('chocobo bundle', 'holiday_bundle'),
            ('holiday bundle', 'holiday_bundle'),
            ('gift bundle', 'gift_bundle'),
            ('gift edition', 'gift_bundle'),
            ('fat pack', 'bundle'),
        ):
            if phrase in name:
                return key
        if category == 'bundle':
            return 'gift_bundle' if subtype == 'gift_bundle' else 'bundle'
        if name == 'bundle':
            return 'bundle'
    if category == 'booster_box' and subtype == 'default':
        return 'draft_box'
    if category == 'booster_box' and subtype in {'play', 'collector', 'set', 'draft'}:
        return subtype + '_box'
    box = re.fullmatch(r'(play|collector|draft|set) boosters? (?:box(?:es)?|displays?)', name)
    return box[1] + '_box' if box else None


def import_product_image_catalog(conn, all_sets):
    """Keep availability separately from simulator recipes and pricing records."""
    conn.execute('CREATE TABLE IF NOT EXISTS pack_image_products '
                 '(set_code TEXT PRIMARY KEY, types_json TEXT NOT NULL)')
    import json
    rows = []
    for code, data in all_sets.items():
        if not data.get('sealedProduct'):
            continue  # Missing metadata is unknown, not evidence of absence.
        types = {product_image_type(p.get('name', ''), p.get('category', ''), p.get('subtype', ''))
                 for p in data['sealedProduct']}
        rows.append((code.upper(), json.dumps(sorted(types - {None}))))
    conn.execute('DELETE FROM pack_image_products')
    conn.executemany('INSERT INTO pack_image_products VALUES (?, ?)', rows)

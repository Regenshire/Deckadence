"""Individual Secret Lair drops, source observations and local corrections.

Discovery is independent of card availability. Never infer a printing from a
card name, or a bonus pool from other drops in the same superdrop.
"""
import json
import math
import re
import time
import unicodedata
from uuid import NAMESPACE_URL, uuid5
from urllib.parse import urlparse

MTGJSON_URL = 'https://mtgjson.com/api/v5/SLD.json'
SEALED_URL = 'https://raw.githubusercontent.com/mtgjson/mtg-sealed-content/main/data/products/SLD.yaml'
UNKNOWN_BONUS = {'kind': 'unresolved', 'note': 'Bonus card not yet documented. No bonus card was simulated.'}
FINISHES = {'normal', 'foil', 'etched'}


def import_announced_cards(conn, record):
    """Use the revealed printing's official artwork before vendor IDs exist.

    These stable local IDs are not Scryfall or MTGJSON identifiers. They remain
    valid for saved openings after a compiled recipe supersedes the announcement.
    """
    for card in record.get('announced_cards', []):
        for key in ('image', 'back'):
            url = card.get(key, '')
            if url and (urlparse(url).scheme != 'https' or urlparse(url).hostname not in
                        {'media.wizards.com', 'media.dndbeyond.com', 'images.ctfassets.net', 'cdn-prod.scalefast.com'}):
                raise ValueError('Unrecognized official card image host.')
        card['uuid'] = str(uuid5(NAMESPACE_URL, 'deckadence:secret-lair-preview:' + card['image']))
        card['preview'] = True
        back = card.get('back') or None
        faces = [{'face_index': i, 'side': 'b' if i else 'a', 'uuid': card['uuid'],
                  'name': card['name'], 'image_url': image, 'scryfall_id': None}
                 for i, image in enumerate([card['image'], back] if back else [])]
        conn.execute('''INSERT OR IGNORE INTO chaos_cards
            (card_uuid,set_code,card_name,rarity,type_line,layout,collector_number,scryfall_id,image_url,
             is_booster,faces_json,face_count,is_dual_faced,front_image_url,back_image_url,
             front_face_name,back_face_name,colors_json,color_identity_json,promo_types_json)
            VALUES (?,'SLD',?,'','','reversible_card','',NULL,?,0,?,?,?,?,?,?,?,'[]','[]','[]')''',
            (card['uuid'], card['name'], card['image'], json.dumps(faces), len(faces), int(bool(back)),
             card['image'], back, card['name'], card['name'] if back else None))


def ensure_schema(conn):
    # execute preserves the caller's transaction (including AllPrintings import).
    for sql in (
        '''CREATE TABLE IF NOT EXISTS secret_lair_products (
            id TEXT PRIMARY KEY, identity TEXT NOT NULL UNIQUE, base_name TEXT NOT NULL,
            edition TEXT NOT NULL, manual_json TEXT NOT NULL DEFAULT '{}', created_at REAL NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS secret_lair_sources (
            product_id TEXT NOT NULL, source TEXT NOT NULL, url TEXT NOT NULL, priority INTEGER NOT NULL,
            payload_json TEXT NOT NULL, updated_at REAL NOT NULL, PRIMARY KEY(product_id,source,url))''',
        '''CREATE TABLE IF NOT EXISTS secret_lair_aliases (
            alias TEXT PRIMARY KEY, product_id TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS secret_lair_sync (
            source TEXT PRIMARY KEY, attempted_at REAL NOT NULL DEFAULT 0,
            succeeded_at REAL NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL DEFAULT 0)''',
        '''CREATE TABLE IF NOT EXISTS secret_lair_artwork (
            url TEXT PRIMARY KEY, image BLOB NOT NULL, updated_at REAL NOT NULL)''',
    ):
        conn.execute(sql)


def name_key(name):
    name = unicodedata.normalize('NFKD', name.replace('™', '').replace('®', '')).casefold()
    name = re.sub(r'\bsecret\s+lair\s*(?:drop\s*(?:series)?|x\b)?', '', name)
    name = re.sub(r'\band\b', '', name.replace('&', ''))
    name = re.sub(r'\benglish\b', '', name)
    name = re.sub(r'\b(?:galaxy|surge|textured|raised|gilded|neon ink)\s+(?=foil\b)', '', name)
    name = re.sub(r'\b(?:traditional|rainbow|non[ -]?foil|foil|etched|edition)\b', '', name)
    return re.sub(r'[^a-z0-9]', '', name)


def edition_for(name, cards=(), default='unknown'):
    if re.search(r'\bnon[ -]?foil\b', name, re.I):
        return 'nonfoil'
    for treatment in ('etched', 'galaxy', 'surge', 'textured', 'raised', 'gilded'):
        if re.search(r'\b' + treatment + r'\b', name, re.I):
            return treatment + '-foil'
    if re.search(r'\bfoil\b', name, re.I):
        return 'foil'
    if cards:
        finishes = {c.get('finish') for c in cards}
        return 'nonfoil' if finishes == {'normal'} else 'foil' if finishes == {'foil'} else 'etched-foil' if finishes == {'etched'} else 'mixed'
    return default


def is_individual(name):
    return not re.search(r'\b(bundle|superdrop|commander|promo|incentive|countdown kit)\b', name, re.I)


def upsert(conn, record, source, url, priority, now=None):
    ensure_schema(conn)
    now = time.time() if now is None else now
    record = dict(record)
    base = name_key(record['name'])
    edition = record.get('edition', 'unknown')
    language = record.get('language', '').casefold()
    identity = ':'.join((base, edition, language))
    # Store URLs often cover multiple languages or roadshow variants. They are
    # provenance, not unique product IDs. Use exact upstream names/printings.
    names = {base, *(name_key(n) for n in record.get('alternate_names', []))}
    aliases = ['name:' + n + ':' + edition + ':' + language for n in names]
    numbers = record.get('collector_numbers')
    if numbers:
        aliases.append('numbers:' + ','.join(sorted(set(numbers))) + ':' + edition + ':' + language)
    if record.get('mtgjson_uuid'):
        aliases.insert(0, record['mtgjson_uuid'])
    row = conn.execute('SELECT id FROM secret_lair_products WHERE identity=?', (identity,)).fetchone()
    if row is None and not language:
        exact = conn.execute('SELECT id FROM secret_lair_products WHERE base_name=? AND edition=?', (base, edition)).fetchall()
        if len(exact) == 1:
            row = exact[0]
    if row is None:
        for alias in aliases:
            if alias.startswith('numbers:') and record.get('mtgjson_uuid'):
                continue  # Distinct releases may share main cards but have different bonuses.
            matches = conn.execute('SELECT DISTINCT product_id FROM secret_lair_aliases WHERE '
                                   + ('alias LIKE ?' if not language else 'alias IN (?,?)') + " AND product_id<>''",
                                   (alias + '%',) if not language else (alias, alias.rsplit(':', 1)[0] + ':')).fetchall()
            if len(matches) == 1:
                if source in {'mtgjson', 'mtg-sealed-content'} and alias != record.get('mtgjson_uuid'):
                    existing = conn.execute('''SELECT p.base_name FROM secret_lair_products p
                        JOIN secret_lair_sources s ON s.product_id=p.id WHERE p.id=?
                        AND json_extract(s.payload_json,'$.mtgjson_uuid') IS NOT NULL LIMIT 1''', (matches[0][0],)).fetchone()
                    if existing and existing[0] != base:
                        continue
                row = matches[0]
                break
    if row is None and source == 'mtg-wiki':
        # Wiki's two price columns combine etched/special foils and mixed-finish
        # drops. Attach that generic observation only to an unambiguous edition.
        for alias in aliases:
            if not alias.startswith(('name:', 'numbers:')):
                continue
            prefix = alias.rsplit(':', 2)[0] + ':'
            matches = conn.execute('''SELECT DISTINCT a.product_id FROM secret_lair_aliases a
                JOIN secret_lair_products p ON p.id=a.product_id
                WHERE a.alias LIKE ? AND (p.edition='mixed' OR (?='foil' AND p.edition LIKE '%-foil'))''',
                (prefix + '%', edition)).fetchall()
            if len(matches) == 1:
                row = matches[0]
                break
            if len(matches) > 1:
                return None  # A generic foil listing is not an extra edition.
    uid = row[0] if row else str(uuid5(NAMESPACE_URL, 'deckadence:secret-lair:' + identity))
    conn.execute('INSERT OR IGNORE INTO secret_lair_products(id,identity,base_name,edition,created_at) VALUES (?,?,?,?,?)',
                 (uid, identity, base, edition, now))
    for alias in aliases:
        conn.execute('''INSERT INTO secret_lair_aliases VALUES (?,?) ON CONFLICT(alias)
            DO UPDATE SET product_id=CASE WHEN product_id=excluded.product_id THEN product_id ELSE '' END''', (alias, uid))
    # A partially rebuilt upstream feed must not erase the last usable recipe.
    old = conn.execute('SELECT payload_json FROM secret_lair_sources WHERE product_id=? AND source=? AND url=?',
                       (uid, source, url)).fetchone()
    if old:
        previous = json.loads(old[0])
        for key in ('main', 'bonus', 'mtgjson_uuid', 'identifiers', 'release_date', 'announced_cards', 'art_url', 'art_crop'):
            if not record.get(key) or (key == 'bonus' and all(s['kind'] == 'unresolved' for s in record[key])):
                if previous.get(key):
                    record[key] = previous[key]
    conn.execute('''INSERT INTO secret_lair_sources VALUES (?,?,?,?,?,?)
        ON CONFLICT(product_id,source,url) DO UPDATE SET priority=excluded.priority,
        payload_json=excluded.payload_json,updated_at=excluded.updated_at''',
        (uid, source, url, priority, json.dumps(record), now))
    return uid


def records(conn, uid=None):
    ensure_schema(conn)
    rows = conn.execute('SELECT * FROM secret_lair_products' + (' WHERE id=?' if uid else ''),
                        (uid,) if uid else ()).fetchall()
    observations = {}
    for source in conn.execute('SELECT * FROM secret_lair_sources' + (' WHERE product_id=?' if uid else '') +
                               ' ORDER BY priority,updated_at', (uid,) if uid else ()):
        observations.setdefault(source['product_id'], []).append(source)
    result = []
    for row in rows:
        record = {'id': row['id'], 'main': [], 'bonus': [dict(UNKNOWN_BONUS)],
                  'release_date': '', 'sources': [], 'created_at': row['created_at']}
        release_rank = -1
        for source in observations.get(row['id'], []):
            data = json.loads(source['payload_json'])
            for key, value in data.items():
                if value not in (None, '', [], {}):
                    if key == 'release_date':
                        # Store/announcement sale dates and the Wiki release
                        # table precede compiled shipping dates for discovery.
                        rank = {'wizards-announcements': 3, 'wizards-store': 3, 'mtg-wiki': 2}.get(source['source'], 1)
                        if rank < release_rank:
                            continue
                        release_rank = rank
                    if key == 'bonus' and all(s['kind'] == 'unresolved' for s in value):
                        continue
                    record[key] = {**record.get(key, {}), **value} if key == 'identifiers' else value
            record['sources'].append({'source': source['source'], 'url': source['url'], 'checked_at': source['updated_at']})
        manual = json.loads(row['manual_json'])
        record.update(manual)
        record['manual_fields'] = list(manual)
        record['has_correction'] = row['manual_json'] != '{}'
        record['base_name'] = row['base_name']
        result.append(record)
    if not uid:
        known = {r['base_name'] for r in result if r.get('edition') != 'unknown'}
        result = [r for r in result if r.get('edition') != 'unknown' or r['base_name'] not in known or r['has_correction']]
    return result


def validate_recipe(data):
    """Validate local overrides before persisting; no arbitrary SQL or URLs fetched."""
    if not isinstance(data, dict) or set(data) - {'main', 'bonus', 'name', 'release_date'}:
        raise ValueError('Corrections accept name, release_date, main and bonus only.')
    for key in ('name', 'release_date'):
        if key in data and (not isinstance(data[key], str) or len(data[key]) > 300):
            raise ValueError('Invalid correction text.')

    def cards(entries):
        if not isinstance(entries, list) or not entries or len(entries) > 100:
            raise ValueError('Provide between 1 and 100 exact card entries.')
        for card in entries:
            if (not isinstance(card, dict) or not isinstance(card.get('uuid'), str) or not card['uuid']
                    or card.get('finish') not in FINISHES or type(card.get('count', 1)) is not int
                    or not 1 <= card.get('count', 1) <= 100):
                raise ValueError('Each card needs uuid, finish (normal, foil or etched) and a positive count.')
        if sum(c.get('count', 1) for c in entries) > 100:
            raise ValueError('A drop cannot exceed 100 cards.')

    if 'main' in data:
        cards(data['main'])
    if 'bonus' in data:
        if not isinstance(data['bonus'], list) or not 1 <= len(data['bonus']) <= 5:
            raise ValueError('Provide 1 to 5 bonus slots, including unresolved slots when needed.')
        for slot in data['bonus']:
            if not isinstance(slot, dict) or slot.get('kind') not in {'fixed', 'variable', 'unresolved'}:
                raise ValueError('Bonus kind must be fixed, variable or unresolved.')
            for key in ('note', 'evidence'):
                if key in slot and (not isinstance(slot[key], str) or len(slot[key]) > 2000):
                    raise ValueError('Bonus notes and evidence must be text up to 2000 characters.')
            if slot['kind'] == 'unresolved':
                continue
            options = slot.get('options')
            if not isinstance(options, list) or not 1 <= len(options) <= 500:
                raise ValueError('A resolved bonus needs explicit outcomes.')
            if slot['kind'] == 'fixed' and len(options) != 1:
                raise ValueError('A fixed bonus must have exactly one outcome.')
            for option in options:
                if not isinstance(option, dict):
                    raise ValueError('Invalid bonus outcome.')
                cards(option.get('cards'))
                weight = option.get('weight', 1)
                if type(weight) not in (int, float) or not math.isfinite(weight) or weight <= 0:
                    raise ValueError('Bonus weights must be positive finite numbers.')
            if not math.isfinite(sum(o.get('weight', 1) for o in options)):
                raise ValueError('The total bonus weight is too large.')
            if slot['kind'] == 'variable' and slot.get('odds') not in {'estimated', 'documented'}:
                raise ValueError('Variable bonuses must identify estimated or documented odds.')
            if slot.get('odds') == 'documented' and not slot.get('evidence'):
                raise ValueError('Documented odds require an evidence citation.')


def set_correction(conn, uid, data):
    validate_recipe(data)
    if not conn.execute('SELECT 1 FROM secret_lair_products WHERE id=?', (uid,)).fetchone():
        raise ValueError('This Secret Lair could not be found.')
    conn.execute('UPDATE secret_lair_products SET manual_json=? WHERE id=?', (json.dumps(data), uid))
    if data:
        conn.execute("INSERT OR REPLACE INTO secret_lair_sources VALUES (?,'local-correction','',100,'{}',?)", (uid, time.time()))
    else:
        conn.execute("DELETE FROM secret_lair_sources WHERE product_id=? AND source='local-correction'", (uid,))


def entry(card, lookup, default_finish=None):
    uid = card.get('uuid')
    if not uid and card.get('set') and card.get('number') is not None:
        matches = [c for c in lookup.values() if c.get('setCode', '').lower() == card['set'].lower()
                   and str(c.get('number')) == str(card['number']) and c.get('language', 'English') == 'English'
                   and bool(c.get('_token')) == bool(card.get('token')) and c.get('side') != 'b']
        uid = matches[0]['uuid'] if len(matches) == 1 else None
    finish = ('etched' if card.get('isEtched') or card.get('etched') or card.get('finishes') == ['etched'] else
              'foil' if card.get('isFoil') or card.get('foil') or card.get('finishes') == ['foil'] else default_finish or 'normal')
    if not uid or type(card.get('count', 1)) is not int or not 1 <= card.get('count', 1) <= 100:
        raise ValueError('Exact printing or quantity is not yet available.')
    # MTGJSON lists both faces separately. Opening and exporting uses the front UUID.
    obj = lookup.get(uid, {})
    if obj.get('side') == 'b':
        front = [lookup[x] for x in obj.get('otherFaceIds', []) if x in lookup and lookup[x].get('side') == 'a']
        if len(front) == 1:
            uid = front[0]['uuid']
    return {'uuid': uid, 'count': card.get('count', 1), 'finish': finish}


def bonus_slot(options, evidence, documented=False):
    if any(not math.isfinite(o['weight']) or o['weight'] < 0 for o in options):
        raise ValueError('Invalid bonus weights.')
    options = [o for o in options if o['weight'] > 0]
    if not options or not math.isfinite(sum(o['weight'] for o in options)):
        raise ValueError('No bonus outcomes are documented.')
    return {'kind': 'fixed' if len(options) == 1 else 'variable', 'options': options,
            'odds': 'documented' if documented else 'estimated', 'evidence': evidence,
            'note': ('Source-defined MTGJSON distribution; not verified official odds.' if documented else
                     'Simulation estimate using MTGJSON weights; actual odds are unknown.') if len(options) > 1 else
                    'Fixed bonus documented by MTGJSON.'}


def import_products(conn, all_sets, raw_products=None, source='mtgjson', url=MTGJSON_URL):
    """Consume MTGJSON's compiled data or the earlier sealed-content YAML.

    Deck = guaranteed cards; adjacent card/pack/variable = bonus. Card-only
    promotional listings and bundles are deliberately excluded.
    """
    ensure_schema(conn)
    products = raw_products if raw_products is not None else all_sets.get('SLD', {}).get('sealedProduct', [])
    if not products:
        return 0
    needed_sets = {'SLD'} | {r.get('set', '').upper() for p in products
                            for key in ('card', 'deck', 'pack') for r in (p.get('contents') or {}).get(key, [])}
    lookup = {c['uuid']: {**c, 'setCode': code, '_token': token}
              for code, data in all_sets.items() if code.upper() in needed_sets
              for token, key in ((False, 'cards'), (True, 'tokens'))
              for c in data.get(key, [])}
    decks = {(code.lower(), d['name']): d for code, data in all_sets.items() if code.upper() in needed_sets
             for d in data.get('decks', [])}
    count = 0
    for product in products:
        name = product['name']
        if str(product.get('subtype', '')).lower() != 'secret_lair' or not is_individual(name):
            continue
        contents = product.get('contents') or {}
        # No deck reference means there is no reliable boundary between main and bonus cards.
        main, edition_cards, product_url, error = [], [], '', ''
        language = product.get('language') or ('Japanese' if 'japanese' in name.lower() else 'English')
        try:
            if not contents.get('deck') or contents.get('sealed') or contents.get('copy'):
                raise ValueError('Guaranteed contents are not yet documented.')
            for ref in contents['deck']:
                deck = decks.get((ref['set'].lower(), ref['name']))
                if not deck:
                    raise ValueError('Guaranteed printings are not yet available. Refresh again later.')
                if deck.get('commander'):
                    raise ValueError('Commander products are not supported here.')
                entries = [entry(c, lookup) for key in ('mainBoard', 'sideBoard') for c in deck.get(key, [])]
                edition_cards.extend(entries)
                main.extend(entries)
                main.extend(entry(c, lookup) for c in deck.get('tokens', []))
                # Some upstream deck references are shared between languages.
                # Do not silently open the English printing of a Japanese edition.
                if language != 'English' and any(lookup.get(c['uuid'], {}).get('language', language) != language for c in entries):
                    raise ValueError('The source has not mapped the exact printings for this language edition.')
                product_url = deck.get('source', '')
            if not main or sum(c['count'] for c in main) > 100:
                raise ValueError('Guaranteed contents are incomplete or unsupported.')
        except (ValueError, KeyError) as exc:
            main, error = [], str(exc)
        bonus = []
        if contents.get('card'):
            try:
                bonus.append(bonus_slot([{'cards': [entry(c, lookup) for c in contents['card']], 'weight': 1}], url))
            except (ValueError, KeyError):
                bonus.append(dict(UNKNOWN_BONUS))
        for ref in contents.get('pack', []):
            try:
                booster = all_sets[ref['set'].upper()]['booster'][ref['code']]
                options = []
                total = sum(v['weight'] for v in booster['boosters'])
                for variant in booster['boosters']:
                    if sum(variant['contents'].values()) != 1:
                        raise ValueError('Unsupported bonus recipe.')
                    sheet_name = next(k for k, v in variant['contents'].items() if v)
                    sheet = booster['sheets'][sheet_name]
                    sheet_total = sum(sheet['cards'].values())
                    for uid, weight in sheet['cards'].items():
                        finish = 'etched' if 'etched' in sheet_name.lower() else 'foil' if sheet.get('foil') else 'normal'
                        options.append({'cards': [entry({'uuid': uid}, lookup, finish)],
                                        'weight': variant['weight'] / total * weight / sheet_total})
                bonus.append(bonus_slot(options, url))
            except (ValueError, KeyError, ZeroDivisionError):
                bonus.append(dict(UNKNOWN_BONUS))
        variables = contents.get('variable', [])
        if variables and 'configs' not in variables[0]:
            variables = [{'configs': variables}]
        for group in variables:
            try:
                options, documented = [], True
                for config in group['configs']:
                    rate = config.get('variable_config', [])
                    if isinstance(rate, dict):
                        rate = [rate]
                    documented = documented and bool(rate)
                    weight = math.prod(r['chance'] / r['weight'] for r in rate) if rate else 1
                    if weight <= 0:
                        continue
                    if not config.get('card') or set(config) - {'card', 'variable_config'}:
                        raise ValueError('Unsupported variable bonus.')
                    options.append({'cards': [entry(c, lookup) for c in config['card']], 'weight': weight})
                bonus.append(bonus_slot(options, url, documented))
            except (ValueError, KeyError, TypeError, ZeroDivisionError):
                bonus.append(dict(UNKNOWN_BONUS))
        record = {'name': name, 'edition': edition_for(name, edition_cards or main), 'main': main,
                  'bonus': bonus or [dict(UNKNOWN_BONUS)], 'content_note': error,
                  'release_date': product.get('releaseDate') or product.get('release_date') or '',
                  'mtgjson_uuid': product.get('uuid'), 'identifiers': product.get('identifiers', {}),
                  'language': language, 'product_url': product_url,
                  'alternate_names': [d['name'] for d in contents.get('deck', [])],
                  'collector_numbers': sorted({str(lookup[c['uuid']].get('number', '')).lstrip('0') or '0'
                      for c in main if c['uuid'] in lookup and lookup[c['uuid']].get('setCode', '').upper() == 'SLD'})}
        upsert(conn, record, source, url, 50 if source == 'mtgjson' else 60)
        count += 1
    return count


def import_printings(conn, data):
    """Add new SLD printings without overwriting existing cards or local edits."""
    lookup = {c['uuid']: c for key in ('cards', 'tokens') for c in data.get(key, [])}
    columns = ['card_uuid', 'set_code', 'card_name', 'face_name', 'rarity', 'type_line', 'layout',
               'collector_number', 'scryfall_id', 'image_url', 'is_booster', 'faces_json', 'face_count',
               'is_dual_faced', 'front_image_url', 'back_image_url', 'front_face_name', 'back_face_name',
               'colors_json', 'color_identity_json', 'promo_types_json', 'mana_value', 'mana_cost']
    for card in lookup.values():
        if card.get('side') == 'b':
            continue
        sid = card.get('identifiers', {}).get('scryfallId')
        if not sid:
            continue
        image = f'https://api.scryfall.com/cards/{sid}?format=image&version=normal'
        backs = [lookup[x] for x in card.get('otherFaceIds', []) if x in lookup and lookup[x].get('side') == 'b']
        dual = card.get('layout') in {'transform', 'modal_dfc', 'battle', 'double_faced_token'} and bool(backs)
        faces = [{'face_index': i, 'side': 'a' if i == 0 else 'b', 'uuid': c['uuid'],
                  'name': c.get('faceName', c['name']), 'type_line': c.get('type', ''),
                  'image_url': image + ('&face=back' if i else ''), 'scryfall_id': sid}
                 for i, c in enumerate([card, backs[0]] if dual else [])]
        values = [card['uuid'], data.get('code', 'SLD'), card['name'], card.get('faceName'),
                  card.get('rarity', ''), card.get('type', ''), card.get('layout', ''), card.get('number', ''),
                  sid, image, 0, json.dumps(faces), len(faces), int(dual), image,
                  image + '&face=back' if dual else None, card.get('faceName', card['name']),
                  backs[0].get('faceName') if dual else None, json.dumps(card.get('colors', [])),
                  json.dumps(card.get('colorIdentity', [])), json.dumps(card.get('promoTypes', [])),
                  card.get('manaValue'), card.get('manaCost')]
        conn.execute('INSERT INTO chaos_cards (' + ','.join(columns) + ') VALUES (' +
                     ','.join('?' for _ in columns) + ''') ON CONFLICT(card_uuid) DO UPDATE SET
            scryfall_id=excluded.scryfall_id,
            image_url=COALESCE(NULLIF(chaos_cards.image_url,''),excluded.image_url),
            front_image_url=COALESCE(NULLIF(chaos_cards.front_image_url,''),excluded.front_image_url),
            back_image_url=COALESCE(NULLIF(chaos_cards.back_image_url,''),excluded.back_image_url),
            front_face_name=COALESCE(NULLIF(chaos_cards.front_face_name,''),excluded.front_face_name),
            back_face_name=COALESCE(NULLIF(chaos_cards.back_face_name,''),excluded.back_face_name),
            faces_json=CASE WHEN COALESCE(chaos_cards.faces_json,'[]') IN ('','[]')
                THEN excluded.faces_json ELSE chaos_cards.faces_json END,
            face_count=MAX(COALESCE(chaos_cards.face_count,0),excluded.face_count),
            is_dual_faced=MAX(COALESCE(chaos_cards.is_dual_faced,0),excluded.is_dual_faced),
            promo_types_json=COALESCE(chaos_cards.promo_types_json,excluded.promo_types_json)
            WHERE COALESCE(chaos_cards.scryfall_id,'')='' ''', values)


def sync_price_products(conn):
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE name='simulator_sealed_products'").fetchone():
        return
    for record in records(conn):
        if not record.get('mtgjson_uuid'):
            continue
        ids = record.get('identifiers', {})
        conn.execute('''INSERT OR REPLACE INTO simulator_sealed_products
            (product_uuid,set_code,booster_name,category,name,ck_id,tcg_id) VALUES (?,'SLD',?,'secret_lair',?,?,?)''',
            (record['mtgjson_uuid'], 'secret-lair-' + record['id'], record['name'],
             str(ids.get('cardKingdomId', '')), str(ids.get('tcgplayerProductId', ''))))

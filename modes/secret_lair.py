"""Adapt fixed drop contents to the existing simulator card/reveal payload."""
import random
import re
from contextlib import closing
from uuid import UUID

from db.database import get_db_connection
from db.card_finishes import card_promo_types
from db.secret_lair import records

PREFIX = 'secret-lair-'


def display_name(name):
    name = re.sub(r'^secret\s+lair\s*(?:(?:drop\s*(?:series)?)|x\b)?\s*[-:–—]?\s*', '', name, flags=re.I)
    name = re.sub(r'\bdrop\b', '', name, flags=re.I)
    name = re.sub(r'\s+(?:(?:non[ -]?|traditional |rainbow |etched |galaxy |surge |textured |raised |gilded )?foil)(?: edition)?$', '', name, flags=re.I)
    return 'Secret Lair - ' + re.sub(r'\s+', ' ', name).strip(' -:–—')


def identity(record):
    is_foil = record.get('edition', '').endswith('foil') and record['edition'] != 'nonfoil'
    return {'set_code': 'SLD', 'booster_name': PREFIX + record['id'], 'product_kind': 'secret_lair',
            'product_id': record['id'], 'set_name': display_name(record['name']) + (' (FOIL)' if is_foil else ''),
            'is_foil': is_foil, 'release_date': record['release_date'],
            'content_status': 'documented' if record['main'] or record.get('announced_cards') else 'awaiting contents',
            'label': 'Secret Lair · ' + record.get('edition', 'unknown').replace('-', ' ').title()}


def catalog(conn):
    return [identity(r) for r in records(conn)]


def artwork_candidates(conn, record):
    """Use existing contents when older catalog entries have no artwork metadata.

    Artwork does not depend on bonus documentation or change a product's recipe.
    Both editions share the same downloaded illustration cache.
    """
    candidates = []

    def add(url, crop):
        if url and (url, crop) not in candidates:
            candidates.append((url, crop))

    add(record.get('art_url'), record.get('art_crop', 'marketing'))
    for card in record.get('announced_cards', []):
        add(card.get('image'), 'card')
    rows = []
    for card in record.get('main', []):
        row = conn.execute('SELECT scryfall_id,front_image_url,image_url FROM chaos_cards WHERE card_uuid=?',
                           (card['uuid'],)).fetchone()
        if row:
            rows.append(row)
    # Supplementary catalog entries can already identify their exact SLD
    # collector numbers before a compiled main-card recipe is available.
    if not rows:
        for number in record.get('collector_numbers', []):
            rows.extend(conn.execute('''SELECT scryfall_id,front_image_url,image_url FROM chaos_cards
                WHERE set_code='SLD' AND collector_number=? ORDER BY card_uuid''', (str(number),)).fetchall())
    for row in rows:
        try:
            sid = str(UUID(row['scryfall_id']))
        except (ValueError, TypeError, AttributeError):
            add(row['front_image_url'] or row['image_url'], 'card')
        else:
            add(f'https://api.scryfall.com/cards/{sid}?format=image&version=art_crop', 'illustration')
    return candidates


def resolve_cards(conn, entries, label):
    from modes.pack_simulator import public_card
    result = []
    for entry in entries:
        row = conn.execute('SELECT * FROM chaos_cards WHERE card_uuid=?', (entry['uuid'],)).fetchone()
        if not row or not (row['scryfall_id'] or (entry.get('preview') and row['image_url'])):
            raise ValueError('Exact printings are not yet available. Refresh the Secret Lair catalog or card database.')
        card = dict(row)
        card['promo_types'] = card_promo_types(card)
        finish = entry['finish']
        if finish not in {'normal', 'foil', 'etched'}:
            raise ValueError('An included finish has not been resolved.')
        public = public_card(card, {'sheet_name': label, 'sheet_is_foil': finish != 'normal'})
        # Product finishes are authoritative independently of a printing's promo types.
        public.update(finish_type=finish, sheet_is_foil=int(finish != 'normal'),
                      finish_label={'normal': '', 'foil': 'Foil', 'etched': 'Etched foil'}[finish])
        if finish == 'foil' and 'surgefoil' in card['promo_types']:
            public['finish_label'] = 'Surge foil'
        result.extend(dict(public) for _ in range(entry.get('count', 1)))
    return result


def load(booster_name):
    with closing(get_db_connection()) as conn:
        found = records(conn, booster_name.removeprefix(PREFIX))
        if not found:
            raise ValueError('This Secret Lair is no longer in the catalog.')
        record = found[0]
        unavailable, main = '', []
        try:
            entries = record['main'] or record.get('announced_cards', [])
            if not entries:
                raise ValueError(record.get('content_note') or 'Guaranteed printings are not yet available.')
            try:
                main = resolve_cards(conn, entries, 'Guaranteed cards')
            except ValueError:
                # Revealed artwork is usable before compiled printing IDs arrive.
                if not record.get('announced_cards') or 'main' in record.get('manual_fields', []):
                    raise
                main = resolve_cards(conn, record['announced_cards'], 'Guaranteed cards')
        except ValueError as exc:
            unavailable = str(exc)
        bonus = []
        for source in record['bonus']:
            slot = dict(source)
            if not slot.get('note'):
                slot['note'] = ('Bonus unresolved. No bonus card was simulated.' if slot['kind'] == 'unresolved' else
                                'Fixed bonus from local correction.' if slot['kind'] == 'fixed' else
                                'Simulation estimate; actual odds are unknown.' if slot.get('odds') == 'estimated' else
                                'Documented source distribution; see the evidence citation.')
            try:
                if slot['kind'] != 'unresolved':
                    slot['options'] = [{**o, 'cards': resolve_cards(conn, o['cards'], 'Bonus cards')}
                                       for o in slot['options']]
            except ValueError:
                # Never renormalize a partially available pool: it would change the odds.
                slot = {'kind': 'unresolved', 'note': 'Bonus printings are not yet available. No bonus card was simulated.'}
            bonus.append(slot)
    return {**identity(record), 'main_cards': main, 'bonus': bonus, 'record': record,
            'unavailable_reason': unavailable, 'unavailable': bool(unavailable), 'boxes': [], 'sheets': {}}


def describe(product):
    slots = [{'name': 'main', 'label': 'Guaranteed cards', 'min': len(product['main_cards']),
              'max': len(product['main_cards']), 'chance': 1, 'foil': False,
              'pool_count': len(product['main_cards']), 'fixed': True, 'note': 'Exact included printings; finishes shown per card.'}]
    minimum = maximum = len(product['main_cards'])
    for index, slot in enumerate(product['bonus']):
        counts = [len(o['cards']) for o in slot.get('options', [])]
        lo, hi = min(counts, default=0), max(counts, default=0)
        minimum += lo
        maximum += hi
        slots.append({'name': 'bonus-' + str(index), 'label': 'Bonus card' + (' · unresolved' if not counts else ''),
                      'min': lo, 'max': hi, 'chance': 1 if counts else None, 'foil': False,
                      'fixed': slot['kind'] == 'fixed', 'pool_count': sum(counts),
                      'note': slot.get('note', ''), 'odds': slot.get('odds'), 'unresolved': not counts})
    return {k: v for k, v in product.items() if k not in {'record', 'main_cards', 'bonus', 'sheets'}} | {
        'slots': slots, 'min_cards': minimum, 'max_cards': maximum,
        'bonus_summary': ' '.join(slot.get('note', '') for slot in product['bonus']),
    }


def pool(product, slot_name):
    if slot_name == 'main':
        return [dict(c, draw_chance=None) for c in product['main_cards']], True
    try:
        index = int(slot_name.removeprefix('bonus-'))
        if not slot_name.startswith('bonus-') or index < 0:
            raise ValueError()
        slot = product['bonus'][index]
    except (ValueError, IndexError):
        raise ValueError('Choose a Secret Lair contents slot.')
    options = slot.get('options', [])
    total = sum(o.get('weight', 1) for o in options)
    return [dict(c, draw_chance=o.get('weight', 1) / total, odds=slot.get('odds'))
            for o in options for c in o['cards']], slot['kind'] == 'fixed'


def open_drop(product, rng=random):
    if product['unavailable']:
        raise ValueError(product['unavailable_reason'])
    cards = [dict(c) for c in product['main_cards']]
    bonus_status = []
    for slot in product['bonus']:
        bonus_status.append({k: slot[k] for k in ('kind', 'odds', 'note', 'evidence') if k in slot})
        if slot['kind'] == 'unresolved':
            continue
        options = slot['options']
        chosen = options[0] if slot['kind'] == 'fixed' else rng.choices(options, weights=[o.get('weight', 1) for o in options], k=1)[0]
        cards.extend(dict(c, is_bonus=True, bonus_odds=slot.get('odds')) for c in chosen['cards'])
    return {'set_code': 'SLD', 'booster_name': product['booster_name'], 'name': product['set_name'],
            'product_kind': 'secret_lair', 'product_id': product['product_id'], 'variant_index': 0,
            'cards': cards, 'bonus_status': bonus_status, 'sources': product['record']['sources']}

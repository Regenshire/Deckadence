"""Weighted booster simulation using Chaos Draft's imported sheet data.

No Chaos house rules, shared pending-pack state, or pricing dependencies.
Published sheet odds approximate retail collation; factory print runs and box
guarantees are not modeled.
"""
import json
import re
from contextlib import closing

from db.database import get_db_connection
from db.card_finishes import card_promo_types
from db.pack_simulator import ensure_simulator_schema
from modes.chaos import choose_weighted_row, sort_opened_chaos_pack_cards
from settings import CHAOS_PACK_TYPE_OPTIONS

BOOSTER_LABELS = {item['value']: item['label'] for item in CHAOS_PACK_TYPE_OPTIONS if item['value'] != 'custom'}


def sheet_label(name):
    label = re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', name).replace('_', ' ').lower()
    for before, after in [('dfc', 'double-faced'), ('sfc', 'single-faced'), ('fullart', 'full-art'),
                          ('non foil', 'nonfoil'), ('rare mythic', 'rare / mythic'),
                          ('common uncommon', 'common / uncommon'), ('boosterfun', 'Booster Fun')]:
        label = label.replace(before, after)
    return label.capitalize()


def get_catalog():
    with closing(get_db_connection()) as conn:
        ensure_simulator_schema(conn)
        rows = conn.execute('''SELECT v.set_code,v.booster_name,s.set_name,s.release_date,s.set_type
            FROM chaos_booster_variants v JOIN sets s ON s.set_code=v.set_code
            WHERE v.booster_weight>0 GROUP BY v.set_code,v.booster_name
            ORDER BY s.release_date DESC,s.set_name,v.booster_name''').fetchall()
    return [{**dict(row), 'label': BOOSTER_LABELS[row['booster_name']]}
            for row in rows if row['booster_name'] in BOOSTER_LABELS]


def load_product(set_code, booster_name):
    with closing(get_db_connection()) as conn:
        ensure_simulator_schema(conn)
        variants = [dict(r) for r in conn.execute('''SELECT booster_index,booster_weight FROM chaos_booster_variants
            WHERE set_code=? AND booster_name=? AND booster_weight>0 ORDER BY booster_index''', (set_code, booster_name))]
        if not variants:
            raise ValueError('This booster has no imported pack definition. Choose another product.')
        contents = {}
        for row in conn.execute('''SELECT booster_index,sheet_name,sheet_picks FROM chaos_booster_variant_contents
                WHERE set_code=? AND booster_name=?''', (set_code, booster_name)):
            contents.setdefault(row['booster_index'], {})[row['sheet_name']] = row['sheet_picks']
        rule_row = conn.execute('SELECT rules_json FROM simulator_booster_rules WHERE set_code=? AND booster_name=?',
                                (set_code, booster_name)).fetchone()
        rules = json.loads(rule_row[0]) if rule_row else {}
        sheets = {r['sheet_name']: {**dict(r), 'cards': [], **rules.get(r['sheet_name'], {})}
                  for r in conn.execute('SELECT * FROM chaos_booster_sheets WHERE set_code=? AND booster_name=?',
                                        (set_code, booster_name))}
        # Sheet membership is authoritative, including special guests, tokens,
        # and bonus printings marked non-booster by the general card catalogue.
        for row in conn.execute('''SELECT sc.sheet_name,sc.card_weight,cc.card_uuid,cc.card_name,cc.set_code,
                cc.rarity,cc.type_line,cc.collector_number,cc.scryfall_id,cc.promo_types_json,
                cc.colors_json,cc.is_dual_faced
            FROM chaos_booster_sheet_cards sc LEFT JOIN chaos_cards cc ON cc.card_uuid=sc.card_uuid
            WHERE sc.set_code=? AND sc.booster_name=? AND sc.card_weight>0''', (set_code, booster_name)):
            if row['sheet_name'] not in sheets:
                continue
            if not row['card_uuid']:
                raise ValueError('Some cards in this booster are missing. Refresh the card database before opening it.')
            card = dict(row)
            card['promo_types'] = card_promo_types(card)
            card['colors'] = json.loads(card.pop('colors_json') or '[]')
            card.pop('promo_types_json')
            sheets[row['sheet_name']]['cards'].append(card)
        boxes = [dict(r) for r in conn.execute('SELECT * FROM simulator_boxes WHERE set_code=? AND booster_name=?',
                                              (set_code, booster_name))]
        set_row = conn.execute('SELECT set_name FROM sets WHERE set_code=?', (set_code,)).fetchone()
    for variant in variants:
        variant['contents'] = contents.get(variant['booster_index'], {})
        if not variant['contents'] or any(name not in sheets or not sheets[name]['cards']
                for name, picks in variant['contents'].items() if picks > 0):
            raise ValueError('This booster has an incomplete card pool. Refresh the card database or choose another product.')
    return {'set_code': set_code, 'booster_name': booster_name,
            'set_name': set_row[0] if set_row else set_code,
            'label': BOOSTER_LABELS.get(booster_name, sheet_label(booster_name)),
            'variants': variants, 'sheets': sheets, 'boxes': boxes}


def finish_for(card, sheet):
    if not sheet['sheet_is_foil']:
        return 'normal'
    if 'etched' in sheet['sheet_name'].lower() or 'etched' in card['promo_types']:
        return 'etched'
    return 'foil'


def public_card(card, sheet):
    finish = finish_for(card, sheet)
    return {key: card[key] for key in ('card_uuid', 'card_name', 'set_code', 'rarity', 'type_line',
                                      'collector_number', 'scryfall_id', 'is_dual_faced')} | {
        'sheet_name': sheet['sheet_name'], 'finish_type': finish,
        'sheet_is_foil': int(finish != 'normal'), 'promo_types': card['promo_types'],
        'finish_label': ('Surge foil' if finish == 'foil' and 'surgefoil' in card['promo_types']
                         else {'normal': '', 'foil': 'Foil', 'etched': 'Etched foil'}[finish]),
    }


def draw_sheet(sheet, count):
    if count <= 0:
        return []
    if sheet.get('fixed'):
        cards = [card for card in sheet['cards'] for _ in range(int(card['card_weight']))]
        if len(cards) != count:
            raise ValueError('The fixed contents for this pack are incomplete. Refresh the card database.')
        return cards
    available, result = list(sheet['cards']), []
    allow_duplicates = bool(sheet.get('allowDuplicates', False))

    def pick(pool):
        card = choose_weighted_row(pool, 'card_weight')
        if card is None:
            raise ValueError('This sheet cannot supply the required cards. Refresh the card database.')
        result.append(card)
        if not allow_duplicates:
            available[:] = [candidate for candidate in available if candidate['card_uuid'] != card['card_uuid']]

    # A balanced sheet includes one monocolor card per color when all five are
    # available. Remaining slots use its published weights.
    if sheet.get('sheet_has_balance_colors') and count >= 5:
        pools = [[c for c in available if c['colors'] == [color]] for color in 'WUBRG']
        if all(pools):
            for pool in pools:
                pick(pool)
    while len(result) < count:
        pick(available)
    return result


def open_product(product):
    variant = choose_weighted_row(product['variants'], 'booster_weight')
    cards = []
    for name, count in variant['contents'].items():
        sheet = product['sheets'][name]
        cards.extend(public_card(card, sheet) for card in draw_sheet(sheet, count))
    cards = sort_opened_chaos_pack_cards(cards, product['booster_name'], lambda _: None)
    return {'set_code': product['set_code'], 'booster_name': product['booster_name'],
            'name': f"{product['set_name']} · {product['label']}", 'cards': cards,
            'variant_index': variant['booster_index']}


def describe_product(product):
    total_weight = sum(v['booster_weight'] for v in product['variants'])
    slots = []
    for name, sheet in product['sheets'].items():
        counts = [v['contents'].get(name, 0) for v in product['variants']]
        if not any(counts):
            continue
        chance = sum(v['booster_weight'] for v in product['variants'] if v['contents'].get(name, 0)) / total_weight
        slots.append({'name': name, 'label': sheet_label(name), 'min': min(counts), 'max': max(counts),
                      'chance': chance, 'foil': bool(sheet['sheet_is_foil']),
                      'pool_count': len(sheet['cards']), 'fixed': bool(sheet.get('fixed'))})
    counts = [sum(v['contents'].values()) for v in product['variants']]
    return {key: product[key] for key in ('set_code', 'booster_name', 'set_name', 'label')} | {
        'slots': slots, 'min_cards': min(counts), 'max_cards': max(counts),
        'boxes': [{'id': box['product_uuid'], 'name': box['name'], 'packs': json.loads(box['packs_json'])}
                  for box in product['boxes']],
    }

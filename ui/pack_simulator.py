"""Standalone pack simulator routes, isolated from campaign and draft state."""
import json
import sqlite3
from contextlib import closing
from decimal import Decimal, InvalidOperation
from uuid import UUID

from flask import jsonify, render_template, request, url_for

from db.pack_simulator import get_opening, list_openings, reveal_cards, save_opening, simulator_pack_key
from db.database import get_db_connection, get_custom_draft_sets, bulk_add_cards_to_custom_draft_set
from db.pricing import get_pack_price_preferences
from modes.pack_art import product_art_relpath
from db.sealed_prices import lookup_sealed_prices
from modes.chaos import (get_chaos_pack_art_info, get_chaos_pack_art_image_src,
                        get_chaos_campaigns, save_opened_chaos_pack_to_tracking_db)
from modes.pack_simulator import get_catalog, load_product, describe_product, open_product, public_card, open_included_cards


def register_pack_simulator_routes(app, get_config, get_print_defaults=None):
    def box_art(code, booster, image_type=None):
        key = 'draft' if booster == 'default' else booster
        path = product_art_relpath(code, image_type or key + '_box', app.static_folder)
        return get_chaos_pack_art_image_src(path) if path else None

    def source_preferences():
        enabled, source = get_pack_price_preferences(get_config())
        return source if enabled else 'none'

    def product_identity():
        code = str(request.args.get('set') or '').strip().upper()
        booster = str(request.args.get('booster') or '').strip().lower()
        if not code or not booster or len(code) > 20 or len(booster) > 150:
            raise ValueError('Choose a set and booster type.')
        return code, booster

    def serialize(opening):
        opening['box_image_src'] = box_art(opening['set_code'], opening['booster_name'], opening.get('image_type')) if opening.get('box_id') else None
        if opening['box_image_src']:
            opening['product_image_src'] = opening['box_image_src']
        for pack in opening['packs']:
            pack['image_src'] = get_chaos_pack_art_image_src(get_chaos_pack_art_info(
                pack['set_code'], pack['booster_name'], app.static_folder)['image_path'])
            for card in pack['cards']:
                card['image_src'] = url_for('chaos_card_image', card_uuid=card['card_uuid'])
                if card['is_dual_faced']:
                    card['back_image_src'] = url_for('chaos_card_image', card_uuid=card['card_uuid'], face='back')
        opening['price_source'] = source_preferences()
        return opening

    def failure(exc):
        if isinstance(exc, ValueError):
            return jsonify(ok=False, message=str(exc)), 400
        app.logger.exception('Pack simulator database operation failed')
        return jsonify(ok=False, message='The card database is busy. Your current opening is safe; try again shortly.'), 503

    @app.get('/pack-simulator')
    def pack_simulator():
        value_source = get_config().get('simulator_value_source', 'lower')
        if value_source not in {'lower', 'manapool', 'cardkingdom'}:
            value_source = 'lower'
        return render_template('pack_simulator.html', price_source=source_preferences(), value_source=value_source,
                               print_export_defaults=get_print_defaults(get_config()) if get_print_defaults else {})

    @app.get('/api/pack-simulator/catalog')
    def pack_simulator_catalog():
        try:
            products = get_catalog()
            for product in products:
                product['image_src'] = get_chaos_pack_art_image_src(get_chaos_pack_art_info(
                    product['set_code'], product['booster_name'], app.static_folder)['image_path'])
            return jsonify(ok=True, products=products)
        except sqlite3.Error as exc:
            return failure(exc)

    @app.get('/api/pack-simulator/product')
    def pack_simulator_product():
        try:
            code, booster = product_identity()
            product = describe_product(load_product(code, booster))
            art = get_chaos_pack_art_info(code, booster, app.static_folder)
            product['image_src'] = get_chaos_pack_art_image_src(art['image_path'])
            for box in product['boxes']:
                box['image_src'] = box_art(code, booster, box.get('image_type'))
            return jsonify(ok=True, product=product)
        except (ValueError, sqlite3.Error) as exc:
            return failure(exc)

    @app.get('/api/pack-simulator/pool')
    def pack_simulator_pool():
        try:
            product = load_product(*product_identity())
            sheet = product['sheets'].get(request.args.get('sheet'))
            if not sheet:
                raise ValueError('Choose a slot to browse its card pool.')
            cards = sorted(sheet['cards'], key=lambda c: (c['card_name'], c['collector_number'] or ''))
            total = sum(c['card_weight'] for c in cards)
            return jsonify(ok=True, cards=[public_card(c, sheet) | {
                'image_src': url_for('chaos_card_image', card_uuid=c['card_uuid']),
                'back_image_src': url_for('chaos_card_image', card_uuid=c['card_uuid'], face='back') if c['is_dual_faced'] else None,
                'draw_chance': c['card_weight'] / total,
            } for c in cards], fixed=bool(sheet.get('fixed')))
        except (ValueError, sqlite3.Error) as exc:
            return failure(exc)

    @app.get('/api/pack-simulator/prices')
    def pack_simulator_sealed_prices():
        if source_preferences() == 'none':
            return jsonify(ok=True, disabled=True)
        try:
            code, booster = product_identity()
            box_id = request.args.get('box') or None
            if box_id:
                box_id = str(UUID(box_id))
            return jsonify(ok=True, product=lookup_sealed_prices(code,booster,box_id))
        except ValueError as exc:
            return failure(exc)

    @app.post('/api/pack-simulator/open')
    def pack_simulator_open():
        try:
            data = request.get_json(silent=True)
            if not isinstance(data, dict):
                raise ValueError('Choose a product to open.')
            try:
                opening_id = str(UUID(str(data.get('request_id'))))
            except (ValueError, TypeError, AttributeError):
                raise ValueError('A valid opening request ID is required.')
            existing = get_opening(opening_id)
            if existing:
                return jsonify(ok=True, opening=serialize(existing))
            code = str(data.get('set_code') or '').strip().upper()
            booster = str(data.get('booster_name') or '').strip().lower()
            if not any(p['set_code'] == code and p['booster_name'] == booster for p in get_catalog()):
                raise ValueError('Choose an available booster from the product list.')
            product = load_product(code, booster)
            count = data.get('count', 1)
            if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 36:
                raise ValueError('Open between 1 and 36 packs at a time.')
            cost = None
            if data.get('cost') not in (None, ''):
                try:
                    cost_value = Decimal(str(data['cost']))
                    if not cost_value.is_finite() or not 0 <= cost_value <= 1000000:
                        raise InvalidOperation
                    cost = float(cost_value.quantize(Decimal('.01')))
                except (InvalidOperation, ValueError):
                    raise ValueError('Enter a total cost between $0 and $1,000,000.')
            recipe = [{'set_code': code, 'booster_name': booster, 'count': count}]
            name = f"{product['set_name']} · {product['label']}"
            box = None
            if data.get('box_id'):
                box = next((b for b in product['boxes'] if b['product_uuid'] == data['box_id']), None)
                if not box:
                    raise ValueError('This product is unavailable. Choose another product.')
                if box.get('unavailable_reason'):
                    raise ValueError(box['unavailable_reason'])
                recipe, name = json.loads(box['packs_json']), box['name']
            products, packs, index = {(code, booster): product}, [], 0
            for item in recipe:
                identity = (item['set_code'], item['booster_name'])
                if 'cards' not in item and identity not in products:
                    products[identity] = load_product(*identity)
                for _ in range(item['count']):
                    pack = open_included_cards(item) if 'cards' in item else open_product(products[identity])
                    for card in pack['cards']:
                        card['index'] = index
                        index += 1
                    packs.append(pack)
                    if index > 3000:
                        raise ValueError('This opening is too large. Choose fewer packs.')
            payload = {'name': name, 'release_date': product.get('release_date', ''), 'set_code': code, 'booster_name': booster, 'packs': packs,
                       'card_count': index, 'cost': cost, 'box_id': data.get('box_id'),
                       'image_type': box.get('image_type') if box else None,
                       'count': count, 'product_image_src': get_chaos_pack_art_image_src(
                           get_chaos_pack_art_info(code, booster, app.static_folder)['image_path'])}
            opening = save_opening(opening_id, payload)
            return jsonify(ok=True, opening=serialize(opening))
        except (ValueError, sqlite3.Error) as exc:
            return failure(exc)

    @app.get('/api/pack-simulator/history')
    def pack_simulator_history():
        try:
            return jsonify(ok=True, openings=list_openings())
        except sqlite3.Error as exc:
            return failure(exc)

    @app.get('/api/pack-simulator/save-destinations')
    def pack_simulator_save_destinations():
        try:
            return jsonify(ok=True,
                campaigns=[{'id':c['campaign_id'],'name':c['campaign_name']}
                           for c in get_chaos_campaigns(include_disabled=False)],
                sets=[{'id':s['set_code'],'name':s['set_name']}
                      for s in get_custom_draft_sets() if s['is_active']])
        except sqlite3.Error as exc:
            return failure(exc)

    @app.post('/api/pack-simulator/openings/<uuid:opening_id>/save')
    def pack_simulator_save(opening_id):
        try:
            data = request.get_json(silent=True)
            if not isinstance(data, dict):
                raise ValueError('Choose a destination for this pack.')
            opening = get_opening(str(opening_id))
            if not opening:
                return jsonify(ok=False,message='This opening could not be found.'),404
            indices = data.get('pack_indices', [data.get('pack_index')])
            if (not isinstance(indices, list) or not indices or len(indices) > len(opening['packs'])
                    or any(type(index) is not int or not 0 <= index < len(opening['packs']) for index in indices)
                    or len(set(indices)) != len(indices)):
                raise ValueError('Choose valid packs from this opening.')
            packs = [opening['packs'][index] for index in indices]
            destination = str(data.get('destination') or '')
            if data.get('kind') == 'campaign':
                campaign = next((c for c in get_chaos_campaigns(include_disabled=False)
                                 if str(c['campaign_id']) == destination), None)
                if not campaign:
                    raise ValueError('This campaign is no longer available. Choose another destination.')
                # Each pack keeps its retry-safe identity, including during batch saves.
                results = []
                for index, pack in zip(indices, packs):
                    result = save_opened_chaos_pack_to_tracking_db({
                        'simulator_pack_key':simulator_pack_key(opening_id, index),
                        'set_code':pack['set_code'], 'booster_name':pack['booster_name'],
                        'booster_index':pack.get('variant_index',0), 'display_name':pack['name'],
                        'cards':pack['cards'], 'total_cards':len(pack['cards']),
                    },campaign_id=campaign['campaign_id'])
                    if not result.get('ok'):
                        raise ValueError(result.get('message') or 'A pack could not be saved. Retry to finish saving the opening.')
                    results.append(result)
                return jsonify(ok=True, message=f"{len(results)} pack{'s' if len(results) != 1 else ''} saved to {campaign['campaign_name']}.",
                               tracked_pack_ids=[result['tracked_pack_id'] for result in results],
                               tracked_pack_id=results[0]['tracked_pack_id'],
                               already_saved=all(result['already_saved'] for result in results))
            if data.get('kind') == 'set':
                draft_set = next((s for s in get_custom_draft_sets()
                                  if s['set_code'] == destination and s['is_active']),None)
                if not draft_set:
                    raise ValueError('This custom set is no longer available. Choose another destination.')
                result = bulk_add_cards_to_custom_draft_set(destination, [card for pack in packs for card in pack['cards']], preserve_finish=True)
                return jsonify(ok=True, added_count=result['added_count'],skipped_count=result['skipped_count'],
                    message=f"Added {result['added_count']} cards to {draft_set['set_name']}. "
                            f"{result['skipped_count']} already represented in the set.")
            raise ValueError('Choose a Chaos Draft campaign or a custom draft set.')
        except (ValueError, sqlite3.Error) as exc:
            return failure(exc)
        except RuntimeError as exc:
            return jsonify(ok=False,message=str(exc)),503

    @app.post('/api/pack-simulator/openings/<uuid:opening_id>/cost')
    def pack_simulator_cost(opening_id):
        data = request.get_json(silent=True)
        try:
            if not isinstance(data, dict):
                raise ValueError('Enter a valid total cost.')
            cost = None
            if data.get('cost') not in (None, ''):
                value = Decimal(str(data['cost']))
                if not value.is_finite() or not 0 <= value <= 1000000:
                    raise ValueError('Enter a total cost between $0 and $1,000,000.')
                cost = float(value.quantize(Decimal('.01')))
            with closing(get_db_connection()) as conn, conn:
                conn.execute('BEGIN IMMEDIATE')
                row = conn.execute('SELECT payload_json FROM simulator_openings WHERE id=?',(str(opening_id),)).fetchone()
                if not row:
                    return jsonify(ok=False,message='This opening could not be found.'),404
                payload = json.loads(row[0]); payload['cost'] = cost
                conn.execute('UPDATE simulator_openings SET payload_json=? WHERE id=?',(json.dumps(payload),str(opening_id)))
            return jsonify(ok=True,cost=cost)
        except (ValueError, InvalidOperation):
            return jsonify(ok=False,message='Enter a total cost between $0 and $1,000,000.'),400
        except sqlite3.Error as exc:
            return failure(exc)

    @app.get('/api/pack-simulator/openings/<uuid:opening_id>')
    def pack_simulator_opening(opening_id):
        try:
            opening = get_opening(str(opening_id))
            if not opening:
                return jsonify(ok=False, message='This opening could not be found.'), 404
            return jsonify(ok=True, opening=serialize(opening))
        except sqlite3.Error as exc:
            return failure(exc)

    @app.post('/api/pack-simulator/openings/<uuid:opening_id>/reveal')
    def pack_simulator_reveal(opening_id):
        data = request.get_json(silent=True)
        indices = data.get('indices') if isinstance(data, dict) else None
        if not isinstance(indices, list) or len(indices) > 3000 or any(type(i) is not int for i in indices):
            return jsonify(ok=False, message='Provide card positions to reveal.'), 400
        try:
            revealed = reveal_cards(str(opening_id), indices)
            if revealed is None:
                return jsonify(ok=False, message='This opening could not be found.'), 404
            return jsonify(ok=True, revealed=revealed)
        except sqlite3.Error as exc:
            return failure(exc)

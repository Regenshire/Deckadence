"""Nonblocking price API. Price problems never change a card operation's result."""
from flask import jsonify, request
from db.market_prices import lookup_card_prices, normalize_finish, summarize_card_prices, _uuid


def register_card_price_routes(app):
    @app.post("/api/card-prices")
    def card_prices_lookup():
        payload = request.get_json(silent=True)
        cards = payload.get("cards") if isinstance(payload, dict) else None
        if not isinstance(cards, list) or not 1 <= len(cards) <= 1000:
            return jsonify(ok=False, message="Provide between 1 and 1000 cards."), 400
        normalized = []
        for card in cards:
            if isinstance(card, str):
                card = {"card_uuid": card}
            if not isinstance(card, dict) or not _uuid(card.get("card_uuid")):
                return jsonify(ok=False, message="Each card needs a valid printing UUID."), 400
            normalized.append({"card_uuid": card["card_uuid"], "finish": normalize_finish(card.get("finish"))})
        results = lookup_card_prices(normalized)
        return jsonify(ok=True, cards=results, totals=summarize_card_prices(results))

    @app.get("/api/card-prices/<card_uuid>")
    def card_price_lookup(card_uuid):
        if not _uuid(card_uuid):
            return jsonify(ok=False, message="A valid printing UUID is required."), 400
        cards = lookup_card_prices([{"card_uuid": card_uuid, "finish": normalize_finish(request.args.get("finish"))}])
        return jsonify(ok=True, card=cards[0])

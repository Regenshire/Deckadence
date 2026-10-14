# *** CARD FINISHES - Identify Normal, Foil, and Etched Cards ***
import json
import logging
import os
from contextlib import closing

from paths import SCRYFALL_DEFAULT_CARDS_PATH


def backfill_finish_metadata():
    """One-time upgrade from an existing local download; never needs the network.

    A missing/corrupt download leaves unknown rows alone. A normal card database
    refresh also populates this field directly from MTGJSON promoTypes.
    """
    from db.database import get_db_connection

    if not os.path.isfile(SCRYFALL_DEFAULT_CARDS_PATH):
        return 0
    try:
        with closing(get_db_connection()) as conn:
            wanted = {row[0] for row in conn.execute(
                "SELECT DISTINCT scryfall_id FROM chaos_cards "
                "WHERE promo_types_json IS NULL AND scryfall_id IS NOT NULL"
            )}
        if not wanted:
            return 0
        updates = []
        with open(SCRYFALL_DEFAULT_CARDS_PATH, encoding="utf-8") as source:
            for line in source:
                card = json.loads(line)
                if card.get("id") in wanted:
                    updates.append((json.dumps(card.get("promo_types") or []), card["id"]))
        with closing(get_db_connection()) as conn, conn:
            conn.executemany(
                "UPDATE chaos_cards SET promo_types_json = ? "
                "WHERE scryfall_id = ? COLLATE NOCASE AND promo_types_json IS NULL",
                updates,
            )
        return len(updates)
    except (OSError, ValueError) as exc:
        logging.getLogger(__name__).warning("Finish metadata upgrade skipped: %s", exc)
        return 0


def card_promo_types(card_row):
    try:
        value = json.loads(dict(card_row).get("promo_types_json") or "[]")
        return value if isinstance(value, list) else []
    except (ValueError, TypeError):
        return []

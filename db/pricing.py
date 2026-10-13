import json
import os
import zipfile
from datetime import datetime, timezone

import requests

from download_identity import get_download_user_agent

from db.database import get_db_connection
from paths import ALL_PRICES_TODAY_PATH, ALL_PRICES_TODAY_ZIP_PATH
from settings import MTGJSON_ALL_PRICES_TODAY_URL


def ensure_price_download_directories():
    os.makedirs(os.path.dirname(ALL_PRICES_TODAY_PATH), exist_ok=True)


def download_all_prices_today_json():
    ensure_price_download_directories()

    headers = {
        "User-Agent": get_download_user_agent(),
        "Accept": "application/zip,application/octet-stream;q=0.9,*/*;q=0.8",
    }

    response = requests.get(
        MTGJSON_ALL_PRICES_TODAY_URL,
        headers=headers,
        timeout=300,
    )
    response.raise_for_status()

    with open(ALL_PRICES_TODAY_ZIP_PATH, "wb") as file_handle:
        file_handle.write(response.content)

    with zipfile.ZipFile(ALL_PRICES_TODAY_ZIP_PATH, "r") as zip_ref:
        zip_members = zip_ref.namelist()
        target_member = None

        for member_name in zip_members:
            if member_name.lower().endswith(".json"):
                target_member = member_name
                break

        if not target_member:
            raise ValueError("AllPricesToday zip did not contain a JSON file.")

        with zip_ref.open(target_member) as source_file:
            with open(ALL_PRICES_TODAY_PATH, "wb") as output_file:
                output_file.write(source_file.read())


def _get_latest_price_from_points(price_points):
    if not isinstance(price_points, dict) or not price_points:
        return None, None

    latest_date = None
    latest_value = None

    for date_key, value in price_points.items():
        if latest_date is None or str(date_key) > str(latest_date):
            latest_date = str(date_key)
            latest_value = value

    try:
        latest_value = float(latest_value)
    except (TypeError, ValueError):
        latest_value = None

    return latest_date, latest_value


def import_all_prices_today_into_database():
    if not os.path.exists(ALL_PRICES_TODAY_PATH):
        raise FileNotFoundError("AllPricesToday.json was not found.")

    with open(ALL_PRICES_TODAY_PATH, "r", encoding="utf-8") as file_handle:
        raw_json = json.load(file_handle)

    price_data = raw_json.get("data", {})
    if not isinstance(price_data, dict):
        raise ValueError("AllPricesToday.json did not contain a valid data object.")

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM card_prices")

    updated_at_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    inserted_count = 0

    for card_uuid, provider_block in price_data.items():
        if not isinstance(provider_block, dict):
            continue

        paper_block = provider_block.get("paper") or {}
        tcgplayer_block = paper_block.get("tcgplayer") or {}
        retail_block = tcgplayer_block.get("retail") or {}

        if not isinstance(retail_block, dict):
            continue

        normal_date, normal_price = _get_latest_price_from_points(retail_block.get("normal"))
        foil_date, foil_price = _get_latest_price_from_points(retail_block.get("foil"))
        etched_date, etched_price = _get_latest_price_from_points(retail_block.get("etched"))

        currency = tcgplayer_block.get("currency") or "USD"
        price_date = max(
            [d for d in [normal_date, foil_date, etched_date] if d],
            default=None,
        )

        cursor.execute(
            """
            INSERT INTO card_prices (
                card_uuid,
                tcgplayer_normal_price,
                tcgplayer_foil_price,
                tcgplayer_etched_price,
                currency,
                price_date,
                updated_at_utc
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                card_uuid,
                normal_price,
                foil_price,
                etched_price,
                currency,
                price_date,
                updated_at_utc,
            ),
        )

        inserted_count += 1

    conn.commit()
    conn.close()

    return inserted_count


def get_card_price_by_uuid(card_uuid, finish_type="normal", price_source=None):
    """Compatibility entry point returning two independent vendor quotes."""
    from db.market_prices import lookup_card_price
    return lookup_card_price(card_uuid, finish_type)


def get_pack_price_preferences(config):
    source = str(config.get("pack_price_source") or "manapool").strip().lower()
    if source not in {"manapool", "cardkingdom", "none"}:
        source = "manapool"
    enabled = source != "none" and str(config.get("display_pack_prices", "1")) == "1"
    return enabled, source


def select_price(prices, source="manapool", fallback=True):
    """Select a display quote without changing either vendor's stored data."""
    import math
    if source == "none":
        return {"price": None, "provider": None, "fallback": False}
    preferred = "cardkingdom" if source == "cardkingdom" else "manapool"
    candidates = [preferred]
    if fallback:
        candidates.append("cardkingdom" if preferred == "manapool" else "manapool")
    for provider in candidates:
        quote = (prices or {}).get(provider) or {}
        value = quote.get("price")
        if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
            return {**quote, "provider": provider, "fallback": provider != preferred}
    return {"price": None, "provider": preferred, "fallback": False}


def get_finish_type_for_pack_card(card_entry):
    from db.market_prices import normalize_finish
    explicit = normalize_finish(card_entry.get("finish_type"))
    if explicit == "etched":
        return explicit
    if int(card_entry.get("sheet_is_foil") or card_entry.get("is_foil") or 0) == 1:
        return "foil"
    if "sheet_is_foil" not in card_entry and "is_foil" not in card_entry:
        return explicit
    return "normal"


def enrich_pack_cards_with_prices(cards, display_prices=True, price_source=None):
    from db.market_prices import lookup_card_prices
    entries = [dict(card) for card in cards or []]
    requests = [{"card_uuid": c.get("card_uuid"), "scryfall_id": c.get("scryfall_id"),
                 "finish": get_finish_type_for_pack_card(c)} for c in entries]
    # Page rendering uses cached values only. The browser independently requests
    # missing/expired prices after cards and controls have rendered.
    prices = lookup_card_prices(requests, refresh=False) if display_prices and requests else []
    for index, entry in enumerate(entries):
        entry["finish_type"] = requests[index]["finish"]
        entry["special_badges"] = list(entry.get("special_badges") or [])
        if entry["finish_type"] == "foil" and "Foil" not in entry["special_badges"]:
            entry["special_badges"].append("Foil")
        entry["prices"] = prices[index]["prices"] if prices else {}
    return entries

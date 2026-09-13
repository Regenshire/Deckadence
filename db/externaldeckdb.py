from functools import lru_cache

from db.database import (
    get_db_connection,
    isolation_operation,
)

from db.deckdb import (
    DECK_FORMAT_COMMANDER,
    DECK_ROLE_COMMANDER,
    DECK_ROLE_MAIN,
    DECK_ROLE_PARTNER,
    DECK_SOURCE_TYPE_STANDALONE,
    DECK_STATUS_ACTIVE,
    deck_utc_now,
    ensure_deck_schema,
    normalize_deck_format,
    normalize_deck_role,
    normalize_deck_zone,
)

@lru_cache(maxsize=1)
def ensure_external_deck_schema():
    ensure_deck_schema()

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS deck_external_sources (
            deck_external_source_id INTEGER PRIMARY KEY AUTOINCREMENT,
            deck_id INTEGER NOT NULL,
            provider TEXT NOT NULL,
            external_id TEXT NOT NULL,
            external_url TEXT,
            imported_at_utc TEXT NOT NULL,
            UNIQUE(deck_id, provider),
            FOREIGN KEY (deck_id) REFERENCES decks (deck_id)
        )
        """
    )

    cursor.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_deck_external_sources_lookup
        ON deck_external_sources (
            provider,
            external_id
        )
        """
    )

    conn.commit()
    conn.close()

@isolation_operation
def create_external_import_deck(
    provider,
    external_id,
    external_url,
    deck_name,
    deck_format,
    cards,
):
    ensure_external_deck_schema()

    clean_provider = str(
        provider
        or ""
    ).strip().lower()

    clean_external_id = str(
        external_id
        or ""
    ).strip()

    clean_external_url = str(
        external_url
        or ""
    ).strip()

    clean_deck_name = (
        str(deck_name or "").strip()
        or "Imported Deck"
    )

    clean_deck_format = normalize_deck_format(
        deck_format,
        fallback=DECK_FORMAT_COMMANDER,
    )

    if not clean_provider:
        return {
            "ok": False,
            "message": (
                "External deck provider is required."
            ),
        }

    if not clean_external_id:
        return {
            "ok": False,
            "message": (
                "External deck ID is required."
            ),
        }

    normalized_cards = []

    for raw_card in cards or []:
        card = dict(
            raw_card
            or {}
        )

        card_uuid = str(
            card.get("card_uuid")
            or ""
        ).strip()

        card_name = str(
            card.get("card_name")
            or ""
        ).strip()

        if not card_uuid or not card_name:
            continue

        try:
            quantity = max(
                1,
                int(
                    card.get("quantity")
                    or 1
                ),
            )
        except (TypeError, ValueError):
            quantity = 1

        deck_zone = normalize_deck_zone(
            card.get("deck_zone")
        )

        deck_role = normalize_deck_role(
            card.get("deck_role")
        )

        if deck_zone == "sideboard":
            deck_role = DECK_ROLE_MAIN

        normalized_cards.append({
            "card_uuid": card_uuid,
            "card_name": card_name,
            "quantity": quantity,
            "deck_zone": deck_zone,
            "deck_role": deck_role,
            "is_basic_land": (
                1
                if card.get(
                    "is_basic_land"
                )
                else 0
            ),
            "sheet_is_foil": (
                1
                if card.get(
                    "sheet_is_foil"
                )
                else 0
            ),
        })

    if not normalized_cards:
        return {
            "ok": False,
            "message": (
                "External deck did not contain "
                "any resolved cards."
            ),
        }

    now_utc = deck_utc_now()

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conn.execute(
            "BEGIN IMMEDIATE"
        )

        cursor.execute(
            """
            INSERT INTO decks (
                source_type,
                source_id,
                campaign_id,
                player_id,
                deck_name,
                deck_format,
                status,
                default_view_mode,
                default_sort_mode,
                notes,
                created_at_utc,
                updated_at_utc
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                DECK_SOURCE_TYPE_STANDALONE,
                None,
                None,
                None,
                clean_deck_name,
                clean_deck_format,
                DECK_STATUS_ACTIVE,
                "grid",
                "rarity-desc",
                "",
                now_utc,
                now_utc,
            ),
        )

        deck_id = int(
            cursor.lastrowid
        )

        cursor.execute(
            """
            INSERT INTO deck_builder_layouts (
                deck_id,
                layout_key,
                view_mode,
                sort_mode,
                sideboard_flex,
                deck_flex,
                layout_json,
                created_at_utc,
                updated_at_utc
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                deck_id,
                "default",
                "grid",
                "rarity-desc",
                0.40,
                0.60,
                "{}",
                now_utc,
                now_utc,
            ),
        )

        cursor.execute(
            """
            INSERT INTO deck_external_sources (
                deck_id,
                provider,
                external_id,
                external_url,
                imported_at_utc
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                deck_id,
                clean_provider,
                clean_external_id,
                clean_external_url,
                now_utc,
            ),
        )

        imported_copy_count = 0

        for display_index, card in enumerate(
            normalized_cards
        ):
            stack_column = None

            if card["deck_role"] in {
                DECK_ROLE_COMMANDER,
                DECK_ROLE_PARTNER,
            }:
                stack_column = (
                    card["deck_role"]
                )

            elif card["is_basic_land"]:
                stack_column = "land"

            cursor.execute(
                """
                INSERT INTO deck_cards (
                    deck_id,
                    card_uuid,
                    card_name,
                    deck_zone,
                    quantity,
                    source_type,
                    source_id,
                    source_item_id,
                    is_basic_land,
                    sheet_is_foil,
                    deck_role,
                    stack_column,
                    stack_order,
                    display_order,
                    created_at_utc,
                    updated_at_utc
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    deck_id,
                    card["card_uuid"],
                    card["card_name"],
                    card["deck_zone"],
                    card["quantity"],
                    (
                        f"external_"
                        f"{clean_provider}"
                    ),
                    None,
                    None,
                    card["is_basic_land"],
                    card["sheet_is_foil"],
                    card["deck_role"],
                    stack_column,
                    None,
                    display_index * 10,
                    now_utc,
                    now_utc,
                ),
            )

            if (
                card["is_basic_land"]
                and card["deck_zone"]
                == "deck"
            ):
                cursor.execute(
                    """
                    INSERT INTO deck_basic_land_printings (
                        deck_id,
                        land_name,
                        card_uuid,
                        created_at_utc,
                        updated_at_utc
                    )
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(deck_id, land_name)
                    DO UPDATE SET
                        card_uuid = excluded.card_uuid,
                        updated_at_utc = excluded.updated_at_utc
                    """,
                    (
                        deck_id,
                        card["card_name"],
                        card["card_uuid"],
                        now_utc,
                        now_utc,
                    ),
                )

            imported_copy_count += (
                card["quantity"]
            )

        conn.commit()

        return {
            "ok": True,
            "message": (
                f"Imported "
                f"{imported_copy_count} "
                f"external deck card(s)."
            ),
            "deck_id": deck_id,
            "imported_copy_count": (
                imported_copy_count
            ),
            "imported_row_count": len(
                normalized_cards
            ),
        }

    except Exception as exc:
        conn.rollback()

        return {
            "ok": False,
            "message": str(exc),
        }

    finally:
        conn.close()
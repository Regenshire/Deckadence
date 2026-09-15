from functools import lru_cache

from db.database import (
    ensure_column_exists,
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
            author TEXT,
            external_format TEXT,
            imported_at_utc TEXT NOT NULL,
            UNIQUE(deck_id, provider),
            FOREIGN KEY (deck_id) REFERENCES decks (deck_id)
        )
        """
    )

    ensure_column_exists(
        cursor,
        "deck_external_sources",
        "author",
        "TEXT",
    )

    ensure_column_exists(
        cursor,
        "deck_external_sources",
        "external_format",
        "TEXT",
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


def get_external_deck_source(deck_id, provider=None):
    ensure_external_deck_schema()

    try:
        parsed_deck_id = int(deck_id)
    except (TypeError, ValueError):
        return None

    clean_provider = str(provider or "").strip().lower()

    conn = get_db_connection()

    try:
        if clean_provider:
            row = conn.execute(
                """
                SELECT
                    deck_external_source_id,
                    deck_id,
                    provider,
                    external_id,
                    external_url,
                    author,
                    external_format,
                    imported_at_utc
                FROM deck_external_sources
                WHERE deck_id = ?
                  AND provider = ?
                ORDER BY deck_external_source_id DESC
                LIMIT 1
                """,
                (parsed_deck_id, clean_provider),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT
                    deck_external_source_id,
                    deck_id,
                    provider,
                    external_id,
                    external_url,
                    author,
                    external_format,
                    imported_at_utc
                FROM deck_external_sources
                WHERE deck_id = ?
                ORDER BY deck_external_source_id DESC
                LIMIT 1
                """,
                (parsed_deck_id,),
            ).fetchone()

        return dict(row) if row else None
    finally:
        conn.close()

def _normalize_external_sync_cards(cards):
    normalized_cards = []

    for raw_card in cards or []:
        card = dict(raw_card or {})

        card_uuid = str(card.get("card_uuid") or "").strip()
        card_name = str(card.get("card_name") or "").strip()

        if not card_uuid or not card_name:
            continue

        try:
            quantity = max(1, int(card.get("quantity") or 1))
        except (TypeError, ValueError):
            quantity = 1

        deck_zone = normalize_deck_zone(card.get("deck_zone"))
        deck_role = normalize_deck_role(card.get("deck_role"))

        if deck_zone == "sideboard":
            deck_role = DECK_ROLE_MAIN

        normalized_cards.append({
            "card_uuid": card_uuid,
            "card_name": card_name,
            "quantity": quantity,
            "deck_zone": deck_zone,
            "deck_role": deck_role,
            "is_basic_land": 1 if card.get("is_basic_land") else 0,
            "sheet_is_foil": 1 if card.get("sheet_is_foil") else 0,
        })

    return normalized_cards


def _upsert_external_source_row(
    cursor,
    deck_id,
    provider,
    external_id,
    external_url,
    author,
    external_format,
    timestamp_utc,
):
    cursor.execute(
        """
        INSERT INTO deck_external_sources (
            deck_id,
            provider,
            external_id,
            external_url,
            author,
            external_format,
            imported_at_utc
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(deck_id, provider) DO UPDATE SET
            external_id = excluded.external_id,
            external_url = excluded.external_url,
            author = excluded.author,
            external_format = excluded.external_format,
            imported_at_utc = excluded.imported_at_utc
        """,
        (
            deck_id,
            provider,
            external_id,
            external_url,
            author,
            external_format,
            timestamp_utc,
        ),
    )


def _insert_external_sync_card(
    cursor,
    deck_id,
    provider,
    card,
    display_order,
    timestamp_utc,
):
    stack_column = None

    if card["deck_role"] in {
        DECK_ROLE_COMMANDER,
        DECK_ROLE_PARTNER,
    }:
        stack_column = card["deck_role"]

    elif (
        card["is_basic_land"]
        and card["deck_zone"] == "deck"
    ):
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
            f"external_{provider}",
            None,
            None,
            card["is_basic_land"],
            card["sheet_is_foil"],
            card["deck_role"],
            stack_column,
            None,
            display_order,
            timestamp_utc,
            timestamp_utc,
        ),
    )

    if (
        card["is_basic_land"]
        and card["deck_zone"] == "deck"
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
            ON CONFLICT(deck_id, land_name) DO UPDATE SET
                card_uuid = excluded.card_uuid,
                updated_at_utc = excluded.updated_at_utc
            """,
            (
                deck_id,
                card["card_name"],
                card["card_uuid"],
                timestamp_utc,
                timestamp_utc,
            ),
        )


@isolation_operation
def save_external_deck_source(
    deck_id,
    provider,
    external_id,
    external_url,
    author="",
    external_format="",
):
    ensure_external_deck_schema()

    try:
        parsed_deck_id = int(deck_id)
    except (TypeError, ValueError):
        return {
            "ok": False,
            "message": "Invalid deck ID.",
        }

    clean_provider = str(provider or "").strip().lower()
    clean_external_id = str(external_id or "").strip()
    clean_external_url = str(external_url or "").strip()
    clean_author = str(author or "").strip()
    clean_external_format = str(external_format or "").strip()

    if (
        not clean_provider
        or not clean_external_id
        or not clean_external_url
    ):
        return {
            "ok": False,
            "message": "External deck source information is incomplete.",
        }

    now_utc = deck_utc_now()

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conn.execute("BEGIN IMMEDIATE")

        deck_row = cursor.execute(
            """
            SELECT deck_id
            FROM decks
            WHERE deck_id = ?
              AND status = ?
            """,
            (
                parsed_deck_id,
                DECK_STATUS_ACTIVE,
            ),
        ).fetchone()

        if not deck_row:
            conn.rollback()

            return {
                "ok": False,
                "message": "Deck was not found.",
            }

        _upsert_external_source_row(
            cursor,
            parsed_deck_id,
            clean_provider,
            clean_external_id,
            clean_external_url,
            clean_author,
            clean_external_format,
            now_utc,
        )

        cursor.execute(
            """
            UPDATE decks
            SET updated_at_utc = ?
            WHERE deck_id = ?
            """,
            (
                now_utc,
                parsed_deck_id,
            ),
        )

        conn.commit()

        return {
            "ok": True,
            "message": "Moxfield deck link saved.",
            "deck_id": parsed_deck_id,
        }

    except Exception as exc:
        conn.rollback()

        return {
            "ok": False,
            "message": str(exc),
        }

    finally:
        conn.close()


@isolation_operation
def apply_external_deck_to_existing_deck(
    deck_id,
    provider,
    external_id,
    external_url,
    cards,
    mode,
    author="",
    external_format="",
):
    ensure_external_deck_schema()

    try:
        parsed_deck_id = int(deck_id)
    except (TypeError, ValueError):
        return {
            "ok": False,
            "message": "Invalid deck ID.",
        }

    clean_mode = str(mode or "").strip().lower()

    if clean_mode not in {
        "add_missing",
        "add_all",
        "overwrite",
    }:
        return {
            "ok": False,
            "message": "Unsupported external deck sync mode.",
        }

    clean_provider = str(provider or "").strip().lower()
    clean_external_id = str(external_id or "").strip()
    clean_external_url = str(external_url or "").strip()
    clean_author = str(author or "").strip()
    clean_external_format = str(external_format or "").strip()

    normalized_cards = _normalize_external_sync_cards(cards)

    if not normalized_cards:
        return {
            "ok": False,
            "message": "External deck did not contain any resolved cards.",
        }

    now_utc = deck_utc_now()

    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        conn.execute("BEGIN IMMEDIATE")

        deck_row = cursor.execute(
            """
            SELECT deck_id
            FROM decks
            WHERE deck_id = ?
              AND status = ?
            """,
            (
                parsed_deck_id,
                DECK_STATUS_ACTIVE,
            ),
        ).fetchone()

        if not deck_row:
            conn.rollback()

            return {
                "ok": False,
                "message": "Deck was not found.",
            }

        removed_copy_count = 0
        added_copy_count = 0

        if clean_mode == "overwrite":
            count_row = cursor.execute(
                """
                SELECT COALESCE(SUM(quantity), 0) AS copy_count
                FROM deck_cards
                WHERE deck_id = ?
                  AND deck_zone IN ('deck', 'sideboard')
                """,
                (parsed_deck_id,),
            ).fetchone()

            if count_row:
                removed_copy_count = int(
                    count_row["copy_count"]
                    or 0
                )

            cursor.execute(
                """
                DELETE FROM deck_cards
                WHERE deck_id = ?
                  AND deck_zone IN ('deck', 'sideboard')
                """,
                (parsed_deck_id,),
            )

            cursor.execute(
                """
                DELETE FROM deck_basic_land_printings
                WHERE deck_id = ?
                """,
                (parsed_deck_id,),
            )

            next_display_order = 0

        else:
            display_row = cursor.execute(
                """
                SELECT COALESCE(MAX(display_order), -10) AS max_display_order
                FROM deck_cards
                WHERE deck_id = ?
                  AND deck_zone IN ('deck', 'sideboard')
                """,
                (parsed_deck_id,),
            ).fetchone()

            if display_row:
                next_display_order = (
                    int(
                        display_row["max_display_order"]
                        or -10
                    )
                    + 10
                )
            else:
                next_display_order = 0

        for card in normalized_cards:
            card_to_add = dict(card)

            if clean_mode == "add_missing":
                existing_row = cursor.execute(
                    """
                    SELECT COALESCE(SUM(quantity), 0) AS copy_count
                    FROM deck_cards
                    WHERE deck_id = ?
                      AND deck_zone = ?
                      AND LOWER(card_name) = LOWER(?)
                    """,
                    (
                        parsed_deck_id,
                        card["deck_zone"],
                        card["card_name"],
                    ),
                ).fetchone()

                existing_count = 0

                if existing_row:
                    existing_count = int(
                        existing_row["copy_count"]
                        or 0
                    )

                missing_count = max(
                    0,
                    int(card["quantity"])
                    - existing_count,
                )

                if missing_count < 1:
                    continue

                card_to_add["quantity"] = missing_count

            _insert_external_sync_card(
                cursor,
                parsed_deck_id,
                clean_provider,
                card_to_add,
                next_display_order,
                now_utc,
            )

            added_copy_count += int(
                card_to_add["quantity"]
            )

            next_display_order += 10

        leader_cards = [
            card
            for card in normalized_cards
            if (
                card["deck_zone"] == "deck"
                and card["deck_role"]
                in {
                    DECK_ROLE_COMMANDER,
                    DECK_ROLE_PARTNER,
                }
            )
        ]

        for deck_role in (
            DECK_ROLE_COMMANDER,
            DECK_ROLE_PARTNER,
        ):
            desired_leader = next(
                (
                    card
                    for card in leader_cards
                    if card["deck_role"] == deck_role
                ),
                None,
            )

            if desired_leader is None:
                continue

            cursor.execute(
                """
                UPDATE deck_cards
                SET deck_role = ?,
                    stack_column = NULL,
                    updated_at_utc = ?
                WHERE deck_id = ?
                  AND deck_role = ?
                """,
                (
                    DECK_ROLE_MAIN,
                    now_utc,
                    parsed_deck_id,
                    deck_role,
                ),
            )

            leader_row = cursor.execute(
                """
                SELECT deck_card_id
                FROM deck_cards
                WHERE deck_id = ?
                  AND deck_zone = 'deck'
                  AND LOWER(card_name) = LOWER(?)
                ORDER BY deck_card_id ASC
                LIMIT 1
                """,
                (
                    parsed_deck_id,
                    desired_leader["card_name"],
                ),
            ).fetchone()

            if leader_row:
                cursor.execute(
                    """
                    UPDATE deck_cards
                    SET deck_role = ?,
                        stack_column = ?,
                        updated_at_utc = ?
                    WHERE deck_card_id = ?
                    """,
                    (
                        deck_role,
                        deck_role,
                        now_utc,
                        int(
                            leader_row[
                                "deck_card_id"
                            ]
                        ),
                    ),
                )

        _upsert_external_source_row(
            cursor,
            parsed_deck_id,
            clean_provider,
            clean_external_id,
            clean_external_url,
            clean_author,
            clean_external_format,
            now_utc,
        )

        cursor.execute(
            """
            UPDATE decks
            SET updated_at_utc = ?
            WHERE deck_id = ?
            """,
            (
                now_utc,
                parsed_deck_id,
            ),
        )

        conn.commit()

        if clean_mode == "overwrite":
            message = (
                f"Replaced the deck with "
                f"{added_copy_count} Moxfield card(s)."
            )

        elif clean_mode == "add_all":
            message = (
                f"Added {added_copy_count} "
                f"Moxfield card(s) to the deck."
            )

        elif added_copy_count:
            message = (
                f"Added {added_copy_count} missing "
                f"Moxfield card(s) to the deck."
            )

        else:
            message = (
                "This deck already contains all cards "
                "from the Moxfield deck."
            )

        return {
            "ok": True,
            "message": message,
            "deck_id": parsed_deck_id,
            "mode": clean_mode,
            "added_copy_count": added_copy_count,
            "removed_copy_count": removed_copy_count,
        }

    except Exception as exc:
        conn.rollback()

        return {
            "ok": False,
            "message": str(exc),
        }

    finally:
        conn.close()


@isolation_operation
def create_external_import_deck(
    provider,
    external_id,
    external_url,
    deck_name,
    deck_format,
    cards,
    author="",
    external_format="",
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

    clean_author = str(
        author
        or ""
    ).strip()

    clean_external_format = str(
        external_format
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
                author,
                external_format,
                imported_at_utc
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                deck_id,
                clean_provider,
                clean_external_id,
                clean_external_url,
                clean_author,
                clean_external_format,
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
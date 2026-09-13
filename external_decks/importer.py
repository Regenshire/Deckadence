from __future__ import annotations

from db.database import (
    get_db_connection,
)

from db.deckdb import (
    DECK_BUILDER_BASIC_LANDS,
)

from db.externaldeckdb import (
    create_external_import_deck,
)

from .core import ExternalDeck

class ExternalDeckImporter:
    IMPORTABLE_BOARDS = {
        "commanders",
        "partners",
        "mainboard",
        "sideboard",
        "companions",
    }

    BOARD_PRIORITY = {
        "commanders": 0,
        "partners": 1,
        "mainboard": 2,
        "sideboard": 3,
        "companions": 4,
    }

    BASIC_LAND_NAMES = {
        name.lower()
        for name
        in DECK_BUILDER_BASIC_LANDS
    }

    def prepare_import(
        self,
        external_deck,
    ):
        if not isinstance(
            external_deck,
            ExternalDeck,
        ):
            raise TypeError(
                "external_deck must be "
                "an ExternalDeck."
            )

        ignored_boards = {
            str(
                card.board
                or ""
            ).strip().lower()
            for card
            in external_deck.cards
            if str(
                card.board
                or ""
            ).strip().lower()
            not in self.IMPORTABLE_BOARDS
        }

        leader_names = {
            str(
                card.name
                or ""
            ).strip().lower()
            for card
            in external_deck.cards
            if (
                str(
                    card.board
                    or ""
                ).strip().lower()
                in {
                    "commanders",
                    "partners",
                }
                and str(
                    card.name
                    or ""
                ).strip()
            )
        }

        ordered_cards = sorted(
            external_deck.cards,
            key=lambda card: (
                self.BOARD_PRIORITY.get(
                    str(
                        card.board
                        or ""
                    ).strip().lower(),
                    99,
                ),
                str(
                    card.name
                    or ""
                ).strip().lower(),
            ),
        )

        resolved_cards = []
        unresolved_cards = []

        skipped_leader_duplicates = 0
        seen_leader_names = set()

        commander_assigned = False
        partner_assigned = False

        conn = get_db_connection()

        try:
            for external_card in ordered_cards:
                board = str(
                    external_card.board
                    or ""
                ).strip().lower()

                if (
                    board
                    not in self.IMPORTABLE_BOARDS
                ):
                    continue

                card_name_key = str(
                    external_card.name
                    or ""
                ).strip().lower()

                if board in {
                    "commanders",
                    "partners",
                }:
                    if (
                        card_name_key
                        in seen_leader_names
                    ):
                        skipped_leader_duplicates += max(
                            1,
                            int(
                                external_card.quantity
                                or 1
                            ),
                        )
                        continue

                    seen_leader_names.add(
                        card_name_key
                    )

                if (
                    board == "mainboard"
                    and card_name_key
                    in leader_names
                ):
                    skipped_leader_duplicates += max(
                        1,
                        int(
                            external_card.quantity
                            or 1
                        ),
                    )
                    continue

                (
                    local_row,
                    resolution_method,
                ) = self._resolve_local_card(
                    conn,
                    external_card,
                )

                if local_row is None:
                    unresolved_cards.append({
                        "card_name": (
                            external_card.name
                        ),
                        "quantity": max(
                            1,
                            int(
                                external_card.quantity
                                or 1
                            ),
                        ),
                        "board": board,
                        "scryfall_id": (
                            external_card.scryfall_id
                        ),
                        "set_code": (
                            external_card.set_code
                        ),
                        "collector_number": (
                            external_card.collector_number
                        ),
                    })

                    continue

                deck_zone = (
                    "sideboard"
                    if board in {
                        "sideboard",
                        "companions",
                    }
                    else "deck"
                )

                deck_role = "main"

                if board == "commanders":
                    if not commander_assigned:
                        deck_role = "commander"
                        commander_assigned = True

                    elif not partner_assigned:
                        deck_role = "partner"
                        partner_assigned = True

                elif (
                    board == "partners"
                    and not partner_assigned
                ):
                    deck_role = "partner"
                    partner_assigned = True

                local_card_name = str(
                    local_row["card_name"]
                    or external_card.name
                    or ""
                ).strip()

                resolved_cards.append({
                    "card_uuid": str(
                        local_row["card_uuid"]
                        or ""
                    ).strip(),

                    "card_name": (
                        local_card_name
                    ),

                    "quantity": max(
                        1,
                        int(
                            external_card.quantity
                            or 1
                        ),
                    ),

                    "deck_zone": deck_zone,
                    "deck_role": deck_role,

                    "is_basic_land": (
                        1
                        if (
                            local_card_name.lower()
                            in self.BASIC_LAND_NAMES
                        )
                        else 0
                    ),

                    "sheet_is_foil": (
                        1
                        if external_card.is_foil
                        else 0
                    ),

                    "source_board": board,

                    "resolution_method": (
                        resolution_method
                    ),
                })

        finally:
            conn.close()

        return {
            "resolved_cards": (
                resolved_cards
            ),

            "unresolved_cards": (
                unresolved_cards
            ),

            "ignored_boards": sorted(
                ignored_boards
            ),

            "skipped_leader_duplicates": (
                skipped_leader_duplicates
            ),

            "resolved_copy_count": sum(
                card["quantity"]
                for card
                in resolved_cards
            ),

            "unresolved_copy_count": sum(
                card["quantity"]
                for card
                in unresolved_cards
            ),
        }

    def import_deck(
        self,
        external_deck,
        allow_partial=False,
    ):
        plan = self.prepare_import(
            external_deck
        )

        if (
            plan["unresolved_cards"]
            and not allow_partial
        ):
            return {
                "ok": False,
                "message": (
                    "External deck was not "
                    "imported because "
                    f"{len(plan['unresolved_cards'])} "
                    "unique card(s) could not "
                    "be resolved in the local "
                    "card database."
                ),
                "deck_id": None,
                **plan,
            }

        if not plan["resolved_cards"]:
            return {
                "ok": False,
                "message": (
                    "External deck did not "
                    "contain any cards that "
                    "Deckadence could import."
                ),
                "deck_id": None,
                **plan,
            }

        summary = (
            external_deck.summary
        )

        create_result = (
            create_external_import_deck(
                provider=(
                    summary.provider
                ),
                external_id=(
                    summary.external_id
                ),
                external_url=(
                    summary.external_url
                ),
                deck_name=(
                    summary.name
                    or "Imported Deck"
                ),
                deck_format=(
                    summary.format
                    or "Commander"
                ),
                cards=(
                    plan["resolved_cards"]
                ),
            )
        )

        return {
            **plan,
            **create_result,
        }

    def _resolve_local_card(
        self,
        conn,
        external_card,
    ):
        scryfall_id = str(
            external_card.scryfall_id
            or ""
        ).strip()

        set_code = str(
            external_card.set_code
            or ""
        ).strip().upper()

        collector_number = str(
            external_card.collector_number
            or ""
        ).strip()

        card_name = str(
            external_card.name
            or ""
        ).strip()

        if scryfall_id:
            row = conn.execute(
                """
                SELECT *
                FROM chaos_cards
                WHERE scryfall_id = ?
                      COLLATE NOCASE
                LIMIT 1
                """,
                (
                    scryfall_id,
                ),
            ).fetchone()

            if row:
                return (
                    row,
                    "scryfall_id",
                )

        if (
            set_code
            and collector_number
        ):
            row = conn.execute(
                """
                SELECT *
                FROM chaos_cards
                WHERE set_code = ?
                      COLLATE NOCASE
                  AND collector_number = ?
                      COLLATE NOCASE
                ORDER BY
                    CASE
                        WHEN card_name = ?
                             COLLATE NOCASE
                        THEN 0
                        ELSE 1
                    END,
                    card_uuid ASC
                LIMIT 1
                """,
                (
                    set_code,
                    collector_number,
                    card_name,
                ),
            ).fetchone()

            if row:
                return (
                    row,
                    "set_collector_number",
                )

        if (
            set_code
            and card_name
        ):
            row = conn.execute(
                """
                SELECT *
                FROM chaos_cards
                WHERE set_code = ?
                      COLLATE NOCASE
                  AND card_name = ?
                      COLLATE NOCASE
                ORDER BY
                    CAST(
                        collector_number
                        AS INTEGER
                    ) ASC,
                    collector_number ASC,
                    card_uuid ASC
                LIMIT 1
                """,
                (
                    set_code,
                    card_name,
                ),
            ).fetchone()

            if row:
                return (
                    row,
                    "set_name",
                )

        if card_name:
            row = conn.execute(
                """
                SELECT
                    cc.*
                FROM chaos_cards cc
                LEFT JOIN sets s
                    ON s.set_code =
                       cc.set_code
                WHERE cc.card_name = ?
                      COLLATE NOCASE
                ORDER BY
                    COALESCE(
                        s.release_date,
                        ''
                    ) DESC,
                    cc.set_code ASC,
                    CAST(
                        cc.collector_number
                        AS INTEGER
                    ) ASC,
                    cc.collector_number ASC,
                    cc.card_uuid ASC
                LIMIT 1
                """,
                (
                    card_name,
                ),
            ).fetchone()

            if row:
                return (
                    row,
                    "name_fallback",
                )

        return (
            None,
            "",
        )
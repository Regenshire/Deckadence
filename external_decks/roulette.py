from __future__ import annotations

from concurrent.futures import (
    ThreadPoolExecutor,
    as_completed,
)

from dataclasses import (
    dataclass,
    replace,
)

import random

from .core import (
    ExternalDeck,
    ExternalDeckError,
    ExternalDeckSearchFilters,
    ExternalDeckSelectionError,
    ExternalDeckSelectionOptions,
)

from .randomizer import (
    ExternalDeckRandomizer,
)

@dataclass(frozen=True, slots=True)
class ExternalDeckRouletteCandidate:
    provider: str
    external_id: str
    external_url: str
    deck_name: str
    author: str
    format: str
    format_key: str
    format_label: str
    commander_name: str
    commander_scryfall_id: str
    display_card_name: str
    display_card_scryfall_id: str
    color_identity: tuple[str, ...]
    playable_card_count: int
    bracket: int | None
    likes: int
    views: int

    def to_dict(self):
        return {
            "provider": self.provider,
            "external_id": self.external_id,
            "external_url": self.external_url,
            "deck_name": self.deck_name,
            "author": self.author,
            "format": self.format,
            "format_key": self.format_key,
            "format_label": self.format_label,
            "commander_name": self.commander_name,
            "commander_scryfall_id": (
                self.commander_scryfall_id
            ),
            "display_card_name": (
                self.display_card_name
            ),
            "display_card_scryfall_id": (
                self.display_card_scryfall_id
            ),
            "color_identity": list(
                self.color_identity
            ),
            "playable_card_count": (
                self.playable_card_count
            ),
            "bracket": self.bracket,
            "likes": self.likes,
            "views": self.views,
        }


@dataclass(frozen=True, slots=True)
class ExternalDeckRouletteSpin:
    candidates: tuple[
        ExternalDeckRouletteCandidate,
        ...
    ]

    winner: ExternalDeckRouletteCandidate

    winning_stop_index: int
    total_results: int
    candidate_count: int
    pages_sampled: tuple[int, ...]

class ExternalDeckRouletteService:
    FORMAT_RULES = {
        "commander": {
            "label": "Commander (100 card deck)",
            "group": "Commander",
            "provider_format": "commander",
            "deck_size_mode": "exact",
            "deck_size": 100,
            "requires_leader": True,
        },
        "commanderPrecons": {
            "label": "Commander Precons (100 card deck)",
            "group": "Commander",
            "provider_format": "commanderPrecons",
            "deck_size_mode": "exact",
            "deck_size": 100,
            "requires_leader": True,
        },
        "pauperEdh": {
            "label": "Pauper EDH (100 card deck)",
            "group": "Commander",
            "provider_format": "pauperEdh",
            "deck_size_mode": "exact",
            "deck_size": 100,
            "requires_leader": True,
        },
        "standard": {
            "label": "Standard (60+ cards)",
            "group": "Constructed",
            "provider_format": "standard",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
        "modern": {
            "label": "Modern (60+ cards)",
            "group": "Constructed",
            "provider_format": "modern",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
        "pauper": {
            "label": "Pauper (60+ cards)",
            "group": "Constructed",
            "provider_format": "pauper",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
        "legacy": {
            "label": "Legacy (60+ cards)",
            "group": "Constructed",
            "provider_format": "legacy",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
        "historic": {
            "label": "Historic (60+ cards)",
            "group": "Constructed",
            "provider_format": "historic",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
        "pioneer": {
            "label": "Pioneer (60+ cards)",
            "group": "Constructed",
            "provider_format": "pioneer",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
        "timeless": {
            "label": "Timeless (60+ cards)",
            "group": "Constructed",
            "provider_format": "timeless",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
        "vintage": {
            "label": "Vintage (60+ cards)",
            "group": "Constructed",
            "provider_format": "vintage",
            "deck_size_mode": "minimum",
            "deck_size": 60,
            "requires_leader": False,
        },
    }

    FORMAT_GROUP_ORDER = (
        "Commander",
        "Constructed",
    )

    LEADER_BOARDS = {
        "commanders",
        "partners",
    }

    def __init__(
        self,
        provider,
        randomizer=None,
        rng=None,
        max_workers=4,
    ):
        self.provider = provider

        self.rng = (
            rng
            or random.SystemRandom()
        )

        self.randomizer = (
            randomizer
            or ExternalDeckRandomizer(
                provider,
                rng=self.rng,
            )
        )

        try:
            parsed_workers = int(
                max_workers
                or 4
            )

        except (
            TypeError,
            ValueError,
        ):
            parsed_workers = 4

        self.max_workers = max(
            1,
            min(
                4,
                parsed_workers,
            ),
        )

    @classmethod
    def get_format_rule(
        cls,
        format_key,
    ):
        clean_key = str(
            format_key
            or "commander"
        ).strip()

        for canonical_key, rule in (
            cls.FORMAT_RULES.items()
        ):
            if (
                clean_key.casefold()
                == canonical_key.casefold()
            ):
                return {
                    "key": canonical_key,
                    **rule,
                }

        return None


    @classmethod
    def get_format_groups(cls):
        groups = []

        for group_label in (
            cls.FORMAT_GROUP_ORDER
        ):
            options = []

            for format_key, rule in (
                cls.FORMAT_RULES.items()
            ):
                if (
                    rule["group"]
                    != group_label
                ):
                    continue

                options.append({
                    "value": format_key,
                    "label": rule["label"],
                })

            groups.append({
                "label": group_label,
                "options": options,
            })

        return groups

    def build_spin(
        self,
        filters=None,
        options=None,
        format_key="commander",
        wheel_size=12,
    ):
        format_rule = self.get_format_rule(
            format_key
        )

        if format_rule is None:
            raise ExternalDeckSelectionError(
                "Unsupported Deck Roulette format."
            )

        filters = replace(
            (
                filters
                or ExternalDeckSearchFilters()
            ),
            format=format_rule[
                "provider_format"
            ],
        )

        options = (
            options
            or ExternalDeckSelectionOptions()
        )

        wheel_size = self._bounded_int(
            wheel_size,
            minimum=6,
            maximum=18,
            fallback=12,
        )

        try:
            top_result_limit = int(
                options.top_result_limit
                or 100
            )

        except (
            TypeError,
            ValueError,
        ):
            top_result_limit = 100

        top_result_limit = max(
            wheel_size,
            min(
                200,
                top_result_limit,
            ),
        )

        discovery_options = replace(
            options,
            selection_count=(
                top_result_limit
            ),
            candidate_pool_size=(
                top_result_limit
            ),
            required_playable_card_count=None,
            top_result_limit=(
                top_result_limit
            ),
        )

        selection = (
            self.randomizer.select(
                filters=filters,
                options=discovery_options,
            )
        )

        candidates = (
            self._load_candidates_until_full(
                selection.selected,
                format_rule=format_rule,
                wheel_size=wheel_size,
            )
        )

        if len(candidates) < wheel_size:
            raise ExternalDeckSelectionError(
                "Deck Roulette found only "
                f"{len(candidates)} complete "
                "deck(s) within the selected "
                "top-result range and filters."
            )

        candidates = tuple(
            candidates[:wheel_size]
        )

        winning_stop_index = (
            self.rng.randrange(
                len(candidates)
            )
        )

        return ExternalDeckRouletteSpin(
            candidates=candidates,

            winner=candidates[
                winning_stop_index
            ],

            winning_stop_index=(
                winning_stop_index
            ),

            total_results=(
                selection.total_results
            ),

            candidate_count=(
                selection.candidate_count
            ),

            pages_sampled=(
                selection.pages_sampled
            ),
        )

    def build_candidate(
        self,
        external_deck,
        format_key="commander",
    ):
        format_rule = self.get_format_rule(
            format_key
        )

        if format_rule is None:
            return None

        return self._candidate_from_deck(
            external_deck,
            format_rule=format_rule,
        )

    def _load_candidates_until_full(
        self,
        deck_summaries,
        format_rule,
        wheel_size,
    ):
        summaries = list(
            deck_summaries
            or []
        )

        if not summaries:
            return []

        candidates = []

        batch_size = max(
            12,
            min(
                24,
                wheel_size + 6,
            ),
        )

        for start_index in range(
            0,
            len(summaries),
            batch_size,
        ):
            candidates.extend(
                self._load_candidates(
                    summaries[
                        start_index:
                        start_index + batch_size
                    ],
                    format_rule=format_rule,
                )
            )

            if len(candidates) >= wheel_size:
                break

        return candidates

    def _load_candidates(
        self,
        deck_summaries,
        format_rule,
    ):
        summaries = list(
            deck_summaries
            or []
        )

        if not summaries:
            return []

        loaded_by_index = {}

        worker_count = min(
            self.max_workers,
            len(summaries),
        )

        with ThreadPoolExecutor(
            max_workers=worker_count
        ) as executor:

            future_map = {
                executor.submit(
                    self.provider.get_deck,
                    summary.external_id,
                ): index

                for index, summary
                in enumerate(summaries)
            }

            for future in as_completed(
                future_map
            ):
                index = future_map[
                    future
                ]

                try:
                    external_deck = (
                        future.result()
                    )

                except ExternalDeckError:
                    continue

                candidate = (
                    self._candidate_from_deck(
                        external_deck,
                        format_rule=(
                            format_rule
                        ),
                    )
                )

                if candidate is None:
                    continue

                loaded_by_index[
                    index
                ] = candidate

        return [
            loaded_by_index[index]
            for index
            in sorted(
                loaded_by_index
            )
        ]

    def _candidate_from_deck(
        self,
        external_deck,
        format_rule,
    ):
        if not isinstance(
            external_deck,
            ExternalDeck,
        ):
            return None

        mainboard_card_count = 0
        leader_card_count = 0
        leader_cards = []
        mainboard_cards = []

        for card in external_deck.cards:
            board = str(
                card.board
                or ""
            ).strip().lower()

            try:
                quantity = max(
                    1,
                    int(
                        card.quantity
                        or 1
                    ),
                )

            except (
                TypeError,
                ValueError,
            ):
                quantity = 1

            if board == "mainboard":
                mainboard_card_count += quantity
                mainboard_cards.append(card)

            if board in self.LEADER_BOARDS:
                leader_card_count += quantity
                leader_cards.append(card)

        if format_rule["requires_leader"]:
            playable_card_count = (
                mainboard_card_count
                + leader_card_count
            )
        else:
            playable_card_count = (
                mainboard_card_count
            )

        required_deck_size = int(
            format_rule["deck_size"]
        )

        if (
            format_rule["deck_size_mode"]
            == "exact"
        ):
            if (
                playable_card_count
                != required_deck_size
            ):
                return None

        elif (
            playable_card_count
            < required_deck_size
        ):
            return None

        if (
            format_rule["requires_leader"]
            and not leader_cards
        ):
            return None

        unique_leader_names = []
        seen_leader_names = set()

        for leader_card in leader_cards:
            leader_name = str(
                leader_card.name
                or ""
            ).strip()

            leader_key = (
                leader_name.casefold()
            )

            if (
                not leader_name
                or leader_key
                in seen_leader_names
            ):
                continue

            seen_leader_names.add(
                leader_key
            )

            unique_leader_names.append(
                leader_name
            )

        commander_name = " + ".join(
            unique_leader_names
        )

        commander_scryfall_id = ""
        display_card_name = ""
        display_card_scryfall_id = ""

        if leader_cards:
            primary_leader = (
                leader_cards[0]
            )

            commander_scryfall_id = str(
                primary_leader.scryfall_id
                or ""
            ).strip()

            if format_rule["requires_leader"]:
                display_card_name = str(
                    primary_leader.name
                    or ""
                ).strip()

                display_card_scryfall_id = (
                    commander_scryfall_id
                )

        if not display_card_scryfall_id:
            main_card = (
                external_deck.summary.main_card
            )

            if (
                main_card is not None
                and str(
                    main_card.scryfall_id
                    or ""
                ).strip()
            ):
                display_card_name = str(
                    main_card.name
                    or ""
                ).strip()

                display_card_scryfall_id = str(
                    main_card.scryfall_id
                    or ""
                ).strip()

        if not display_card_scryfall_id:
            for mainboard_card in (
                mainboard_cards
            ):
                scryfall_id = str(
                    mainboard_card.scryfall_id
                    or ""
                ).strip()

                if not scryfall_id:
                    continue

                display_card_name = str(
                    mainboard_card.name
                    or ""
                ).strip()

                display_card_scryfall_id = (
                    scryfall_id
                )

                break

        if not display_card_scryfall_id:
            return None

        bracket = (
            external_deck.summary.bracket
        )

        if bracket is None:
            bracket = (
                external_deck
                .summary
                .auto_bracket
            )

        return ExternalDeckRouletteCandidate(
            provider=(
                external_deck
                .summary
                .provider
            ),

            external_id=(
                external_deck
                .summary
                .external_id
            ),

            external_url=(
                external_deck
                .summary
                .external_url
            ),

            deck_name=(
                external_deck
                .summary
                .name
                or "Untitled Deck"
            ),

            author=(
                external_deck
                .summary
                .author
            ),

            format=(
                external_deck
                .summary
                .format
                or format_rule[
                    "provider_format"
                ]
            ),

            format_key=(
                format_rule["key"]
            ),

            format_label=(
                format_rule["label"]
            ),

            commander_name=(
                commander_name
            ),

            commander_scryfall_id=(
                commander_scryfall_id
            ),

            display_card_name=(
                display_card_name
            ),

            display_card_scryfall_id=(
                display_card_scryfall_id
            ),

            color_identity=tuple(
                external_deck
                .summary
                .color_identity
                or ()
            ),

            playable_card_count=(
                playable_card_count
            ),

            bracket=bracket,

            likes=int(
                external_deck
                .summary
                .likes
                or 0
            ),

            views=int(
                external_deck
                .summary
                .views
                or 0
            ),
        )

    @staticmethod
    def _bounded_int(
        value,
        minimum,
        maximum,
        fallback,
    ):
        try:
            parsed_value = int(
                value
            )

        except (
            TypeError,
            ValueError,
        ):
            parsed_value = fallback

        return max(
            minimum,
            min(
                maximum,
                parsed_value,
            ),
        )
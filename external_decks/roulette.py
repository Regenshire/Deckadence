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
    commander_name: str
    commander_scryfall_id: str
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
            "commander_name": self.commander_name,
            "commander_scryfall_id": (
                self.commander_scryfall_id
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
    PLAYABLE_BOARDS = {
        "mainboard",
        "commanders",
        "partners",
    }

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

    def build_spin(
        self,
        filters=None,
        options=None,
        wheel_size=8,
    ):
        filters = (
            filters
            or ExternalDeckSearchFilters(
                format="commander"
            )
        )

        options = (
            options
            or ExternalDeckSelectionOptions()
        )

        wheel_size = self._bounded_int(
            wheel_size,
            minimum=2,
            maximum=12,
            fallback=8,
        )

        discovery_count = min(
            20,
            wheel_size + 4,
        )

        try:
            configured_pool_size = int(
                options.candidate_pool_size
                or 60
            )

        except (
            TypeError,
            ValueError,
        ):
            configured_pool_size = 60

        discovery_replacements = {
            "selection_count": (
                discovery_count
            ),

            "candidate_pool_size": max(
                configured_pool_size,
                discovery_count * 4,
            ),
        }

        # Search-result Commander information is not
        # reliable enough to make this the final
        # completeness test. The downloaded full deck
        # is validated below instead.
        if hasattr(
            options,
            "required_playable_card_count",
        ):
            discovery_replacements[
                "required_playable_card_count"
            ] = None

        discovery_options = replace(
            options,
            **discovery_replacements,
        )

        selection = (
            self.randomizer.select(
                filters=filters,
                options=discovery_options,
            )
        )

        required_card_count = getattr(
            options,
            "required_playable_card_count",
            None,
        )

        candidates = (
            self._load_candidates(
                selection.selected,
                required_playable_card_count=(
                    required_card_count
                ),
            )
        )

        if len(candidates) < 2:
            raise ExternalDeckSelectionError(
                "Deck Roulette could not find "
                "enough complete Commander decks "
                "for these filters."
            )

        candidates = tuple(
            candidates[
                :wheel_size
            ]
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
        required_playable_card_count=None,
    ):
        return self._candidate_from_deck(
            external_deck,
            required_playable_card_count=(
                required_playable_card_count
            ),
        )


    def _load_candidates(
        self,
        deck_summaries,
        required_playable_card_count=None,
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

                        required_playable_card_count=(
                            required_playable_card_count
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
        required_playable_card_count=None,
    ):
        if not isinstance(
            external_deck,
            ExternalDeck,
        ):
            return None

        clean_format = str(
            external_deck.summary.format
            or ""
        ).strip().lower()

        if clean_format not in {
            "commander",
            "edh",
        }:
            return None

        playable_card_count = 0
        leader_cards = []

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

            if board in self.PLAYABLE_BOARDS:
                playable_card_count += quantity

            if board in self.LEADER_BOARDS:
                leader_cards.append(
                    card
                )

        if (
            required_playable_card_count
            not in {
                None,
                "",
            }
        ):
            try:
                required_count = int(
                    required_playable_card_count
                )

            except (
                TypeError,
                ValueError,
            ):
                required_count = None

            if (
                required_count is not None
                and playable_card_count
                != required_count
            ):
                return None

        if not leader_cards:
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

        if not unique_leader_names:
            return None

        primary_leader = (
            leader_cards[0]
        )

        commander_scryfall_id = str(
            primary_leader.scryfall_id
            or ""
        ).strip()

        # The wheel is explicitly Commander-card
        # driven, so skip candidates for which we
        # cannot produce the card image.
        if not commander_scryfall_id:
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
            ),

            commander_name=" + ".join(
                unique_leader_names
            ),

            commander_scryfall_id=(
                commander_scryfall_id
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
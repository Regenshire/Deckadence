from __future__ import annotations

import math
import random

from .core import (
    ExternalDeckProvider,
    ExternalDeckSearchFilters,
    ExternalDeckSelection,
    ExternalDeckSelectionError,
    ExternalDeckSelectionOptions,
)


class ExternalDeckRandomizer:
    def __init__(
        self,
        provider: ExternalDeckProvider,
        rng=None,
    ):
        self.provider = provider

        self.rng = (
            rng
            or random.SystemRandom()
        )

    def select(
        self,
        filters=None,
        options=None,
    ):
        filters = (
            filters
            or ExternalDeckSearchFilters()
        )

        options = (
            options
            or ExternalDeckSelectionOptions()
        )

        selection_count = (
            self._bounded_int(
                options.selection_count,
                minimum=1,
                maximum=50,
            )
        )

        candidate_pool_size = (
            self._bounded_int(
                options.candidate_pool_size,
                minimum=selection_count,
                maximum=1000,
            )
        )

        max_search_pages = (
            self._bounded_int(
                options.max_search_pages,
                minimum=1,
                maximum=20,
            )
        )

        metadata_page = (
            self.provider.search_decks(
                filters,
                page_number=1,
                page_size=1,
            )
        )

        total_results = max(
            0,
            int(
                metadata_page.total_results
                or 0
            ),
        )

        if total_results <= 0:
            raise ExternalDeckSelectionError(
                "No external decks matched "
                "the requested filters."
            )

        pages_to_fetch = min(
            max_search_pages,
            candidate_pool_size,
        )

        page_size = min(
            100,
            max(
                selection_count,
                math.ceil(
                    candidate_pool_size
                    / pages_to_fetch
                ),
            ),
        )

        total_pages = max(
            1,
            math.ceil(
                total_results
                / page_size
            ),
        )

        pages_to_fetch = min(
            pages_to_fetch,
            total_pages,
            math.ceil(
                candidate_pool_size
                / page_size
            ),
        )

        page_numbers = (
            self._sample_page_numbers(
                total_pages,
                pages_to_fetch,
            )
        )

        excluded_ids = {
            str(value or "").strip()
            for value
            in options.exclude_external_ids
            if str(value or "").strip()
        }

        minimum_likes = max(
            0,
            int(
                options.minimum_likes
                or 0
            ),
        )

        minimum_views = max(
            0,
            int(
                options.minimum_views
                or 0
            ),
        )

        required_playable_card_count = None

        if (
            options.required_playable_card_count
            not in {
                None,
                "",
            }
        ):
            try:
                required_playable_card_count = int(
                    options.required_playable_card_count
                )

            except (
                TypeError,
                ValueError,
            ):
                required_playable_card_count = None

            if (
                required_playable_card_count
                is not None
                and required_playable_card_count
                < 1
            ):
                required_playable_card_count = None

        candidates_by_id = {}

        for page_number in page_numbers:
            page = (
                self.provider.search_decks(
                    filters,
                    page_number=page_number,
                    page_size=page_size,
                )
            )

            for deck in page.decks:
                if not self._is_allowed(
                    deck,
                    options,
                    excluded_ids,
                    minimum_likes,
                    minimum_views,
                    required_playable_card_count,
                ):
                    continue

                candidates_by_id[
                    deck.external_id
                ] = deck

                if (
                    len(candidates_by_id)
                    >= candidate_pool_size
                ):
                    break

            if (
                len(candidates_by_id)
                >= candidate_pool_size
            ):
                break

        candidates = list(
            candidates_by_id.values()
        )

        if not candidates:
            raise ExternalDeckSelectionError(
                "External decks were found, "
                "but none passed the local "
                "selection rules."
            )

        selected_count = min(
            selection_count,
            len(candidates),
        )

        selected = tuple(
            self.rng.sample(
                candidates,
                selected_count,
            )
        )

        return ExternalDeckSelection(
            selected=selected,

            candidate_count=len(
                candidates
            ),

            total_results=(
                total_results
            ),

            pages_sampled=tuple(
                page_numbers
            ),
        )

    def _sample_page_numbers(
        self,
        total_pages,
        pages_to_fetch,
    ):
        if (
            pages_to_fetch
            >= total_pages
        ):
            page_numbers = list(
                range(
                    1,
                    total_pages + 1,
                )
            )

            self.rng.shuffle(
                page_numbers
            )

            return page_numbers

        return self.rng.sample(
            range(
                1,
                total_pages + 1,
            ),
            pages_to_fetch,
        )


    def _is_allowed(
        self,
        deck,
        options,
        excluded_ids,
        minimum_likes,
        minimum_views,
        required_playable_card_count,
    ):
        if (
            deck.external_id
            in excluded_ids
        ):
            return False

        if (
            options.require_legal
            and not deck.is_legal
        ):
            return False

        if (
            deck.likes
            < minimum_likes
        ):
            return False

        if (
            deck.views
            < minimum_views
        ):
            return False

        if (
            required_playable_card_count
            is not None
            and deck.playable_card_count
            != required_playable_card_count
        ):
            return False

        return True


    @staticmethod
    def _bounded_int(
        value,
        minimum,
        maximum,
    ):
        try:
            parsed_value = int(
                value
            )

        except (
            TypeError,
            ValueError,
        ):
            parsed_value = minimum

        return max(
            minimum,
            min(
                maximum,
                parsed_value,
            ),
        )
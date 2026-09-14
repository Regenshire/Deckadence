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
    COLOR_ORDER = (
        "W",
        "U",
        "B",
        "R",
        "G",
        "C",
    )

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
                maximum=200,
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

        required_playable_card_count = (
            self._normalize_optional_positive_int(
                options.required_playable_card_count
            )
        )

        selected_colors = (
            self._normalize_color_identity(
                options.color_identity
            )
        )

        color_match_mode = str(
            options.color_match_mode
            or "exact"
        ).strip().lower()

        if color_match_mode not in {
            "exact",
            "including",
        }:
            color_match_mode = "exact"

        allowed_brackets = (
            self._normalize_brackets(
                options.allowed_brackets
            )
        )

        top_result_limit = (
            self._normalize_optional_positive_int(
                options.top_result_limit
            )
        )

        if top_result_limit is not None:
            top_result_limit = min(
                1000,
                top_result_limit,
            )

            target_pool_size = min(
                candidate_pool_size,
                top_result_limit,
            )

            page_size = 100

            total_pages = max(
                1,
                math.ceil(
                    total_results
                    / page_size
                ),
            )

            page_numbers = list(
                range(
                    1,
                    min(
                        total_pages,
                        max_search_pages,
                    ) + 1,
                )
            )

        else:
            target_pool_size = (
                candidate_pool_size
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

        candidates_by_id = {}
        pages_sampled = []

        for page_number in page_numbers:
            page = (
                self.provider.search_decks(
                    filters,
                    page_number=page_number,
                    page_size=page_size,
                )
            )

            pages_sampled.append(
                page_number
            )

            for deck in page.decks:
                if not self._is_allowed(
                    deck,
                    options,
                    excluded_ids,
                    minimum_likes,
                    minimum_views,
                    required_playable_card_count,
                    selected_colors,
                    color_match_mode,
                    allowed_brackets,
                ):
                    continue

                candidates_by_id[
                    deck.external_id
                ] = deck

                if (
                    len(candidates_by_id)
                    >= target_pool_size
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
                pages_sampled
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
        selected_colors,
        color_match_mode,
        allowed_brackets,
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

        if allowed_brackets:
            effective_bracket = (
                deck.bracket
                if deck.bracket is not None
                else deck.auto_bracket
            )

            try:
                effective_bracket = int(
                    effective_bracket
                )

            except (
                TypeError,
                ValueError,
            ):
                return False

            if (
                effective_bracket
                not in allowed_brackets
            ):
                return False

        if not self._matches_color_identity(
            deck.color_identity,
            selected_colors,
            color_match_mode,
        ):
            return False

        return True

    @staticmethod
    def _normalize_brackets(
        values,
    ):
        normalized = []

        for value in values or ():
            try:
                parsed_value = int(
                    value
                )

            except (
                TypeError,
                ValueError,
            ):
                continue

            if (
                1 <= parsed_value <= 5
                and parsed_value
                not in normalized
            ):
                normalized.append(
                    parsed_value
                )

        return tuple(
            sorted(normalized)
        )

    def _normalize_color_identity(
        self,
        values,
    ):
        requested = {
            str(value or "")
            .strip()
            .upper()
            for value in (
                values
                or ()
            )
        }

        return tuple(
            color
            for color
            in self.COLOR_ORDER
            if color in requested
        )


    def _matches_color_identity(
        self,
        deck_colors,
        selected_colors,
        color_match_mode,
    ):
        if not selected_colors:
            return True

        normalized_deck_colors = {
            str(value or "")
            .strip()
            .upper()
            for value in (
                deck_colors
                or ()
            )
            if str(value or "").strip()
        }

        selected_color_set = set(
            selected_colors
        )

        if "C" in selected_color_set:
            return not normalized_deck_colors

        if color_match_mode == "including":
            return (
                selected_color_set
                <= normalized_deck_colors
            )

        return (
            normalized_deck_colors
            == selected_color_set
        )


    @staticmethod
    def _normalize_optional_positive_int(
        value,
    ):
        if value in {
            None,
            "",
        }:
            return None

        try:
            parsed_value = int(
                value
            )

        except (
            TypeError,
            ValueError,
        ):
            return None

        if parsed_value < 1:
            return None

        return parsed_value


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
from __future__ import annotations

from functools import lru_cache
import re
import time
from urllib.parse import urlparse

import requests

from .core import (
    ExternalCardReference,
    ExternalDeck,
    ExternalDeckCard,
    ExternalDeckNotFoundError,
    ExternalDeckProvider,
    ExternalDeckProviderUnavailableError,
    ExternalDeckRateLimitedError,
    ExternalDeckSchemaError,
    ExternalDeckSearchFilters,
    ExternalDeckSearchPage,
    ExternalDeckSummary,
)


class MoxfieldDeckProvider(ExternalDeckProvider):
    provider_key = "moxfield"

    API_BASE_URL = "https://api2.moxfield.com"

    SEARCH_SFW_PATH = "/v2/decks/search-sfw"
    SEARCH_PATH = "/v2/decks/search"
    CARD_NAMED_PATH = "/v3/cards/named"
    DECK_PATH = "/v3/decks/all/{deck_id}"

    _DECK_ID_RE = re.compile(
        r"^[A-Za-z0-9_-]{8,}$"
    )

    _RETRYABLE_STATUS_CODES = {
        429,
        502,
        503,
        504,
    }

    def __init__(
        self,
        session=None,
        timeout=(8, 20),
        max_retries=3,
        backoff_seconds=1.0,
    ):
        self.session = (
            session
            or requests.Session()
        )

        self.timeout = timeout

        self.max_retries = max(
            1,
            int(max_retries or 1),
        )

        self.backoff_seconds = max(
            0.1,
            float(backoff_seconds or 1.0),
        )

        self.session.headers.update({
            "Accept": "application/json, text/plain, */*",
            "Origin": "https://www.moxfield.com",
            "Referer": "https://www.moxfield.com/",
            "User-Agent": (
                "Mozilla/5.0 "
                "(Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 "
                "(KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        })

    def search_decks(
        self,
        filters,
        page_number=1,
        page_size=50,
    ):
        filters = (
            filters
            or ExternalDeckSearchFilters()
        )

        try:
            page_number = max(
                1,
                int(page_number or 1),
            )

            page_size = min(
                100,
                max(
                    1,
                    int(page_size or 50),
                ),
            )

        except (TypeError, ValueError):
            raise ValueError(
                "page_number and page_size "
                "must be integers."
            ) from None

        commander_card_id = str(
            filters.commander_card_id
            or ""
        ).strip()

        if (
            not commander_card_id
            and str(
                filters.commander_name
                or ""
            ).strip()
        ):
            commander = self.find_card_by_name(
                filters.commander_name
            )

            if commander is None:
                raise ExternalDeckNotFoundError(
                    "Moxfield could not resolve "
                    f"Commander "
                    f"{filters.commander_name!r}."
                )

            commander_card_id = commander.provider_card_id

        card_id = str(filters.card_id or "").strip()

        if not card_id and str(filters.card_name or "").strip():
            card = self.find_card_by_name(filters.card_name)

            if card is None:
                raise ExternalDeckNotFoundError(
                    f"Moxfield could not resolve card {filters.card_name!r}."
                )

            card_id = card.provider_card_id

        params = self._build_search_params(
            filters,
            page_number=page_number,
            page_size=page_size,
            commander_card_id=commander_card_id,
            card_id=card_id,
        )

        search_path = (
            self.SEARCH_SFW_PATH
            if filters.sfw
            else self.SEARCH_PATH
        )

        payload = self._request_json(
            search_path,
            params=params,
            operation="Moxfield deck search",
        )

        raw_decks = payload.get("data")

        if not isinstance(
            raw_decks,
            list,
        ):
            raise ExternalDeckSchemaError(
                "Moxfield deck search response "
                "did not contain a data list."
            )

        decks = tuple(
            self._normalize_search_item(
                item
            )
            for item in raw_decks
            if isinstance(item, dict)
        )

        return ExternalDeckSearchPage(
            decks=decks,
            page_number=self._safe_int(
                payload.get("pageNumber"),
                page_number,
            ),
            page_size=self._safe_int(
                payload.get("pageSize"),
                page_size,
            ),
            total_pages=self._safe_int(
                payload.get("totalPages"),
                1,
            ),
            total_results=self._safe_int(
                payload.get("totalResults"),
                len(decks),
            ),
        )

    @lru_cache(maxsize=256)
    def find_card_by_name(
        self,
        card_name,
    ):
        clean_name = str(
            card_name
            or ""
        ).strip()

        if not clean_name:
            return None

        payload = self._request_json(
            self.CARD_NAMED_PATH,
            params={
                "q": clean_name,
                "count": 1,
            },
            operation=(
                "Moxfield card lookup for "
                f"{clean_name}"
            ),
        )

        cards = payload.get("cards")

        if not isinstance(
            cards,
            list,
        ):
            raise ExternalDeckSchemaError(
                "Moxfield card lookup response "
                "did not contain a cards list."
            )

        if not cards:
            return None

        card = cards[0]

        if not isinstance(
            card,
            dict,
        ):
            return None

        return self._card_reference_from_payload(
            card
        )

    def get_deck(
        self,
        deck_identifier,
    ):
        deck_id = (
            self.normalize_deck_identifier(
                deck_identifier
            )
        )

        payload = self._request_json(
            self.DECK_PATH.format(
                deck_id=deck_id
            ),
            operation=(
                f"Moxfield deck {deck_id}"
            ),
        )

        return self._normalize_deck(
            payload
        )

    def normalize_deck_identifier(
        self,
        deck_identifier,
    ):
        value = str(
            deck_identifier
            or ""
        ).strip()

        if not value:
            raise ValueError(
                "Moxfield deck ID or URL "
                "is required."
            )

        if self._DECK_ID_RE.fullmatch(
            value
        ):
            return value

        parsed = urlparse(value)

        if parsed.scheme not in {
            "http",
            "https",
        }:
            raise ValueError(
                "Invalid Moxfield deck "
                "ID or URL."
            )

        if parsed.netloc.lower() not in {
            "moxfield.com",
            "www.moxfield.com",
        }:
            raise ValueError(
                "Deck URL is not a "
                "Moxfield URL."
            )

        path_parts = [
            part
            for part
            in parsed.path.split("/")
            if part
        ]

        if (
            len(path_parts) < 2
            or path_parts[0].lower()
            != "decks"
            or not self._DECK_ID_RE.fullmatch(
                path_parts[1]
            )
        ):
            raise ValueError(
                "Invalid Moxfield deck URL."
            )

        return path_parts[1]

    def _build_search_params(
        self,
        filters,
        page_number,
        page_size,
        commander_card_id="",
        card_id="",
    ):
        sort_direction = str(
            filters.sort_direction
            or "descending"
        ).strip().lower()

        if sort_direction not in {
            "ascending",
            "descending",
        }:
            sort_direction = "descending"

        params = {
            "pageNumber": page_number,
            "pageSize": page_size,

            "fmt": str(
                filters.format
                or ""
            ).strip(),

            "q": str(
                filters.query
                or ""
            ).strip(),

            "deckName": str(
                filters.deck_name
                or ""
            ).strip(),

            "hubName": str(
                filters.hub_name
                or ""
            ).strip(),

            "commanderCardId": str(
                commander_card_id
                or ""
            ).strip(),

            "cardId": str(card_id or "").strip(),

            "partnerCardId": str(
                filters.partner_card_id
                or ""
            ).strip(),

            "companionCardId": str(
                filters.companion_card_id
                or ""
            ).strip(),

            "sortType": str(
                filters.sort_type
                or "updated"
            ).strip(),

            "sortDirection": (
                sort_direction
            ),

            "minBracket": (
                filters.min_bracket
            ),

            "maxBracket": (
                filters.max_bracket
            ),
        }

        if filters.author_usernames:
            params[
                "authorUserNames"
            ] = ",".join(
                str(value).strip()
                for value
                in filters.author_usernames
                if str(value).strip()
            )

        return {
            key: value
            for key, value
            in params.items()
            if value not in {
                None,
                "",
            }
        }

    def _request_json(
        self,
        path,
        params=None,
        operation="Moxfield request",
    ):
        url = (
            f"{self.API_BASE_URL}{path}"
        )

        last_error = None

        for attempt in range(
            self.max_retries
        ):
            try:
                response = (
                    self.session.get(
                        url,
                        params=params,
                        timeout=self.timeout,
                    )
                )

            except requests.RequestException as exc:
                last_error = exc

                if (
                    attempt + 1
                    >= self.max_retries
                ):
                    raise (
                        ExternalDeckProviderUnavailableError(
                            f"{operation} failed: "
                            f"{exc}"
                        )
                    ) from exc

                time.sleep(
                    self.backoff_seconds
                    * (2 ** attempt)
                )

                continue

            if response.status_code == 404:
                raise ExternalDeckNotFoundError(
                    f"{operation} was not found."
                )

            if (
                response.status_code
                in self._RETRYABLE_STATUS_CODES
            ):
                if (
                    attempt + 1
                    >= self.max_retries
                ):
                    if (
                        response.status_code
                        == 429
                    ):
                        raise (
                            ExternalDeckRateLimitedError(
                                f"{operation} was "
                                "rate limited by "
                                "Moxfield."
                            )
                        )

                    raise (
                        ExternalDeckProviderUnavailableError(
                            f"{operation} failed "
                            f"with HTTP "
                            f"{response.status_code}."
                        )
                    )

                time.sleep(
                    self._retry_delay_seconds(
                        response,
                        attempt,
                    )
                )

                continue

            try:
                response.raise_for_status()

            except requests.RequestException as exc:
                raise (
                    ExternalDeckProviderUnavailableError(
                        f"{operation} failed "
                        f"with HTTP "
                        f"{response.status_code}."
                    )
                ) from exc

            try:
                payload = response.json()

            except ValueError as exc:
                raise ExternalDeckSchemaError(
                    f"{operation} did not "
                    "return valid JSON."
                ) from exc

            if not isinstance(
                payload,
                dict,
            ):
                raise ExternalDeckSchemaError(
                    f"{operation} returned "
                    "an unexpected JSON shape."
                )

            return payload

        raise ExternalDeckProviderUnavailableError(
            f"{operation} failed: "
            f"{last_error or 'unknown error'}"
        )


    def _retry_delay_seconds(
        self,
        response,
        attempt,
    ):
        retry_after = str(
            response.headers.get(
                "Retry-After"
            )
            or ""
        ).strip()

        if retry_after.isdigit():
            return max(
                self.backoff_seconds,
                float(retry_after),
            )

        return min(
            10.0,
            self.backoff_seconds
            * (2 ** attempt),
        )

    def _normalize_search_item(
        self,
        item,
    ):
        external_id = str(
            item.get("publicId")
            or item.get("id")
            or ""
        ).strip()

        if not external_id:
            raise ExternalDeckSchemaError(
                "Moxfield search item did "
                "not contain a deck ID."
            )

        raw_commanders = (
            item.get("commanders")
            or []
        )

        if not isinstance(
            raw_commanders,
            list,
        ):
            raw_commanders = []

        commanders = tuple(
            commander
            for commander in (
                self._search_commander_reference(
                    value
                )
                for value in raw_commanders
            )
            if commander is not None
        )

        leader_count = len(
            raw_commanders
        )

        mainboard_count = self._safe_int(
            item.get("mainboardCount"),
            0,
        )

        return ExternalDeckSummary(
            provider=self.provider_key,
            external_id=external_id,

            external_url=str(
                item.get("publicUrl")
                or (
                    "https://www.moxfield.com/"
                    f"decks/{external_id}"
                )
            ).strip(),

            name=str(
                item.get("name")
                or ""
            ).strip(),

            format=str(
                item.get("format")
                or ""
            ).strip(),

            author=self._extract_author_name(
                item.get("createdByUser")
            ),

            commanders=commanders,

            color_identity=tuple(
                str(value)
                for value in (
                    item.get("colorIdentity")
                    or []
                )
                if str(value).strip()
            ),

            bracket=self._safe_optional_int(
                item.get("bracket")
            ),

            auto_bracket=(
                self._safe_optional_int(
                    item.get("autoBracket")
                )
            ),

            likes=self._safe_int(
                item.get("likeCount"),
                0,
            ),

            views=self._safe_int(
                item.get("viewCount"),
                0,
            ),

            mainboard_count=(
                mainboard_count
            ),

            sideboard_count=self._safe_int(
                item.get("sideboardCount"),
                0,
            ),

            leader_count=(
                leader_count
            ),

            playable_card_count=(
                mainboard_count
                + leader_count
            ),

            is_legal=bool(
                item.get(
                    "isLegal",
                    True,
                )
            ),
        )

    def _normalize_deck(
        self,
        payload,
    ):
        external_id = str(
            payload.get("publicId")
            or payload.get("id")
            or ""
        ).strip()

        if not external_id:
            raise ExternalDeckSchemaError(
                "Moxfield deck response did "
                "not contain a deck ID."
            )

        boards = (
            payload.get("boards")
            or {}
        )

        if not isinstance(
            boards,
            dict,
        ):
            raise ExternalDeckSchemaError(
                "Moxfield deck response did "
                "not contain a boards object."
            )

        cards = []
        commanders = []

        for (
            board_name,
            board_payload,
        ) in boards.items():

            if not isinstance(
                board_payload,
                dict,
            ):
                continue

            raw_cards = (
                board_payload.get("cards")
                or {}
            )

            if not isinstance(
                raw_cards,
                dict,
            ):
                continue

            for (
                provider_card_key,
                board_card,
            ) in raw_cards.items():

                if not isinstance(
                    board_card,
                    dict,
                ):
                    continue

                card = (
                    self._normalize_board_card(
                        board_name,
                        provider_card_key,
                        board_card,
                    )
                )

                if card is None:
                    continue

                cards.append(card)

                if board_name in {
                    "commanders",
                    "partners",
                }:
                    commanders.append(
                        ExternalCardReference(
                            name=card.name,
                            provider_card_id=(
                                card.provider_card_id
                            ),
                            scryfall_id=(
                                card.scryfall_id
                            ),
                            set_code=(
                                card.set_code
                            ),
                            collector_number=(
                                card.collector_number
                            ),
                        )
                    )

        mainboard_count = (
            self._board_count(
                boards,
                "mainboard",
            )
        )

        leader_count = (
            self._board_count(
                boards,
                "commanders",
            )
            + self._board_count(
                boards,
                "partners",
            )
        )

        summary = ExternalDeckSummary(
            provider=self.provider_key,
            external_id=external_id,

            external_url=str(
                payload.get("publicUrl")
                or (
                    "https://www.moxfield.com/"
                    f"decks/{external_id}"
                )
            ).strip(),

            name=str(
                payload.get("name")
                or ""
            ).strip(),

            format=str(
                payload.get("format")
                or ""
            ).strip(),

            author=self._extract_author_name(
                payload.get("createdByUser")
            ),

            commanders=tuple(
                commanders
            ),

            main_card=(
                self._card_reference_from_payload(
                    payload.get("main")
                )
            ),

            color_identity=tuple(
                str(value)
                for value in (
                    payload.get("colorIdentity")
                    or []
                )
                if str(value).strip()
            ),

            bracket=self._safe_optional_int(
                payload.get("bracket")
            ),

            auto_bracket=(
                self._safe_optional_int(
                    payload.get("autoBracket")
                )
            ),

            likes=self._safe_int(
                payload.get("likeCount"),
                0,
            ),

            views=self._safe_int(
                payload.get("viewCount"),
                0,
            ),

            mainboard_count=(
                mainboard_count
            ),

            sideboard_count=(
                self._board_count(
                    boards,
                    "sideboard",
                )
            ),

            leader_count=(
                leader_count
            ),

            playable_card_count=(
                mainboard_count
                + leader_count
            ),

            is_legal=True,
        )

        return ExternalDeck(
            summary=summary,
            cards=tuple(cards),
            description=str(
                payload.get("description")
                or ""
            ).strip(),
        )

    def _normalize_board_card(
        self,
        board_name,
        provider_card_key,
        board_card,
    ):
        card = (
            board_card.get("card")
            or {}
        )

        if not isinstance(
            card,
            dict,
        ):
            return None

        name = str(
            card.get("name")
            or ""
        ).strip()

        if not name:
            return None

        return ExternalDeckCard(
            name=name,

            quantity=max(
                1,
                self._safe_int(
                    board_card.get(
                        "quantity"
                    ),
                    1,
                ),
            ),

            board=str(
                board_name
                or ""
            ).strip(),

            provider_card_id=str(
                card.get("id")
                or provider_card_key
                or ""
            ).strip(),

            scryfall_id=str(
                card.get("scryfall_id")
                or ""
            ).strip(),

            set_code=str(
                card.get("set")
                or ""
            ).strip().upper(),

            collector_number=str(
                card.get("cn")
                or ""
            ).strip(),

            type_line=str(
                card.get("type_line")
                or card.get("type")
                or ""
            ).strip(),

            is_foil=bool(
                board_card.get("isFoil")
            ),

            finish=str(
                board_card.get("finish")
                or ""
            ).strip(),
        )

    def _search_commander_reference(
        self,
        value,
    ):
        if not isinstance(
            value,
            dict,
        ):
            return None

        source = (
            value.get("card")
            if isinstance(
                value.get("card"),
                dict,
            )
            else value
        )

        return (
            self._card_reference_from_payload(
                source
            )
        )


    def _card_reference_from_payload(
        self,
        card,
    ):
        if not isinstance(
            card,
            dict,
        ):
            return None

        name = str(
            card.get("name")
            or ""
        ).strip()

        if not name:
            return None

        return ExternalCardReference(
            name=name,

            provider_card_id=str(
                card.get("id")
                or ""
            ).strip(),

            scryfall_id=str(
                card.get("scryfall_id")
                or ""
            ).strip(),

            set_code=str(
                card.get("set")
                or ""
            ).strip().upper(),

            collector_number=str(
                card.get("cn")
                or ""
            ).strip(),
        )


    def _extract_author_name(
        self,
        value,
    ):
        if isinstance(
            value,
            str,
        ):
            return value.strip()

        if not isinstance(
            value,
            dict,
        ):
            return ""

        for key in (
            "userName",
            "username",
            "displayName",
            "name",
        ):
            clean_value = str(
                value.get(key)
                or ""
            ).strip()

            if clean_value:
                return clean_value

        return ""


    def _board_count(
        self,
        boards,
        board_name,
    ):
        board = (
            boards.get(board_name)
            or {}
        )

        if not isinstance(
            board,
            dict,
        ):
            return 0

        count = self._safe_optional_int(
            board.get("count")
        )

        if count is not None:
            return count

        cards = (
            board.get("cards")
            or {}
        )

        if not isinstance(
            cards,
            dict,
        ):
            return 0

        return sum(
            max(
                1,
                self._safe_int(
                    card.get("quantity"),
                    1,
                ),
            )
            for card in cards.values()
            if isinstance(card, dict)
        )


    @staticmethod
    def _safe_int(
        value,
        fallback=0,
    ):
        try:
            return int(value)

        except (
            TypeError,
            ValueError,
        ):
            return int(fallback)


    @staticmethod
    def _safe_optional_int(
        value,
    ):
        if value in {
            None,
            "",
        }:
            return None

        try:
            return int(value)

        except (
            TypeError,
            ValueError,
        ):
            return None
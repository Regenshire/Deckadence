from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class ExternalCardReference:
    name: str
    provider_card_id: str = ""
    scryfall_id: str = ""
    set_code: str = ""
    collector_number: str = ""


@dataclass(frozen=True, slots=True)
class ExternalDeckCard:
    name: str
    quantity: int
    board: str
    provider_card_id: str = ""
    scryfall_id: str = ""
    set_code: str = ""
    collector_number: str = ""
    type_line: str = ""
    is_foil: bool = False
    finish: str = ""


@dataclass(frozen=True, slots=True)
class ExternalDeckSummary:
    provider: str
    external_id: str
    external_url: str
    name: str
    format: str
    author: str = ""
    commanders: tuple[ExternalCardReference, ...] = ()
    color_identity: tuple[str, ...] = ()
    bracket: int | None = None
    auto_bracket: int | None = None
    likes: int = 0
    views: int = 0
    mainboard_count: int = 0
    sideboard_count: int = 0
    leader_count: int = 0
    playable_card_count: int = 0
    is_legal: bool = True


@dataclass(frozen=True, slots=True)
class ExternalDeck:
    summary: ExternalDeckSummary
    cards: tuple[ExternalDeckCard, ...]
    description: str = ""

    def cards_for_board(
        self,
        board: str,
    ) -> tuple[ExternalDeckCard, ...]:
        clean_board = str(board or "").strip().lower()

        return tuple(
            card
            for card in self.cards
            if card.board.lower() == clean_board
        )


@dataclass(frozen=True, slots=True)
class ExternalDeckSearchFilters:
    format: str = "commander"
    query: str = ""
    deck_name: str = ""
    hub_name: str = ""
    author_usernames: tuple[str, ...] = ()
    commander_name: str = ""
    commander_card_id: str = ""
    card_id: str = ""
    partner_card_id: str = ""
    companion_card_id: str = ""
    min_bracket: int | None = None
    max_bracket: int | None = None
    sort_type: str = "updated"
    sort_direction: str = "descending"
    sfw: bool = True


@dataclass(frozen=True, slots=True)
class ExternalDeckSearchPage:
    decks: tuple[ExternalDeckSummary, ...]
    page_number: int
    page_size: int
    total_pages: int
    total_results: int

@dataclass(frozen=True, slots=True)
class ExternalDeckSelectionOptions:
    selection_count: int = 12
    candidate_pool_size: int = 60
    max_search_pages: int = 4
    require_legal: bool = True
    minimum_likes: int = 0
    minimum_views: int = 0
    required_playable_card_count: int | None = None
    exclude_external_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ExternalDeckSelection:
    selected: tuple[ExternalDeckSummary, ...]
    candidate_count: int
    total_results: int
    pages_sampled: tuple[int, ...]


class ExternalDeckError(RuntimeError):
    pass


class ExternalDeckNotFoundError(ExternalDeckError):
    pass


class ExternalDeckRateLimitedError(ExternalDeckError):
    pass


class ExternalDeckProviderUnavailableError(ExternalDeckError):
    pass


class ExternalDeckSchemaError(ExternalDeckError):
    pass


class ExternalDeckSelectionError(ExternalDeckError):
    pass


class ExternalDeckProvider(ABC):
    provider_key = ""

    @abstractmethod
    def search_decks(
        self,
        filters: ExternalDeckSearchFilters,
        page_number: int = 1,
        page_size: int = 50,
    ) -> ExternalDeckSearchPage:
        raise NotImplementedError

    @abstractmethod
    def get_deck(
        self,
        deck_identifier: str,
    ) -> ExternalDeck:
        raise NotImplementedError

    @abstractmethod
    def normalize_deck_identifier(
        self,
        deck_identifier: str,
    ) -> str:
        raise NotImplementedError
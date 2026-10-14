# *** CARD PRICES - Download and Store Market Prices ***
import json
import logging
import re
import sqlite3
import threading
import time
from contextlib import closing
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from uuid import UUID

import requests

from download_identity import get_download_user_agent

from paths import DATABASE_PATH

VENDORS = ("manapool", "cardkingdom")
from settings import (
    MARKET_PRICE_CACHE_SECONDS as TTL,
    MARKET_PRICE_RETRY_SECONDS as RETRY_DELAY,
    MARKET_PRICE_MAX_QUEUED_CARDS as MAX_QUEUED_CARDS,
)
MANAPOOL_URL = "https://manapool.com/api/v1/products/singles"
CARDKINGDOM_URL = "https://api.cardkingdom.com/api/v2/pricelist"
LOG = logging.getLogger(__name__)


def _connect():
    # Optional pricing must not hold a page request behind another DB writer.
    conn = sqlite3.connect(DATABASE_PATH, timeout=.15)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_market_price_schema(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS market_price_quotes (
            provider TEXT NOT NULL, printing_id TEXT NOT NULL, finish TEXT NOT NULL,
            price_cents INTEGER NOT NULL, quantity INTEGER, url TEXT,
            source_updated_at TEXT, fetched_at REAL NOT NULL,
            PRIMARY KEY (provider, printing_id, finish)
        );
        CREATE TABLE IF NOT EXISTS market_price_checks (
            provider TEXT NOT NULL, printing_id TEXT NOT NULL,
            checked_at REAL NOT NULL DEFAULT 0, retry_at REAL NOT NULL DEFAULT 0,
            error TEXT, PRIMARY KEY (provider, printing_id)
        );
    """)


def _uuid(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return ""


def normalize_finish(value):
    finish = str(value or "normal").strip().lower()
    if finish in {"etched", "etched foil", "foil etched"}:
        return "etched"
    if finish in {"foil", "surge", "surge foil", "traditional foil"}:
        return "foil"
    return "normal"


def _cents(value, dollars=False):
    try:
        amount = Decimal(str(value)) * (100 if dollars else 1)
        if not amount.is_finite() or amount <= 0:
            return None
        return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _quantity(value):
    try:
        return max(0, int(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


def _chunks(values, size=400):
    values = list(values)
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]


def _fetch_json(url, params=None):
    started = time.monotonic()
    # Explicit time/size bounds. An unavailable vendor is retried later, not in
    # a request loop that delays card viewing or hammers the provider.
    with requests.get(url, params=params, headers={
        "User-Agent": get_download_user_agent(), "Accept": "application/json",
    }, timeout=(4, 20), stream=True) as response:
        response.raise_for_status()
        parts, size = [], 0
        for part in response.iter_content(1024 * 1024):
            size += len(part)
            if size > 128 * 1024 * 1024 or time.monotonic() - started > 60:
                raise ValueError("Price response exceeded download limits")
            parts.append(part)
        payload = json.loads(b"".join(parts))
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise ValueError("Invalid price response")
    return payload


class PriceEngine:
    def __init__(self, connect=_connect, fetch=_fetch_json, clock=time.time):
        self.connect, self.fetch, self.clock = connect, fetch, clock
        self.lock = threading.RLock()
        self.schema_ready = False
        self.mana_pending = {}  # Ordered, deduplicated printing IDs, including in-flight.
        self.mana_running = False
        self.ck_running = False
        self.provider_retry_at = {provider: 0 for provider in VENDORS}
        self.mana_refresh_lock = threading.Lock()
        self.ck_refresh_lock = threading.Lock()

    def _schema(self):
        with self.lock:
            if not self.schema_ready:
                with closing(self.connect()) as conn:
                    ensure_market_price_schema(conn)
                self.schema_ready = True

    def _resolve(self, cards):
        normalized = []
        for card in cards:
            card = {"card_uuid": card} if isinstance(card, str) else card
            normalized.append({
                "card_uuid": _uuid(card.get("card_uuid")),
                "scryfall_id": _uuid(card.get("scryfall_id")),
                "finish": normalize_finish(card.get("finish", card.get("finish_type"))),
            })
        needed = {c["card_uuid"] for c in normalized if c["card_uuid"] and not c["scryfall_id"]}
        found = {}
        with closing(self.connect()) as conn:
            for batch in _chunks(needed):
                placeholders = ",".join("?" for _ in batch)
                found.update((r[0], r[1]) for r in conn.execute(
                    f"SELECT card_uuid, scryfall_id FROM chaos_cards WHERE card_uuid IN ({placeholders})", batch
                ))
        for card in normalized:
            card["scryfall_id"] = card["scryfall_id"] or _uuid(found.get(card["card_uuid"]))
        return normalized

    def _read(self, cards):
        quotes, checks = {}, {}
        with closing(self.connect()) as conn:
            for provider, key in (("manapool", "card_uuid"), ("cardkingdom", "scryfall_id")):
                ids = {c[key] for c in cards if c[key]}
                for batch in _chunks(ids):
                    placeholders = ",".join("?" for _ in batch)
                    for row in conn.execute(
                        f"SELECT * FROM market_price_quotes WHERE provider=? AND printing_id IN ({placeholders})",
                        [provider, *batch],
                    ):
                        quotes[(provider, row["printing_id"], row["finish"])] = dict(row)
                    if provider == "manapool":
                        for row in conn.execute(
                            f"SELECT * FROM market_price_checks WHERE provider=? AND printing_id IN ({placeholders})",
                            [provider, *batch],
                        ):
                            checks[(provider, row["printing_id"])] = dict(row)
            row = conn.execute("SELECT * FROM market_price_checks WHERE provider='cardkingdom' AND printing_id='*'").fetchone()
            if row:
                checks[("cardkingdom", "*")] = dict(row)
        return quotes, checks

    def _due(self, check):
        now = self.clock()
        return (not check or (check["checked_at"] <= now - TTL and check["retry_at"] <= now))

    def _format(self, cards, quotes, checks):
        now = self.clock()
        result = []
        with self.lock:
            pending = set(self.mana_pending)
            ck_pending = self.ck_running
        for card in cards:
            vendors = {}
            for provider, key in (("manapool", "card_uuid"), ("cardkingdom", "scryfall_id")):
                printing_id = card[key]
                quote = quotes.get((provider, printing_id, card["finish"]))
                check = checks.get((provider, printing_id if provider == "manapool" else "*"), {})
                loading = printing_id in pending if provider == "manapool" else ck_pending
                stale = bool(quote and (quote["fetched_at"] <= now - TTL or quote["fetched_at"] < check.get("checked_at", 0)))
                status = "fresh" if quote and not stale else "stale" if quote else "unavailable"
                if not printing_id:
                    status = "unmapped"
                elif not quote and loading:
                    status = "loading"
                elif not quote and check.get("error"):
                    status = "error"
                vendors[provider] = {
                    "source": provider, "price": quote["price_cents"] / 100 if quote else None,
                    "currency": "USD", "condition": "NM", "finish": card["finish"],
                    "basis": "near_mint_listing" if provider == "manapool" else "near_mint_retail",
                    "quantity": quote["quantity"] if quote and not stale else None,
                    "url": quote["url"] if quote else None,
                    "source_updated_at": quote["source_updated_at"] if quote else None,
                    "fetched_at": quote["fetched_at"] if quote else None,
                    "checked_at": check.get("checked_at") or None,
                    "status": status, "stale": stale, "refreshing": bool(loading),
                    "error": check.get("error"), "retry_at": check.get("retry_at") or None,
                }
            result.append({**card, "prices": vendors})
        return result

    def lookup(self, cards, refresh=True):
        """Return both vendors immediately, in input order, with explicit states."""
        cards = list(cards)
        try:
            self._schema()
            normalized = self._resolve(cards)
            quotes, checks = self._read(normalized)
            if refresh:
                self._schedule(normalized, checks)
            return self._format(normalized, quotes, checks)
        except (sqlite3.Error, OSError, ValueError, TypeError) as exc:
            LOG.warning("Optional price lookup unavailable: %s", exc)
            return [{"card_uuid": c if isinstance(c, str) else c.get("card_uuid", ""),
                     "finish": normalize_finish(c.get("finish", c.get("finish_type"))) if isinstance(c, dict) else "normal",
                     "prices": {p: {"source": p, "price": None, "currency": "USD", "status": "error",
                                    "error": "cache_unavailable", "stale": False, "refreshing": False} for p in VENDORS}}
                    for c in cards]

    def _schedule(self, cards, checks):
        with self.lock:
            for card in cards:
                card_id = card["card_uuid"]
                if card_id and self.clock() >= self.provider_retry_at["manapool"] and len(self.mana_pending) < MAX_QUEUED_CARDS and self._due(checks.get(("manapool", card_id))):
                    self.mana_pending[card_id] = None
            if self.mana_pending and not self.mana_running:
                self.mana_running = True
                threading.Thread(target=self._mana_worker, name="ManaPoolPrices", daemon=True).start()
            if any(c["scryfall_id"] for c in cards) and self.clock() >= self.provider_retry_at["cardkingdom"] and self._due(checks.get(("cardkingdom", "*"))) and not self.ck_running:
                self.ck_running = True
                threading.Thread(target=self._ck_worker, name="CardKingdomPrices", daemon=True).start()

    def _mana_worker(self):
        try:
            while True:
                with self.lock:
                    batch = list(self.mana_pending)[:100]
                    if not batch:
                        self.mana_running = False
                        return
                success = self._refresh_mana(batch)
                with self.lock:
                    for key in batch:
                        self.mana_pending.pop(key, None)
                    if not success:
                        # One failed batch opens the circuit for the queued work.
                        remaining = list(self.mana_pending)
                        self.mana_pending.clear()
                        self._failure("manapool", remaining, "provider_unavailable")
                        self.mana_running = False
                        return
        except Exception:
            LOG.exception("Mana Pool background pricing stopped")
            with self.lock:
                self.mana_pending.clear()
                self.mana_running = False

    def _ck_worker(self):
        try:
            self._refresh_ck()
        finally:
            with self.lock:
                self.ck_running = False

    def _failure(self, provider, ids, error):
        self.provider_retry_at[provider] = self.clock() + RETRY_DELAY
        if not ids:
            return
        try:
            with closing(self.connect()) as conn, conn:
                conn.executemany("""
                    INSERT INTO market_price_checks(provider,printing_id,retry_at,error) VALUES (?,?,?,?)
                    ON CONFLICT(provider,printing_id) DO UPDATE SET retry_at=excluded.retry_at,error=excluded.error
                """, [(provider, key, self.clock() + RETRY_DELAY, error) for key in ids])
        except sqlite3.Error:
            LOG.warning("Could not save price retry state")

    def _save(self, provider, ids, quotes, fetched_at):
        with closing(self.connect()) as conn, conn:
            conn.executemany("""
                INSERT INTO market_price_quotes VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(provider,printing_id,finish) DO UPDATE SET
                price_cents=excluded.price_cents,quantity=excluded.quantity,url=excluded.url,
                source_updated_at=excluded.source_updated_at,fetched_at=excluded.fetched_at
            """, [(provider, *quote, fetched_at) for quote in quotes])
            conn.executemany("""
                INSERT INTO market_price_checks VALUES (?,?,?,0,NULL)
                ON CONFLICT(provider,printing_id) DO UPDATE SET checked_at=excluded.checked_at,retry_at=0,error=NULL
            """, [(provider, key, fetched_at) for key in ids])

    def _refresh_mana(self, ids):
        with self.mana_refresh_lock:
            return self._refresh_mana_locked(ids)

    def _refresh_mana_locked(self, ids):
        try:
            _, checks = self._read([{"card_uuid": key, "scryfall_id": ""} for key in ids])
            ids = [key for key in ids if self._due(checks.get(("manapool", key)))]
            if not ids:
                return True
            data = self.fetch(MANAPOOL_URL, [("mtgjson_uuids", key) for key in ids] + [("languages", "EN")])
            stamp = (data.get("meta") or {}).get("as_of")
            quotes = []
            for row in data["data"]:
                key = row.get("card_id")
                if key not in ids:
                    continue
                for finish, suffix, code in (("normal", "", "NF"), ("foil", "_foil", "FO"), ("etched", "_etched", "EF")):
                    price = _cents(row.get("price_cents_nm" + suffix))
                    if price is None:
                        continue
                    variants = [v for v in row.get("variants", []) if v.get("finish_id") == code and v.get("condition_id") == "NM" and v.get("language_id") == "EN"]
                    quantity = sum(_quantity(v.get("available_quantity")) or 0 for v in variants) if variants else None
                    url = row.get("url")
                    if not str(url or "").startswith("https://manapool.com/"):
                        url = None
                    quotes.append((key, finish, price, quantity, url, stamp))
            self._save("manapool", ids, quotes, self.clock())
            return True
        except Exception as exc:
            LOG.warning("Mana Pool refresh failed: %s", exc)
            self._failure("manapool", ids, "provider_unavailable")
            return False

    def _refresh_ck(self):
        with self.ck_refresh_lock:
            return self._refresh_ck_locked()

    def _refresh_ck_locked(self):
        try:
            _, checks = self._read([])
            if not self._due(checks.get(("cardkingdom", "*"))):
                return True
            data = self.fetch(CARDKINGDOM_URL)
            stamp = (data.get("meta") or {}).get("created_at")
            quotes = {}
            for row in data["data"]:
                key = _uuid(row.get("scryfall_id"))
                condition = row.get("condition_values") or {}
                price = _cents(condition.get("nm_price"), dollars=True)
                if not key or price is None:
                    continue
                foil = str(row.get("is_foil", "")).lower() in {"true", "1"}
                finish = "etched" if foil and re.search(r"\betched\b", row.get("variation") or "", re.I) else "foil" if foil else "normal"
                quantity = _quantity(condition.get("nm_qty"))
                path = row.get("url") or ""
                url = "https://www.cardkingdom.com/" + path if path.startswith("mtg/") else None
                quote = (key, finish, price, quantity, url, stamp)
                old = quotes.get((key, finish))
                # Same printing/finish may have multiple listings. Prefer stock,
                # then the lowest NM price; never substitute another printing.
                if not old or (not bool(quantity), price) < (not bool(old[3]), old[2]):
                    quotes[(key, finish)] = quote
            if not quotes:
                raise ValueError("Empty Card Kingdom price feed")
            self._save("cardkingdom", ["*"], quotes.values(), self.clock())
            return True
        except Exception as exc:
            LOG.warning("Card Kingdom refresh failed: %s", exc)
            self._failure("cardkingdom", ["*"], "provider_unavailable")
            return False

    def refresh(self, cards):
        """Blocking bulk entry point for background callers; respects both TTLs."""
        self._schema()
        normalized = self._resolve(cards)
        _, checks = self._read(normalized)
        due = {c["card_uuid"] for c in normalized if c["card_uuid"] and self._due(checks.get(("manapool", c["card_uuid"])))}
        for batch in _chunks(due, 100):
            if not self._refresh_mana(batch):
                break
        if any(c["scryfall_id"] for c in normalized) and self._due(checks.get(("cardkingdom", "*"))):
            self._refresh_ck()
        return self.lookup(normalized, refresh=False)


engine = PriceEngine()


def lookup_card_prices(cards, refresh=True):
    return engine.lookup(cards, refresh=refresh)


def lookup_card_price(card_uuid, finish="normal", refresh=True):
    return lookup_card_prices([{"card_uuid": card_uuid, "finish": finish}], refresh=refresh)[0]


def summarize_card_prices(cards):
    """Per-vendor totals; a partially priced pack is never presented as complete."""
    cards = list(cards)
    totals = {}
    for provider in VENDORS:
        quotes = [card["prices"][provider] for card in cards]
        priced = [quote for quote in quotes if quote.get("price") is not None]
        subtotal = sum(_cents(quote["price"], dollars=True) or 0 for quote in priced) / 100
        totals[provider] = {
            "currency": "USD", "subtotal": subtotal,
            "total": subtotal if len(priced) == len(cards) else None,
            "priced_cards": len(priced), "missing_cards": len(cards) - len(priced),
            "stale_cards": sum(bool(quote.get("stale")) for quote in priced),
        }
    return totals

"""MPCFill's persistent application cache and optional plugin HTTP interface."""
from contextlib import closing
from functools import wraps
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
import time
from uuid import uuid4

from flask import jsonify, request, send_file
from PIL import Image

from paths import DATA_ROOT_DIR
from .manager import get_plugin_status, run_plugin_json
from .mpcfill_selection import is_ai_art

PLUGIN_ID = "mpcfill-browser"
CACHE_ROOT = Path(DATA_ROOT_DIR) / "cache" / "mpcfill"
METADATA_TTL = 24 * 60 * 60
KEY_PATTERN = re.compile(r"[0-9a-f]{64}\Z")
LOCKS = [threading.RLock() for _ in range(64)]
DOWNLOAD_SLOTS = threading.BoundedSemaphore(4)


class MpcFillUnavailable(RuntimeError):
    pass


def require_ready():
    if not get_plugin_status(PLUGIN_ID).get("ready"):
        raise MpcFillUnavailable("Install MPCFill Browser in Settings → Plugins first.")


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid4().hex + ".part")
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def checked_key(key):
    if not isinstance(key, str) or not KEY_PATTERN.fullmatch(key):
        raise ValueError("Invalid cached artwork key.")
    return key


def lock_for(key):
    return LOCKS[int(hashlib.sha256(key.encode()).hexdigest()[:8], 16) % len(LOCKS)]


def cached_metadata(name, producer, refresh=False):
    path = CACHE_ROOT / "metadata" / (name + ".json")
    with lock_for(name):
        existing = read_json(path)
        if (isinstance(existing, dict) and "data" in existing and not refresh
                and isinstance(existing.get("fetched_at"), (int, float))
                and time.time() - existing["fetched_at"] < METADATA_TTL):
            return existing["data"], True, False
        try:
            value = producer()
            atomic_json(path, {"fetched_at": time.time(), "data": value})
            return value, False, False
        except Exception:
            if isinstance(existing, dict) and "data" in existing:
                return existing["data"], True, True
            raise


def catalogue(refresh=False):
    return cached_metadata("catalogue", lambda: run_plugin_json(PLUGIN_ID, "catalogue", {}, timeout=100), refresh)


def record_for(key):
    value = read_json(CACHE_ROOT / "records" / (checked_key(key) + ".json"))
    if not isinstance(value, dict):
        raise LookupError("This artwork is not in the local catalogue. Search again.")
    return value


def store_record(card):
    # Cache revisions separately. Refreshing catalogue metadata must never
    # invalidate the bytes already used by a deck or re-download unchanged art.
    revision = [card.get(field, "") for field in ("identifier", "dateModified", "size", "extension")]
    key = hashlib.sha256(json.dumps(revision, separators=(",", ":")).encode()).hexdigest()
    clean = {field: card.get(field) for field in (
        "identifier", "name", "sourceName", "sourceId", "dpi", "size", "language",
        "tags", "dateCreated", "dateModified", "extension", "sourceExternalLink", "cardType")}
    clean["key"] = key
    atomic_json(CACHE_ROOT / "records" / (key + ".json"), clean)
    return clean


def search(query, card_type="CARD", fuzzy=False, refresh=False):
    query = " ".join(str(query).strip().split())
    if not query or len(query) > 200:
        raise ValueError("Enter a card name of up to 200 characters.")
    if card_type not in {"CARD", "TOKEN", "CARDBACK"}:
        raise ValueError("Unknown card type.")
    name = "search-" + hashlib.sha256(json.dumps([query.casefold(), card_type, bool(fuzzy)]).encode()).hexdigest()
    def fetch():
        catalog, _, _ = catalogue(refresh)
        payload = run_plugin_json(PLUGIN_ID, "search", {"query": query, "card_type": card_type,
                                  "fuzzy": bool(fuzzy), "catalogue": catalog}, timeout=240)
        return [store_record(card) for card in payload["cards"]]
    cards, cached, stale = cached_metadata(name, fetch, refresh)
    catalog, _, catalogue_stale = catalogue()
    # The browser never gets third-party thumbnail or download URLs.
    return {"ok": True, "cards": [dict(card, isAiArt=is_ai_art(card)) for card in cards], "languages": catalog["languages"],
            "cached": cached, "stale": stale or catalogue_stale,
            "saved": saved_keys(), "favorites": favorite_creators()}


def image_path(key, variant, *, download=True):
    checked_key(key)
    if variant not in {"preview", "original"}:
        raise ValueError("Unknown image size.")
    target = CACHE_ROOT / "images" / key / variant
    with lock_for("image:" + key):
        if target.is_file() and target.stat().st_size:
            return target
        record = record_for(key)
        if not download:
            raise LookupError("Download the original image before applying it.")
        require_ready()
        with DOWNLOAD_SLOTS:
            run_plugin_json(PLUGIN_ID, "download", {"identifier": record["identifier"],
                            "variant": variant, "destination": str(target)}, timeout=200)
        if not target.is_file() or not target.stat().st_size:
            raise RuntimeError("The image download did not finish.")
        return target


def saved_connection():
    CACHE_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(CACHE_ROOT / "saved.sqlite3", timeout=15)
    conn.execute("CREATE TABLE IF NOT EXISTS saved (key TEXT PRIMARY KEY, saved_at REAL NOT NULL)")
    conn.execute("CREATE TABLE IF NOT EXISTS favorite_creators (source_id TEXT PRIMARY KEY, name TEXT NOT NULL)")
    conn.commit()
    return conn


def saved_keys():
    with closing(saved_connection()) as conn:
        return [row[0] for row in conn.execute("SELECT key FROM saved ORDER BY saved_at DESC")]


def favorite_creators():
    with closing(saved_connection()) as conn:
        return [dict(id=row[0], name=row[1]) for row in conn.execute(
            "SELECT source_id, name FROM favorite_creators ORDER BY name COLLATE NOCASE")]


def creator_options():
    catalog, _, stale = catalogue()
    creators = sorted([dict(id=str(source["pk"]), name=source["name"]) for source in catalog["sources"].values()],
                      key=lambda source: source["name"].casefold())
    return catalog, creators, stale


def selection_options():
    catalog, creators, stale = creator_options()
    tree, _, tags_stale = cached_metadata("tags", lambda: run_plugin_json(PLUGIN_ID, "tags", {}, timeout=100))
    tags = []
    def flatten(nodes):
        for node in nodes:
            tags.append(node["name"])
            flatten(node.get("children", []))
    flatten(tree.get("tags", []))
    return dict(ok=True, creators=creators, languages=catalog["languages"], tags=sorted(set(tags)),
                favorites=favorite_creators(), stale=stale or tags_stale)


def register_mpcfill_routes(app):
    def api_route(function):
        @wraps(function)
        def wrapped(*args, **kwargs):
            try:
                require_ready()
                return function(*args, **kwargs)
            except MpcFillUnavailable as exc:
                return jsonify(ok=False, message=str(exc)), 503
            except (ValueError, LookupError) as exc:
                return jsonify(ok=False, message=str(exc)), 400
            except Exception:
                app.logger.exception("MPCFill request failed")
                return jsonify(ok=False, message="MPCFill or Google Drive is unavailable. Cached images are retained; try again shortly."), 502
        return wrapped

    @app.post("/plugins/mpcfill-browser/search")
    @api_route
    def mpcfill_search():
        data = request.get_json(silent=True) or {}
        if not isinstance(data, dict):
            raise ValueError("Expected search options.")
        return jsonify(search(data.get("query", ""), data.get("card_type", "CARD"),
                              data.get("fuzzy") is True, data.get("refresh") is True))

    @app.get("/plugins/mpcfill-browser/options")
    @api_route
    def mpcfill_options():
        return jsonify(selection_options())

    @app.route("/plugins/mpcfill-browser/favorites", methods=["GET", "POST"])
    @api_route
    def mpcfill_favorites():
        if request.method == "POST":
            data = request.get_json(silent=True)
            if not isinstance(data, dict) or not isinstance(data.get("favorite"), bool):
                raise ValueError("Choose whether to favorite this creator.")
            source_id = str(data.get("id") or "")
            if not source_id or len(source_id) > 200:
                raise ValueError("Choose a creator.")
            source = None
            if data["favorite"]:
                _, creators, _ = creator_options()
                source = next((item for item in creators if item["id"] == source_id), None)
                if source is None:
                    raise ValueError("This creator is no longer in MPCFill's catalogue. Refresh the search.")
            with closing(saved_connection()) as conn:
                if source:
                    conn.execute("INSERT OR REPLACE INTO favorite_creators VALUES (?, ?)", (source_id, source["name"]))
                else:
                    conn.execute("DELETE FROM favorite_creators WHERE source_id = ?", (source_id,))
                conn.commit()
        return jsonify(ok=True, favorites=favorite_creators())

    @app.get("/plugins/mpcfill-browser/images/<key>/<variant>")
    @api_route
    def mpcfill_image(key, variant):
        path = image_path(key, variant)
        with Image.open(path) as image:
            mimetype = Image.MIME[image.format]
        response = send_file(path, mimetype=mimetype, conditional=True, max_age=31536000)
        response.headers["Cache-Control"] = "private, max-age=31536000, immutable"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.post("/plugins/mpcfill-browser/images/<key>/prepare")
    @api_route
    def mpcfill_prepare(key):
        image_path(key, "original")
        return jsonify(ok=True)

    @app.route("/plugins/mpcfill-browser/saved", methods=["GET", "POST"])
    @api_route
    def mpcfill_saved():
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            if not isinstance(data, dict) or not isinstance(data.get("saved"), bool):
                raise ValueError("Choose whether to save this artwork.")
            key = checked_key(data.get("key"))
            record_for(key)
            with closing(saved_connection()) as conn:
                if data["saved"]:
                    conn.execute("INSERT OR IGNORE INTO saved VALUES (?, ?)", (key, time.time()))
                else:
                    conn.execute("DELETE FROM saved WHERE key = ?", (key,))
                conn.commit()
        keys = saved_keys()
        cards = [read_json(CACHE_ROOT / "records" / (key + ".json")) for key in keys]
        return jsonify(ok=True, saved=keys, cards=[card for card in cards if isinstance(card, dict)])

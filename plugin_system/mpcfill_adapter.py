"""MPCFill adapter using Deckadence's runtime; enabled through the plugin manager."""
import json
import os
from pathlib import Path
import re
import time
from urllib.parse import urlencode, urljoin, urlparse
from uuid import uuid4

import requests
from PIL import Image, ImageOps

from download_identity import get_download_user_agent

API = "https://mpcfill.com/"
MAX_IMAGE_BYTES = 256 * 1024 * 1024
ID_PATTERN = re.compile(r"[A-Za-z0-9_-]{10,200}\Z")


def session(timeout):
    client = requests.Session()
    client.headers["User-Agent"] = get_download_user_agent()
    client.mpcfill_deadline = time.monotonic() + timeout
    return client


def request_timeout(client, read=45):
    remaining = getattr(client, "mpcfill_deadline", float("inf")) - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("The MPCFill request timed out. Try again shortly.")
    return min(10, remaining), min(read, remaining)


def api(client, path, payload=None):
    response = client.get(API + path, stream=True, timeout=request_timeout(client, 35)) if payload is None else client.post(
        API + path, json=payload, stream=True, timeout=request_timeout(client))
    with response:
        response.raise_for_status()
        data = bytearray()
        for chunk in response.iter_content(64 * 1024):
            request_timeout(client)
            data.extend(chunk)
            if len(data) > 24 * 1024 * 1024:
                raise ValueError("MPCFill returned too much data. Try a more specific card name.")
        result = json.loads(data)
    if not isinstance(result, dict):
        raise ValueError("MPCFill returned an unexpected response.")
    return result


def catalogue(client):
    sources = api(client, "2/sources/").get("results", {})
    languages = api(client, "2/languages/").get("languages", [])
    if not isinstance(sources, dict) or not isinstance(languages, list):
        raise ValueError("MPCFill's catalogue is unavailable.")
    return {"sources": sources, "languages": languages}


def search(client, payload):
    raw_query = str(payload["query"])
    if not raw_query.strip() or len(raw_query) > 200:
        raise ValueError("Enter a card name of up to 200 characters.")
    # Split/adventure images can be indexed under the complete name or its
    # first half. Real double-faced cards arrive as the selected face's name.
    names = [raw_query, raw_query.split(" // ")[0]]
    queries = list(dict.fromkeys(" ".join(re.sub(
        r"[~`!@#$%^&*(){}\[\];:\"'’<,.>?/\\|_+=]", "", name.lower()).split()) for name in names))
    queries = [query for query in queries if query]
    if not queries:
        raise ValueError("Enter a card name.")
    kind = payload.get("card_type", "CARD")
    if kind not in {"CARD", "TOKEN", "CARDBACK"}:
        raise ValueError("Unknown card type.")
    catalog = payload["catalogue"]
    settings = {
        "searchTypeSettings": {"fuzzySearch": bool(payload.get("fuzzy")), "filterCardbacks": True},
        "sourceSettings": {"sources": [[int(s["pk"]), True] for s in catalog["sources"].values()]},
        "filterSettings": {"minimumDPI": 0, "maximumDPI": 5000, "maximumSize": 256,
                           "languages": [l["code"] for l in catalog["languages"]],
                           "includesTags": [], "excludesTags": []},
    }
    response = api(client, "2/editorSearch/", {"searchSettings": settings,
                   "queries": [{"query": query, "cardType": kind} for query in queries]})
    ids = []
    for query in queries:
        matches = response.get("results", {}).get(query, {}).get(kind)
        if not isinstance(matches, list):
            raise ValueError("MPCFill returned an unexpected search result.")
        ids.extend(matches)
    ids = list(dict.fromkeys(ids))
    if len(ids) > 5000:
        raise ValueError("More than 5,000 images match. Use a more specific card name.")
    records = {}
    for start in range(0, len(ids), 200):
        records.update(api(client, "2/cards/", {"cardIdentifiers": ids[start:start + 200]}).get("results", {}))
    # Only public Google Drive files indexed by MPCFill are supported. Do not
    # accept arbitrary download URLs supplied by the web client or catalogue.
    return {"cards": [records[i] for i in ids if isinstance(records.get(i), dict)
                      and ID_PATTERN.fullmatch(str(records[i].get("identifier", "")))
                      and records[i].get("sourceType", "Google Drive") == "Google Drive"]}


def allowed_image_url(url):
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return (parsed.scheme == "https" and not parsed.username and not parsed.password
            and parsed.port in (None, 443)
            and (host in {"drive.google.com", "drive.usercontent.google.com"}
                 or host.endswith(".googleusercontent.com")))


def image_response(client, url):
    for _ in range(8):
        if not allowed_image_url(url):
            raise ValueError("Google Drive returned an unsupported image location.")
        response = client.get(url, stream=True, allow_redirects=False, timeout=request_timeout(client))
        if response.is_redirect:
            location = response.headers.get("Location", "")
            response.close()
            url = urljoin(url, location)
            continue
        try:
            response.raise_for_status()
        except Exception:
            response.close()
            raise
        return response
    raise ValueError("Google Drive redirected too many times.")


def download(client, payload):
    identifier = str(payload.get("identifier", ""))
    variant = payload.get("variant")
    if not ID_PATTERN.fullmatch(identifier) or variant not in {"preview", "original"}:
        raise ValueError("Invalid MPCFill image.")
    target = Path(payload["destination"])
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_name(target.name + "." + uuid4().hex + ".part")
    url = ("https://drive.google.com/thumbnail?" + urlencode({"id": identifier, "sz": "w800-h800"})
           if variant == "preview" else "https://drive.usercontent.google.com/download?" + urlencode(
               {"id": identifier, "export": "download", "confirm": "t"}))
    limit = 16 * 1024 * 1024 if variant == "preview" else MAX_IMAGE_BYTES
    try:
        with image_response(client, url) as response:
            if "text/html" in response.headers.get("Content-Type", "").lower():
                raise ValueError("Google Drive cannot provide this image right now. Its download limit or sharing permissions may have changed.")
            total = 0
            deadline = time.monotonic() + 160
            with temporary.open("wb") as output:
                for chunk in response.iter_content(128 * 1024):
                    request_timeout(client)
                    total += len(chunk)
                    if total > limit or time.monotonic() > deadline:
                        raise ValueError("The image exceeded the download size or time limit.")
                    output.write(chunk)
        with Image.open(temporary) as source:
            if source.format not in {"PNG", "JPEG", "WEBP"}:
                raise ValueError("MPCFill images must be PNG, JPEG, or WebP.")
            # Do not change process-wide Pillow limits or warning filters in
            # the shared runtime. Check this plugin's image limit explicitly.
            if source.width * source.height > 89_478_485:
                raise ValueError("The MPCFill image exceeds the supported pixel dimensions.")
            source.verify()
        if variant == "preview":
            with Image.open(temporary) as source:
                preview = ImageOps.exif_transpose(source).convert("RGB")
                preview.thumbnail((800, 1100))
                preview.save(temporary, "JPEG", quality=88, optimize=True)
        request_timeout(client)
        os.replace(temporary, target)
        return {"ok": True}
    finally:
        temporary.unlink(missing_ok=True)


def execute(command, payload, *, timeout=300):
    if command == "health":
        return {"ok": True, "commands": ["catalogue", "tags", "search", "download"]}
    with session(timeout) as client:
        if command == "catalogue":
            return catalogue(client)
        if command == "tags":
            return api(client, "2/tags/")
        if command == "search":
            return search(client, payload)
        if command == "download":
            return download(client, payload)
    raise ValueError("Unknown MPCFill command.")

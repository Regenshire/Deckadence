"""Painted spot masks share the alternate-image library's isolation namespace."""
import base64
from contextlib import closing
from io import BytesIO
import json
import math
import re
import subprocess
import threading
from uuid import uuid4

from flask import jsonify, request, send_file, url_for
from PIL import Image, UnidentifiedImageError
from .foil_workflows import WORKFLOWS, OUTPUTS, LAYER_TYPES, load_preferences, validate_options
from .manager import get_plugin_status, run_plugin_json

MASK_SIZE = (756, 1056)
MAX_MASK_SIZE = (3024, 4224)
_text_detection_lock = threading.Lock()
_MASK_COLUMNS = """scope_token TEXT NOT NULL, card_uuid TEXT NOT NULL, face TEXT NOT NULL,
    revision TEXT NOT NULL, settings TEXT NOT NULL, mask_png_base64 TEXT NOT NULL,
    PRIMARY KEY (scope_token, card_uuid, face)"""


def _ensure_scope_cleanup(conn):
    conn.execute("""CREATE TRIGGER IF NOT EXISTS card_spot_foil_scope_deleted
        AFTER DELETE ON alternate_image_scopes BEGIN
        DELETE FROM card_spot_foil WHERE scope_token=OLD.image_scope_id;
        END""")


def ensure_schema(conn):
    conn.execute(f"CREATE TABLE IF NOT EXISTS card_spot_foil ({_MASK_COLUMNS})")
    columns = {row[1] for row in conn.execute("PRAGMA table_info(card_spot_foil)")}
    if "mask_png" in columns and "mask_png_base64" not in columns:
        # The first editor stored PNG bytes. Preserve those bytes, settings and
        # revisions while upgrading to the text format used by portable backups.
        # A savepoint also works inside initialize_database's transaction.
        conn.execute("SAVEPOINT spot_foil_mask_upgrade")
        try:
            # Serialize concurrent first requests, then recheck after the lock.
            conn.execute("UPDATE card_spot_foil SET revision=revision WHERE 0")
            columns = {row[1] for row in conn.execute("PRAGMA table_info(card_spot_foil)")}
            if "mask_png_base64" not in columns:
                conn.execute(f"CREATE TABLE card_spot_foil_upgrade ({_MASK_COLUMNS})")
                rows = conn.execute("SELECT scope_token, card_uuid, face, revision, settings, mask_png FROM card_spot_foil").fetchall()
                conn.executemany("INSERT INTO card_spot_foil_upgrade VALUES (?,?,?,?,?,?)",
                                 [(*row[:5], base64.b64encode(row[5]).decode("ascii")) for row in rows])
                conn.execute("DROP TRIGGER IF EXISTS card_spot_foil_scope_deleted")
                conn.execute("DROP TABLE card_spot_foil")
                conn.execute("ALTER TABLE card_spot_foil_upgrade RENAME TO card_spot_foil")
            _ensure_scope_cleanup(conn)
        except Exception:
            conn.execute("ROLLBACK TO spot_foil_mask_upgrade")
            conn.execute("RELEASE spot_foil_mask_upgrade")
            raise
        else:
            conn.execute("RELEASE spot_foil_mask_upgrade")
    else:
        _ensure_scope_cleanup(conn)


def copy_spot_foil_scope(conn, source, destination, card_uuids=None):
    """Snapshot masks in the isolation service's existing transaction."""
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='card_spot_foil'").fetchone():
        return
    sql = ("INSERT OR IGNORE INTO card_spot_foil "
           "SELECT ?, card_uuid, face, revision, settings, mask_png_base64 "
           "FROM card_spot_foil WHERE scope_token=?")
    if card_uuids is None:
        conn.execute(sql, (destination, source or "global"))
    else:
        conn.executemany(sql + " AND card_uuid=?", [(destination, source or "global", card) for card in set(card_uuids)])


def card_key(value):
    if not isinstance(value, dict):
        raise ValueError("Choose a card.")
    card_uuid, face = value.get("card_uuid"), value.get("face", "front")
    if (not isinstance(card_uuid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", card_uuid)
            or face not in ("front", "back")):
        raise ValueError("Choose a valid card and face.")
    return card_uuid, face


def read_record(conn, key):
    return conn.execute("SELECT revision, settings, mask_png_base64 FROM card_spot_foil "
                        "WHERE scope_token=? AND card_uuid=? AND face=?", key).fetchone()


def record_json(row, key):
    if row is None:
        return None
    owner = {name: request.args[name] for name in ("image_owner_kind", "image_owner_id") if name in request.args}
    return {**json.loads(row["settings"]), "revision": row["revision"],
            "mask_url": url_for("card_spot_foil_mask", card_uuid=key[1], face=key[2],
                                expected_scope=key[0], revision=row["revision"], **owner)}


def decode_mask(value):
    prefix = "data:image/png;base64,"
    if not isinstance(value, str) or not value.startswith(prefix) or len(value) > 24_000_000:
        raise ValueError("Provide a PNG mask smaller than 24 MB when encoded.")
    try:
        raw = base64.b64decode(value[len(prefix):], validate=True)
        with Image.open(BytesIO(raw)) as source:
            width, height = source.size
            if (source.format != "PNG" or source.mode != "RGBA"
                    or not MASK_SIZE[0] <= width <= MAX_MASK_SIZE[0]
                    or not MASK_SIZE[1] <= height <= MAX_MASK_SIZE[1]
                    or abs(height - width * MASK_SIZE[1] / MASK_SIZE[0]) > 1):
                raise ValueError("Use a card-proportioned RGBA PNG between 756 × 1056 and 3024 × 4224.")
            alpha = source.getchannel("A")
            # An explicitly saved empty reveal mask means fully opaque in a
            # white-underbase workflow. It is different from having no mask.
            canonical = Image.new("RGBA", source.size, "white")
            canonical.putalpha(alpha)
            output = BytesIO()
            canonical.save(output, format="PNG")
            return output.getvalue()
    except (UnidentifiedImageError, OSError, base64.binascii.Error) as exc:
        raise ValueError("The spot mask could not be read as a PNG.") from exc


def validate_generation(value):
    defaults = dict(mode="highlights", region="artwork", amount=35, coverage=100, action="foil", cleanup="balanced",
                    pocket_size=64, pocket_target="both",
                    text_mode="original", text_source="standard", text_detail="letters",
                    text_regions=[], border_mode="original", border_width=2)
    if not isinstance(value, dict) or set(value) - set(defaults):
        raise ValueError("Choose valid automatic selection settings.")
    value = {**defaults, **value}
    choices = dict(mode=("highlights", "colors", "details", "shadows", "artwork"), action=("foil", "opaque"),
                   region=("artwork", "full"), text_mode=("original", "opaque", "foil"),
                   border_mode=("original", "opaque", "foil"), text_source=("standard", "detected"),
                   text_detail=("letters", "regions"), cleanup=("off", "balanced", "strong"),
                   pocket_target=("both", "foil", "holes"))
    if any(value[key] not in options for key, options in choices.items()):
        raise ValueError("Choose valid text, border, and selection modes.")
    if type(value["pocket_size"]) is not int or not 1 <= value["pocket_size"] <= 65536:
        raise ValueError("Maximum pocket area must be a whole number from 1 to 65,536 pixels.")
    for key, limits in dict(amount=(5, 95), coverage=(1, 100), border_width=(0, 12)).items():
        number = value[key]
        if type(number) not in (int, float) or not limits[0] <= number <= limits[1]:
            raise ValueError("Choose a valid selection percentage.")
    regions = value["text_regions"]
    if not isinstance(regions, list) or len(regions) > 400:
        raise ValueError("Too many text regions.")
    for polygon in regions:
        if not isinstance(polygon, list) or len(polygon) != 4:
            raise ValueError("Text regions must have four corners.")
        for point in polygon:
            if (not isinstance(point, list) or len(point) != 2 or any(
                    type(coordinate) not in (int, float) or not math.isfinite(coordinate)
                    or not 0 <= coordinate <= 1 for coordinate in point)):
                raise ValueError("Text regions must stay within the card.")
    return value


def validate_settings(payload):
    if not isinstance(payload, dict) or set(payload) - {
        "workflow_id", "workflow_options", "finish", "strength", "mask_data", "revision", "artwork_signature", "generation",
    }:
        raise ValueError("Provide valid card spot-foiling settings.")
    workflow = payload.get("workflow_id")
    if not isinstance(workflow, str) or workflow not in {item["id"] for item in WORKFLOWS}:
        raise ValueError("Choose a supported print workflow.")
    options = validate_options(workflow, payload.get("workflow_options"))
    # The reviewed, painted mask is authoritative; generation protections must
    # not silently remove intentional strokes over text or frames later.
    options.update(selection="manual", protect_text=False, protect_frame=False)
    finish, strength = payload.get("finish"), payload.get("strength")
    if finish not in ("foil", "surge", "chocobo"):
        raise ValueError("Choose a supported foil effect.")
    if type(strength) not in (int, float) or not 1 <= strength <= 100:
        raise ValueError("Preview strength must be between 1 and 100.")
    signature = payload.get("artwork_signature", "")
    if not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{8}", signature):
        raise ValueError("Reload the card artwork before saving.")
    generation = validate_generation(payload.get("generation", {}))
    return {"workflow_id": workflow, "workflow_options": options, "finish": finish,
            "strength": strength, "artwork_signature": signature, "generation": generation}


def register_card_spot_foil_routes(app, get_connection, get_config, resolve_context, api_errors, isolation_operation):
    @app.route("/cards/spot-foil/lookup", methods=["POST"])
    @api_errors
    def card_spot_foil_lookup():
        payload = request.get_json(silent=True)
        targets = payload.get("targets") if isinstance(payload, dict) else None
        if not isinstance(targets, list) or len(targets) > 200:
            raise ValueError("Request up to 200 cards.")
        cards = [card_key(value) for value in targets]
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            context = resolve_context(conn, False)
            token = context.scope_id or "global"
            records = [{"target": dict(card_uuid=card[0], face=card[1]),
                        "record": record_json(read_record(conn, (token, *card)), (token, *card))}
                       for card in cards]
        return jsonify(ok=True, records=records, image_scope=dict(token=token, is_isolated=context.is_isolated))

    @app.route("/cards/spot-foil/<card_uuid>/<face>", methods=["GET", "PUT", "DELETE"])
    @api_errors
    @isolation_operation
    def card_spot_foil(card_uuid, face):
        card = card_key(dict(card_uuid=card_uuid, face=face))
        settings = mask = payload = None
        writing = request.method != "GET"
        if writing:
            if request.content_length and request.content_length > 24_100_000:
                return jsonify(ok=False, message="The spot mask is too large."), 413
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict) or "revision" not in payload:
                raise ValueError("Reload the saved card before editing.")
            if request.args.get("expected_scope") is None:
                raise ValueError("Reload the image library before saving.")
            if request.method == "PUT":
                settings = validate_settings(payload)
                mask = decode_mask(payload.get("mask_data"))
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            conn.execute("BEGIN IMMEDIATE" if writing else "BEGIN")
            context = resolve_context(conn, writing)
            token = context.scope_id or "global"
            key = (token, *card)
            if not conn.execute("SELECT 1 FROM chaos_cards WHERE card_uuid=?", (card_uuid,)).fetchone():
                raise LookupError("This card printing is no longer available.")
            row = read_record(conn, key)
            if writing:
                if payload["revision"] != (row["revision"] if row else None):
                    raise RuntimeError("Spot foiling changed in another editor. Close and reopen this card to load the latest version.")
                if request.method == "DELETE":
                    conn.execute("DELETE FROM card_spot_foil WHERE scope_token=? AND card_uuid=? AND face=?", key)
                    row = None
                else:
                    conn.execute("INSERT OR REPLACE INTO card_spot_foil VALUES (?,?,?,?,?,?)",
                                 (*key, uuid4().hex, json.dumps(settings, allow_nan=False),
                                  base64.b64encode(mask).decode("ascii")))
                    row = read_record(conn, key)
            result = record_json(row, key)
        return jsonify(ok=True, record=result, preferences=load_preferences(get_config()), workflows=WORKFLOWS,
                       output_formats=OUTPUTS, layer_types=LAYER_TYPES,
                       text_detector_ready=get_plugin_status("spot-foil-ai").get("ready", False),
                       image_scope=dict(token=token, is_isolated=context.is_isolated))

    @app.route("/cards/spot-foil/<card_uuid>/<face>/detect-text", methods=["POST"])
    @api_errors
    def card_spot_foil_detect_text(card_uuid, face):
        card_key(dict(card_uuid=card_uuid, face=face))
        if not get_plugin_status("spot-foil-ai").get("ready"):
            raise RuntimeError("Install AI Text Detection beside Spot Foiling in Plugin Manager, then retry Detect text.")
        if request.content_length and request.content_length > 6_100_000:
            return jsonify(ok=False, message="The card image is too large."), 413
        payload = request.get_json(silent=True)
        if (not isinstance(payload, dict) or set(payload) != {"image"}
                or not isinstance(payload["image"], str) or len(payload["image"]) > 6_000_000):
            raise ValueError("Provide a card image for text detection.")
        if not _text_detection_lock.acquire(blocking=False):
            raise RuntimeError("Another card is being analyzed. Try again when text detection finishes.")
        try:
            result = run_plugin_json("spot-foil-ai", "detect_text", payload, timeout=90)
            regions = validate_generation({"text_regions": result.get("regions", [])})["text_regions"]
            return jsonify(ok=True, regions=regions)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Text detection took too long. Retry with this card or use the selection tools.") from exc
        finally:
            _text_detection_lock.release()

    @app.route("/cards/spot-foil/<card_uuid>/<face>/mask")
    @api_errors
    def card_spot_foil_mask(card_uuid, face):
        card = card_key(dict(card_uuid=card_uuid, face=face))
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            context = resolve_context(conn, False)
            row = read_record(conn, (context.scope_id or "global", *card))
            if row is None:
                raise LookupError("No spot mask saved for this card.")
            response = send_file(BytesIO(base64.b64decode(row["mask_png_base64"])), mimetype="image/png",
                                 etag=row["revision"], download_name="spot-foil-mask.png")
            response.cache_control.no_cache = True
            return response

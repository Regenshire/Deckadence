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
from .foil_workflows import WORKFLOWS, OUTPUTS, LAYER_TYPES, load_preferences, normalize_display_color
from .manager import get_plugin_status, run_plugin_json
from .finishing_effects import EFFECT_TYPES, validate_effect, parameters, render_overlay, cached_overlay, chocobo_selection, PARTICLE_PATH_EFFECTS, particle_selection
from .finishing_patterns import PATH_EFFECTS, pattern_selection
from .mirror_shards import TEMPLATES as SHARD_TEMPLATES, THEMES as MIRROR_THEMES, shard_selection
from .mirror_generation import register_mirror_generation_routes, generator_ready
from .finishing_bakes import artwork_layers, cached_artwork
from .art_edit import validate_edit, register_art_edit_routes

MASK_SIZE = (756, 1056)
MAX_MASK_SIZE = (3024, 4224)
_text_detection_lock = threading.Lock()
_subject_detection_lock = threading.Lock()


def text_detection_plugin(studio_status=None):
    studio = studio_status if studio_status is not None else get_plugin_status("subject-detection-ai")
    if studio.get("ready") and "text" in studio.get("manifest", {}).get("capabilities", []):
        return "subject-detection-ai"
    # Older installations remain usable until the single Studio bundle is installed.
    if get_plugin_status("spot-foil-ai").get("ready"):
        return "spot-foil-ai"
    return None


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
    settings = json.loads(row["settings"])
    if settings.get('edit'):
        edit=dict(settings['edit']);edit.pop('png_base64',None);edit.pop('paint_png_base64',None)
        edit['image_url']=url_for('card_art_edit_image',card_uuid=key[1],face=key[2],kind='image',expected_scope=key[0],revision=row['revision'],**owner)
        edit['paint_url']=url_for('card_art_edit_image',card_uuid=key[1],face=key[2],kind='paint',expected_scope=key[0],revision=row['revision'],**owner)
        if request.endpoint=='card_spot_foil_lookup':
            edit={key:edit[key] for key in ('version','image_url')}
        settings['edit']=edit
    for layer in ("gloss", "effect1", "effect2"):
        if not settings.get(layer):
            continue
        value = dict(settings[layer])
        value.pop("mask_png_base64", None)
        # Card lists only need the baked overlay URL. The editor detail request
        # receives the durable generated scene, which remains in portable data.
        if value.get('shards') and request.endpoint=='card_spot_foil_lookup':
            value['shards']={**value['shards'],'scene':'','scene_selection':''}
        value["mask_url"] = url_for("card_spot_foil_mask", card_uuid=key[1], face=key[2], layer=layer,
                                    expected_scope=key[0], revision=row["revision"], **owner)
        if layer.startswith("effect"):
            value["overlay_url"] = url_for("card_finishing_overlay", card_uuid=key[1], face=key[2], layer=layer,
                                          expected_scope=key[0], revision=row["revision"], **owner)
        settings[layer] = value
    baked_url = (url_for("card_finishing_baked_art", card_uuid=key[1], face=key[2],
                        expected_scope=key[0], revision=row["revision"], **owner)
                 if any(settings.get(layer) for layer in ("edit", "effect1", "effect2")) else None)
    return {**settings, "revision": row["revision"], "baked_url": baked_url,
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
                    text_mode="original", text_source="standard", text_detail="letters", text_ink="auto",
                    text_expand=0, text_smooth=0, exclude_mode="off", exclude_color="#101010",
                    color_tolerance=32, selected_color="#FFFFFF", color_swatches=[],
                    edge_expand=0, edge_smooth=0, edge_sharpen=0, color_expand=0, color_smooth=0, brush_size=40, brush_softness=0, brush_shape="round",
                    text_regions=[], border_mode="original", border_width=2,
                    frame_mode="original", frame_scope="material", frame_layout="auto")
    if not isinstance(value, dict) or set(value) - set(defaults):
        raise ValueError("Choose valid automatic selection settings.")
    value = {**defaults, **value}
    choices = dict(mode=("none", "highlights", "colors", "details", "shadows", "artwork", "subject", "background"), action=("foil", "opaque"),
                   region=("artwork", "full"), text_mode=("original", "opaque", "foil"),
                   border_mode=("original", "opaque", "foil"), text_source=("standard", "detected"),
                   text_detail=("letters", "regions"), text_ink=("auto", "light", "dark"), cleanup=("off", "balanced", "strong"),
                   pocket_target=("both", "foil", "holes"), exclude_mode=("off", "darker", "lighter"), brush_shape=("round", "square"),
                   frame_mode=("original", "opaque", "foil"), frame_scope=("material", "panels"), frame_layout=("auto", "m15", "retro", "extended", "borderless", "modern", "classic"))
    if any(value[key] not in options for key, options in choices.items()):
        raise ValueError("Choose valid text, border, and selection modes.")
    if type(value["pocket_size"]) is not int or not 1 <= value["pocket_size"] <= 65536:
        raise ValueError("Maximum pocket area must be a whole number from 1 to 65,536 pixels.")
    for key, limits in dict(text_expand=(-12, 12), text_smooth=(0, 6), edge_expand=(-12, 12), edge_smooth=(0, 6), edge_sharpen=(0, 100),
                            color_expand=(-12, 12), color_smooth=(0, 6), brush_size=(2, 160), brush_softness=(0, 100)).items():
        if type(value[key]) is not int or not limits[0] <= value[key] <= limits[1]:
            raise ValueError("Choose valid brush sizes, outline widths, and smoothing amounts.")
    if type(value["color_tolerance"]) is not int or not 0 <= value["color_tolerance"] <= 128:
        raise ValueError("Color tolerance must be from 0 to 128.")
    value["selected_color"] = normalize_display_color(value["selected_color"])
    value["exclude_color"] = normalize_display_color(value["exclude_color"])
    if not isinstance(value["color_swatches"], list) or len(value["color_swatches"]) > 8:
        raise ValueError("Save up to eight color swatches.")
    value["color_swatches"] = list(dict.fromkeys(normalize_display_color(color) for color in value["color_swatches"]))
    for key, limits in dict(amount=(5, 100), coverage=(1, 100), border_width=(0, 12)).items():
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
        "workflow_id", "workflow_options", "finish", "strength", "mask_data", "revision", "artwork_signature", "generation", "foil_enabled", "gloss", "effect1", "effect2", "edit",
    }:
        raise ValueError("Provide valid card spot-foiling settings.")
    # Accept legacy clients' workflow keys, but never save print-job settings
    # on a card. The mask always describes where foil should show.
    finish, strength = payload.get("finish"), payload.get("strength")
    if finish not in ("foil", "surge", "chocobo"):
        raise ValueError("Choose a supported foil effect.")
    if type(strength) not in (int, float) or not 1 <= strength <= 100:
        raise ValueError("Preview strength must be between 1 and 100.")
    signature = payload.get("artwork_signature", "")
    if not isinstance(signature, str) or not re.fullmatch(r"[0-9a-f]{8}", signature):
        raise ValueError("Reload the card artwork before saving.")
    generation = validate_generation(payload.get("generation", {}))
    result = {"finish": finish, "strength": strength, "artwork_signature": signature, "generation": generation}
    if 'edit' in payload:result['edit']=validate_edit(payload['edit'])
    if "foil_enabled" in payload:
        if type(payload["foil_enabled"]) is not bool:
            raise ValueError("Choose a valid mask layer state.")
        result["foil_enabled"] = payload["foil_enabled"]
    if "gloss" in payload:
        gloss = payload["gloss"]
        if gloss is not None:
            if not isinstance(gloss, dict) or set(gloss) != {"finish", "strength", "overlay_color", "generation", "mask_data"}:
                raise ValueError("Provide valid gloss settings.")
            if gloss["finish"] not in ("gloss", "polished") or type(gloss["strength"]) not in (int, float) or not 1 <= gloss["strength"] <= 100:
                raise ValueError("Choose a gloss effect and strength from 1 to 100.")
            gloss = {"finish": gloss["finish"], "strength": gloss["strength"],
                     "overlay_color": normalize_display_color(gloss["overlay_color"]),
                     "generation": validate_generation(gloss["generation"]),
                     "mask_png_base64": base64.b64encode(decode_mask(gloss["mask_data"])).decode("ascii")}
        result["gloss"] = gloss
    for layer in ("effect1", "effect2"):
        if layer not in payload:
            continue
        value = payload[layer]
        if value is not None:
            keys = {"finish", "strength", "scale", "density", "seed", "overlay_color", "generation", "mask_data"}
            if not isinstance(value, dict) or set(value)-{"color","translucence","shards","rotation","position_x","position_y","transparency","black_depth","silver_brightness"} != keys:
                raise ValueError("Provide valid printable effect settings.")
            value = {**validate_effect(parameters(value)), "overlay_color": normalize_display_color(value["overlay_color"]),
                     "generation": validate_generation(value["generation"]),
                     "mask_png_base64": base64.b64encode(decode_mask(value["mask_data"])).decode("ascii")}
        result[layer] = value
    return result


def register_card_spot_foil_routes(app, get_connection, get_config, resolve_context, api_errors, isolation_operation, load_artwork=None):
    register_mirror_generation_routes(app,get_connection,resolve_context,api_errors,decode_mask,card_key)
    register_art_edit_routes(app,get_connection,resolve_context,api_errors,decode_mask,card_key)
    @app.get('/cards/spot-foil/<card_uuid>/<face>/edit-image/<kind>')
    @api_errors
    def card_art_edit_image(card_uuid,face,kind):
        card=card_key(dict(card_uuid=card_uuid,face=face))
        if kind not in ('image','paint'):raise ValueError('Choose an Edit image.')
        with closing(get_connection()) as conn,conn:
            ensure_schema(conn);context=resolve_context(conn,False)
            row=read_record(conn,(context.scope_id or 'global',*card))
            edit=json.loads(row['settings']).get('edit') if row else None
        if not edit:raise LookupError('No Edit layer is saved.')
        response=send_file(BytesIO(base64.b64decode(edit['png_base64' if kind=='image' else 'paint_png_base64'])),mimetype='image/png')
        response.cache_control.no_cache=True
        return response
    # The app supplies its normal, scope-aware original-art resolver. Never load
    # a browser-provided URL or another baked image as the source.
    def bake(card, context, settings):
        loader = load_artwork or app.config.get("FINISHING_ARTWORK_LOADER")
        if not loader:
            raise RuntimeError("The finishing artwork source is unavailable.")
        path = loader(*card, context)
        with Image.open(path) as source:
            return cached_artwork(source, artwork_layers(settings))

    @app.get("/cards/spot-foil/<card_uuid>/<face>/baked-art")
    @api_errors
    def card_finishing_baked_art(card_uuid, face):
        card = card_key(dict(card_uuid=card_uuid, face=face))
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            context = resolve_context(conn, False)
            row = read_record(conn, (context.scope_id or "global", *card))
            settings = json.loads(row["settings"]) if row else {}
        path = bake(card, context, settings)
        response = send_file(path, mimetype="image/png", etag=path.stem,
                             download_name=f"{card_uuid}-{face}-finished.png")
        # Source art may change independently of the finishing revision.
        response.cache_control.no_cache = True
        return response
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
            if request.content_length and request.content_length > 200_500_000:
                return jsonify(ok=False, message="The card finish images are too large."), 413
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
                    old = json.loads(row["settings"]) if row else {}
                    if any(old.get(layer) for layer in ("edit", "gloss", "effect1", "effect2")) and not payload.get("all_layers"):
                        old["foil_enabled"] = False
                        conn.execute("UPDATE card_spot_foil SET settings=?, revision=? WHERE scope_token=? AND card_uuid=? AND face=?",
                                     (json.dumps(old, allow_nan=False), uuid4().hex, *key))
                        row = read_record(conn, key)
                    else:
                        conn.execute("DELETE FROM card_spot_foil WHERE scope_token=? AND card_uuid=? AND face=?", key)
                        row = None
                else:
                    # Older clients must not erase layers they do not understand.
                    previous = json.loads(row["settings"]) if row else {}
                    for layer in ("edit", "gloss", "effect1", "effect2"):
                        if layer not in payload and previous.get(layer):
                            settings[layer] = previous[layer]
                    conn.execute("INSERT OR REPLACE INTO card_spot_foil VALUES (?,?,?,?,?,?)",
                                 (*key, uuid4().hex, json.dumps(settings, allow_nan=False),
                                  base64.b64encode(mask).decode("ascii")))
                    row = read_record(conn, key)
            result = record_json(row, key)
        if request.method == "PUT":
            # Disposable view caches are optional: a cache error must never turn
            # a successful atomic save into a misleading save failure.
            if any(settings.get(layer) for layer in ("edit", "effect1", "effect2")):
                try:
                    if load_artwork or app.config.get("FINISHING_ARTWORK_LOADER"):
                        bake(card, context, settings)
                except Exception:
                    app.logger.warning("Could not bake finishing artwork; the next view will retry", exc_info=True)
        subject_detector = get_plugin_status("subject-detection-ai")
        return jsonify(ok=True, record=result, preferences=load_preferences(get_config()), workflows=WORKFLOWS,
                       output_formats=OUTPUTS, layer_types=LAYER_TYPES, effect_types=EFFECT_TYPES,
                       shard_templates=SHARD_TEMPLATES, mirror_themes=MIRROR_THEMES,
                       mirror_generator_ready=generator_ready(app),
                       text_detector_ready=bool(text_detection_plugin(subject_detector)),
                       subject_detector_ready=subject_detector.get("ready", False),
                       frame_detector_ready=bool(subject_detector.get("ready") and
                           "frame" in subject_detector.get("manifest", {}).get("capabilities", [])),
                       image_scope=dict(token=token, is_isolated=context.is_isolated))

    @app.route("/cards/spot-foil/<card_uuid>/<face>/detect-text", methods=["POST"])
    @api_errors
    def card_spot_foil_detect_text(card_uuid, face):
        card_key(dict(card_uuid=card_uuid, face=face))
        detector_id = text_detection_plugin()
        if not detector_id:
            raise RuntimeError("Install or update Card Finishing Studio in Plugin Manager, then retry Detect text.")
        if request.content_length and request.content_length > 6_100_000:
            return jsonify(ok=False, message="The card image is too large."), 413
        payload = request.get_json(silent=True)
        if (not isinstance(payload, dict) or set(payload) != {"image"}
                or not isinstance(payload["image"], str) or len(payload["image"]) > 6_000_000):
            raise ValueError("Provide a card image for text detection.")
        if not _text_detection_lock.acquire(blocking=False):
            raise RuntimeError("Another card is being analyzed. Try again when text detection finishes.")
        try:
            result = run_plugin_json(detector_id, "detect_text", payload, timeout=90)
            regions = validate_generation({"text_regions": result.get("regions", [])})["text_regions"]
            return jsonify(ok=True, regions=regions)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Text detection took too long. Retry with this card or use the selection tools.") from exc
        finally:
            _text_detection_lock.release()

    @app.route("/cards/spot-foil/<card_uuid>/<face>/detect-subject", methods=["POST"])
    @api_errors
    def card_spot_foil_detect_subject(card_uuid, face):
        card_key(dict(card_uuid=card_uuid, face=face))
        if not get_plugin_status("subject-detection-ai").get("ready"):
            raise RuntimeError("Install or update Card Finishing Studio in Plugin Manager, then retry Apply.")
        if request.content_length and request.content_length > 6_100_000:
            return jsonify(ok=False, message="The card image is too large."), 413
        payload = request.get_json(silent=True)
        if (not isinstance(payload, dict) or set(payload) != {"image"}
                or not isinstance(payload["image"], str) or len(payload["image"]) > 6_000_000):
            raise ValueError("Provide an image for subject detection.")
        if not _subject_detection_lock.acquire(blocking=False):
            raise RuntimeError("Another subject is being detected. Try again when it finishes.")
        try:
            result = run_plugin_json("subject-detection-ai", "detect_subject", payload, timeout=300)
            encoded = result.get("mask") if isinstance(result, dict) else None
            if not isinstance(encoded, str) or len(encoded) > 6_000_000:
                raise ValueError("Subject detection returned an invalid mask.")
            with Image.open(BytesIO(base64.b64decode(encoded, validate=True))) as source:
                if source.format != "PNG" or source.mode != "L" or source.width * source.height > 4_000_000:
                    raise ValueError("Subject detection returned an invalid mask.")
                canonical = Image.new("RGBA", source.size, "white")
                canonical.putalpha(source)
                output = BytesIO(); canonical.save(output, format="PNG")
            return jsonify(ok=True, mask_data="data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii"))
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Subject detection took too long. Check the model download and retry.") from exc
        except (UnidentifiedImageError, OSError, base64.binascii.Error) as exc:
            raise ValueError("Subject detection returned an unreadable mask.") from exc
        finally:
            _subject_detection_lock.release()

    @app.route("/cards/spot-foil/<card_uuid>/<face>/detect-frame", methods=["POST"])
    @api_errors
    def card_spot_foil_detect_frame(card_uuid, face):
        card_key(dict(card_uuid=card_uuid, face=face))
        detector = get_plugin_status("subject-detection-ai")
        if not detector.get("ready") or "frame" not in detector.get("manifest", {}).get("capabilities", []):
            raise RuntimeError("Install or update Card Finishing Studio in Plugin Manager, then retry.")
        if request.content_length and request.content_length > 6_100_000:
            return jsonify(ok=False, message="The card image is too large."), 413
        payload = request.get_json(silent=True)
        if (not isinstance(payload, dict) or set(payload) != {"image", "layout"}
                or not isinstance(payload["image"], str) or len(payload["image"]) > 6_000_000
                or payload["layout"] not in ("auto", "m15", "retro", "extended", "borderless")):
            raise ValueError("Provide a card image and frame layout.")
        if not _subject_detection_lock.acquire(blocking=False):
            raise RuntimeError("Another card is being analyzed. Try again when it finishes.")
        try:
            result = run_plugin_json("subject-detection-ai", "detect_frame", payload, timeout=480)
            masks = {}; size = None
            for key in ("material", "panels"):
                encoded = result.get(key) if isinstance(result, dict) else None
                if not isinstance(encoded, str) or len(encoded) > 6_000_000:
                    raise ValueError("Frame detection returned an invalid mask.")
                with Image.open(BytesIO(base64.b64decode(encoded, validate=True))) as source:
                    if (source.format != "PNG" or source.mode != "L" or min(source.size) < 16
                            or source.width * source.height > 4_000_000 or (size and source.size != size)):
                        raise ValueError("Frame detection returned an invalid mask.")
                    size = source.size
                    canonical = Image.new("RGBA", size, "white"); canonical.putalpha(source)
                    output = BytesIO(); canonical.save(output, format="PNG")
                    masks[key] = "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")
            parts = result.get("parts", [])
            if not isinstance(parts, list) or any(part not in ("title", "type", "rules", "power", "surround") for part in parts):
                raise ValueError("Frame detection returned invalid components.")
            return jsonify(ok=True, masks=masks, found=bool(parts), parts=parts)
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Frame detection took too long. Check the model download and retry.") from exc
        except (UnidentifiedImageError, OSError, base64.binascii.Error) as exc:
            raise ValueError("Frame detection returned an unreadable mask.") from exc
        finally:
            _subject_detection_lock.release()

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
            layer = request.args.get("layer", "mask")
            if layer not in ("mask", "gloss", "effect1", "effect2"):
                raise ValueError("Choose a valid finishing layer.")
            png = row["mask_png_base64"]
            if layer != "mask":
                gloss = json.loads(row["settings"]).get(layer)
                if not gloss:
                    raise LookupError("No mask saved for this layer.")
                png = gloss["mask_png_base64"]
            response = send_file(BytesIO(base64.b64decode(png)), mimetype="image/png",
                                 etag=row["revision"], download_name="spot-foil-mask.png")
            response.cache_control.no_cache = True
            return response

    @app.route("/cards/spot-foil/<card_uuid>/<face>/effect-preview", methods=["POST"])
    @api_errors
    def card_finishing_preview(card_uuid, face):
        card_key(dict(card_uuid=card_uuid, face=face))
        if request.content_length and request.content_length > 26_300_000:
            return jsonify(ok=False, message="Preview mask is too large."), 413
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or set(payload) != {"effect", "mask_data"}:
            raise ValueError("Provide an effect and its mask.")
        effect = validate_effect(payload["effect"])
        png = render_overlay(decode_mask(payload["mask_data"]), effect, width=756)
        response = send_file(BytesIO(png), mimetype="image/png")
        response.cache_control.no_store = True
        return response

    @app.route("/cards/spot-foil/<card_uuid>/<face>/effect-path", methods=["POST"])
    @api_errors
    def card_finishing_path(card_uuid, face):
        """Copy template geometry without the artwork, tint or current mask."""
        card_key(dict(card_uuid=card_uuid, face=face))
        if request.content_length and request.content_length > 4096:
            return jsonify(ok=False, message="Template settings are too large."), 413
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            raise ValueError('Provide the template and its size, rotation and position.')
        finish = payload.get('finish')
        if not isinstance(finish,str):
            raise ValueError('Choose an effect with a copyable path.')
        keys = {'finish','scale','rotation','width'}
        if finish == 'mirror_shards':
            keys |= {'template','x','y'}
        elif finish in PATH_EFFECTS or finish in PARTICLE_PATH_EFFECTS:
            keys |= {'density','seed'}
        elif finish != 'chocobo_tracks':
            raise ValueError('This effect does not have a copyable template path.')
        # Older clients omit the new track offsets; their default is centered.
        optional = {'x','y'} if finish == 'chocobo_tracks' or finish in PATH_EFFECTS else set()
        if set(payload)-optional != keys:
            raise ValueError('Provide valid template settings.')
        width = payload['width']
        if type(width) is not int or not MASK_SIZE[0] <= width <= MAX_MASK_SIZE[0]:
            raise ValueError('Choose a mask width from 756 to 3024 pixels.')
        height = round(width * MASK_SIZE[1] / MASK_SIZE[0])
        if finish in PARTICLE_PATH_EFFECTS:
            effect=validate_effect(dict(finish=finish,strength=100,scale=payload['scale'],density=payload['density'],seed=payload['seed'],rotation=payload['rotation']))
            alpha=particle_selection(finish,width,height,effect['scale'],effect['density'],effect['seed'],effect['rotation'])
        elif finish in PATH_EFFECTS:
            effect=validate_effect(dict(finish=finish,strength=100,scale=payload['scale'],density=payload['density'],seed=payload['seed'],
                                        rotation=payload['rotation'],position_x=payload.get('x',0),position_y=payload.get('y',0)))
            alpha=pattern_selection(finish,width,height,effect['scale'],effect['density'],effect['seed'],effect['rotation'],effect['position_x'],effect['position_y'])
        elif finish == 'chocobo_tracks':
            effect = validate_effect(dict(finish=finish,strength=100,scale=payload['scale'],density=100,seed=0,
                                          rotation=payload['rotation'],position_x=payload.get('x',0),position_y=payload.get('y',0)))
            alpha = chocobo_selection(width,height,effect['scale'],effect['rotation'],effect['position_x'],effect['position_y'])
        else:
            effect = validate_effect(dict(finish=finish,strength=100,scale=100,density=100,seed=0,
                rotation=payload['rotation'],shards=dict(template=payload['template'],template_scale=payload['scale'],
                template_x=payload['x'],template_y=payload['y'])))
            settings = effect['shards']
            alpha = shard_selection(settings['template'],width,height,effect['rotation'],settings['template_scale'],
                                    settings['template_x'],settings['template_y'])
        image = Image.new('RGBA',(width,height),'white')
        image.putalpha(alpha)
        output = BytesIO();image.save(output,format='PNG');output.seek(0)
        response = send_file(output,mimetype='image/png')
        response.cache_control.no_store = True
        return response

    @app.route("/cards/spot-foil/<card_uuid>/<face>/effect-overlay")
    @api_errors
    def card_finishing_overlay(card_uuid, face):
        card = card_key(dict(card_uuid=card_uuid, face=face))
        layer = request.args.get("layer")
        if layer not in ("effect1", "effect2"):
            raise ValueError("Choose an effect layer.")
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            context = resolve_context(conn, False)
            row = read_record(conn, (context.scope_id or "global", *card))
            value = json.loads(row["settings"]).get(layer) if row else None
            if not value:
                raise LookupError("No effect saved for this layer.")
            path = cached_overlay(base64.b64decode(value["mask_png_base64"]), value)
        response = send_file(path, mimetype="image/png", etag=path.stem)
        response.cache_control.no_cache = True
        return response

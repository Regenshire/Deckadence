"""Painted spot masks share the alternate-image library's isolation namespace."""
import base64
import hashlib
from contextlib import closing
from io import BytesIO
import json
import math
import re
import subprocess
import threading
import time
from uuid import uuid4

from flask import jsonify, request, send_file, url_for
from PIL import Image, UnidentifiedImageError
from .foil_workflows import WORKFLOWS, OUTPUTS, LAYER_TYPES, load_preferences, normalize_display_color
from .manager import get_plugin_status, run_plugin_json
from .finishing_effects import CONFETTI_GLITTER_TYPES, render_confetti_glitter, EFFECT_TYPES, validate_effect, parameters, render_overlay, chocobo_selection, PARTICLE_PATH_EFFECTS, particle_selection
from .dragon_strike import TRAILS as DRAGON_TRAILS, COLOR_EFFECTS as DRAGON_COLOR_EFFECTS, selection as dragon_selection
from .finishing_ukiyo import TYPES as UKIYO_TYPES, ukiyo_selection
from .finishing_patterns import PATH_EFFECTS, pattern_selection
from .mirror_shards import TEMPLATES as SHARD_TEMPLATES, THEMES as MIRROR_THEMES, shard_selection
from .mirror_layers import SHAPES as MIRROR_SHAPES, LAYOUTS as MIRROR_LAYOUTS, layout_objects, mirror_selection, validate_mirrors, render_mirrors
from .mirror_generation import register_mirror_generation_routes, generator_ready
from .finishing_bakes import artwork_layers, cached_artwork, prepare_effect_bakes, cached_saved_overlay, ensure_record_effect_bakes
from .art_edit import validate_edit, register_art_edit_routes

MASK_SIZE = (756, 1056)
MAX_MASK_SIZE = (3024, 4224)
_text_detection_lock = threading.Lock()
_subject_detection_lock = threading.Lock()


class PreviewBusy(RuntimeError):
    pass


class PreviewQueue:
    """Bound raster work and retain only the newest waiting preview per editor."""
    def __init__(self, capacity=2, pending_limit=4):
        self.condition = threading.Condition()
        self.capacity, self.pending_limit = capacity, pending_limit
        self.running, self.pending, self.latest = set(), {}, {}

    def run(self, key, sequence, render):
        ticket = object()
        with self.condition:
            now = time.monotonic()
            self.latest = {k: v for k, v in self.latest.items()
                           if k in self.running or k in self.pending or now-v[1] < 30}
            if sequence <= self.latest.get(key, (-1, 0))[0]:
                return None
            if key not in self.pending and len(self.pending) >= self.pending_limit:
                raise PreviewBusy('Previews are busy. Please try again shortly.')
            # Bound idle editor identities too, including rapid open/close cycles.
            if len(self.latest) >= 128:
                for old in list(self.latest):
                    if old not in self.running and old not in self.pending:
                        del self.latest[old]
                        break
            self.latest[key] = (sequence, now)
            self.pending[key] = ticket
            self.condition.notify_all()
            while key in self.running or len(self.running) >= self.capacity:
                if self.pending.get(key) is not ticket:
                    return None
                if time.monotonic()-now > 15:
                    self.pending.pop(key, None)
                    raise PreviewBusy('Previews are busy. Please try again shortly.')
                self.condition.wait(.2)
            if self.pending.get(key) is not ticket:
                return None
            del self.pending[key]
            self.running.add(key)
        try:
            result = render()
            with self.condition:
                return result if self.latest[key][0] == sequence else None
        finally:
            with self.condition:
                self.running.remove(key)
                self.condition.notify_all()


def text_detection_plugin(studio_status=None):
    studio = studio_status if studio_status is not None else get_plugin_status("card-finishing-studio")
    if studio.get("ready") and "text" in studio.get("manifest", {}).get("capabilities", []):
        return "card-finishing-studio"
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
    # A disposable projection: image bytes remain in the canonical portable row.
    conn.execute('''CREATE TABLE IF NOT EXISTS card_spot_foil_summary (
        scope_token TEXT, card_uuid TEXT, face TEXT, revision TEXT, settings TEXT,
        PRIMARY KEY(scope_token,card_uuid,face))''')
    for event, alias in (('INSERT', 'NEW'), ('UPDATE', 'OLD'), ('DELETE', 'OLD')):
        conn.execute(f'''CREATE TRIGGER IF NOT EXISTS card_spot_foil_summary_{event.lower()}
            AFTER {event} ON card_spot_foil BEGIN
            DELETE FROM card_spot_foil_summary WHERE scope_token={alias}.scope_token
                AND card_uuid={alias}.card_uuid AND face={alias}.face; END''')
    conn.execute('''CREATE TABLE IF NOT EXISTS card_spot_foil_save_receipts (
        scope_token TEXT, card_uuid TEXT, face TEXT, operation_id TEXT,
        fingerprint TEXT NOT NULL, revision TEXT, created REAL NOT NULL,
        PRIMARY KEY(scope_token,card_uuid,face,operation_id))''')


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


def summary_settings(settings):
    result = dict(settings)
    if result.get('edit'):
        result['edit'] = {'version': result['edit']['version']}
    for name in ('gloss', 'effect1', 'effect2'):
        if not result.get(name):
            continue
        layer = {k: v for k, v in result[name].items() if k not in ('mask_png_base64', 'baked_overlay')}
        if layer.get('shards'):
            layer['shards'] = {**layer['shards'], 'scene': '', 'scene_selection': ''}
        if layer.get('mirrors'):
            layer['mirrors'] = {**layer['mirrors'], 'scenes': {}}
        result[name] = layer
    return json.dumps(result, allow_nan=False)


def read_summary(conn, key, pending=None):
    row = conn.execute('''SELECT s.revision,s.settings FROM card_spot_foil_summary s
        JOIN card_spot_foil f USING(scope_token,card_uuid,face)
        WHERE s.scope_token=? AND s.card_uuid=? AND s.face=? AND s.revision=f.revision''', key).fetchone()
    if row is not None:
        return row
    row = read_record(conn, key)
    if row is None:
        return None
    summary = summary_settings(json.loads(row['settings']))
    entry = (summary, *key, row['revision'])
    if pending is not None:
        pending.append(entry)
    else:
        store_summaries(conn, [entry])
    return dict(revision=row['revision'], settings=summary)


def store_summaries(conn, entries):
    conn.executemany('''INSERT OR REPLACE INTO card_spot_foil_summary
        SELECT scope_token,card_uuid,face,revision,? FROM card_spot_foil
        WHERE scope_token=? AND card_uuid=? AND face=? AND revision=?''', entries)


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
        value.pop('baked_overlay', None)  # Durable print pixels stay server-side.
        # Card lists only need the baked overlay URL. The editor detail request
        # receives the durable generated scene, which remains in portable data.
        if value.get('shards') and request.endpoint=='card_spot_foil_lookup':
            value['shards']={**value['shards'],'scene':'','scene_selection':''}
        if value.get('mirrors') and request.endpoint=='card_spot_foil_lookup':
            value['mirrors']={**value['mirrors'],'scenes':{}}
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
                    art_box_width=88, art_box_height=44, art_box_x=50, art_box_y=34,
                    pocket_size=64, pocket_target="both",
                    text_mode="original", text_source="standard", text_detail="letters", text_ink="auto",
                    text_expand=0, text_smooth=0, exclude_mode="off", exclude_color="#101010",
                    color_tolerance=32, selected_color="#FFFFFF", color_swatches=[],
                    edge_expand=0, edge_smooth=0, edge_sharpen=0, color_expand=0, color_smooth=0, brush_size=40, brush_softness=0, brush_shape="round",
                    text_regions=[], text_symbols=[], border_mode="original", border_width=2,
                    frame_mode="original", frame_scope="material", frame_layout="auto")
    if not isinstance(value, dict) or set(value) - set(defaults):
        raise ValueError("Choose valid automatic selection settings.")
    value = {**defaults, **value}
    choices = dict(mode=("none", "highlights", "colors", "details", "shadows", "artwork", "subject", "background", "text"), action=("foil", "opaque"),
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
    for key, limits in dict(amount=(5, 100), coverage=(1, 100), border_width=(0, 12), art_box_width=(1, 100), art_box_height=(1, 100), art_box_x=(0, 100), art_box_y=(0, 100)).items():
        number = value[key]
        if type(number) not in (int, float) or not limits[0] <= number <= limits[1]:
            raise ValueError("Choose a valid selection percentage.")
    regions = value["text_regions"]
    symbols = value["text_symbols"]
    if not isinstance(regions, list) or len(regions) > 400 or not isinstance(symbols, list) or len(symbols) > 100:
        raise ValueError("Too many text regions.")
    for polygon in regions+symbols:
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
            if not isinstance(value, dict) or set(value)-{"color","translucence","shards","mirrors","rotation","position_x","position_y","transparency","black_depth","silver_brightness","stacked","disabled","origin_x","origin_y","ukiyo_type","sparse","flip_horizontal","particle_type","dragon_emblem","dragon_trail","dragon_alignment","dragon_color_effect"} != keys:
                raise ValueError("Provide valid printable effect settings.")
            value = {**validate_effect(parameters(value)), "overlay_color": normalize_display_color(value["overlay_color"]),
                     "generation": validate_generation(value["generation"]),
                     "mask_png_base64": base64.b64encode(decode_mask(value["mask_data"])).decode("ascii")}
        result[layer] = value
    return result


def register_card_spot_foil_routes(app, get_connection, get_config, resolve_context, api_errors, isolation_operation, load_artwork=None):
    previews = PreviewQueue()

    def preview_work(kind, render):
        client = request.headers.get('X-Studio-Preview-Session')
        sequence = request.headers.get('X-Studio-Preview-Sequence', '0')
        if client and (not re.fullmatch(r'[A-Za-z0-9_:-]{1,120}', client) or not sequence.isdecimal() or len(sequence) > 16):
            raise ValueError('Provide a valid preview request.')
        try:
            result = previews.run((kind, client or uuid4().hex), int(sequence) if client else 0, render)
        except PreviewBusy as error:
            return jsonify(ok=False, message=str(error)), 429, {'Retry-After': '1'}
        if result is None:
            return '', 204
        return result

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
        settings = ensure_record_effect_bakes(get_connection, (context.scope_id or "global", *card))
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
        pending = []
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            context = resolve_context(conn, False)
            token = context.scope_id or "global"
            records = [{"target": dict(card_uuid=card[0], face=card[1]),
                        "record": record_json(read_summary(conn, (token, *card), pending), (token, *card))}
                       for card in cards]
        if pending:
            with closing(get_connection()) as conn, conn:
                store_summaries(conn, pending)
        return jsonify(ok=True, records=records, preferences={"disable_gloss_on_view":load_preferences(get_config())["disable_gloss_on_view"]}, image_scope=dict(token=token, is_isolated=context.is_isolated))

    conflict_message = "Spot foiling changed in another editor. Close and reopen this card to load the latest version."

    def saved_request(conn, key, operation_id, fingerprint, revision):
        if not operation_id:
            return False
        receipt = conn.execute('''SELECT fingerprint,revision FROM card_spot_foil_save_receipts
            WHERE scope_token=? AND card_uuid=? AND face=? AND operation_id=?''', (*key, operation_id)).fetchone()
        if receipt is None:
            return False
        if receipt['fingerprint'] != fingerprint:
            raise ValueError('This save identifier was already used for different changes.')
        if receipt['revision'] != revision:
            raise RuntimeError(conflict_message)
        return True

    @isolation_operation
    def commit_finish(key, payload, prepared, summary, operation_id, fingerprint):
        # Only the scope/revision check and atomic commit hold either write lock.
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            conn.execute('BEGIN IMMEDIATE')
            context = resolve_context(conn, True)
            if (context.scope_id or 'global') != key[0]:
                raise RuntimeError('The image library changed while saving. Reopen this card.')
            if not conn.execute('SELECT 1 FROM chaos_cards WHERE card_uuid=?', (key[1],)).fetchone():
                raise LookupError('This card printing is no longer available.')
            current = conn.execute('SELECT revision FROM card_spot_foil WHERE scope_token=? AND card_uuid=? AND face=?', key).fetchone()
            revision = current['revision'] if current else None
            if saved_request(conn, key, operation_id, fingerprint, revision):
                return read_record(conn, key), context
            if payload['revision'] != revision:
                raise RuntimeError(conflict_message)
            if prepared is None:
                conn.execute('DELETE FROM card_spot_foil WHERE scope_token=? AND card_uuid=? AND face=?', key)
            else:
                conn.execute('INSERT OR REPLACE INTO card_spot_foil VALUES (?,?,?,?,?,?)',
                    (*key, prepared['revision'], prepared['settings'], prepared['mask_png_base64']))
                conn.execute('INSERT OR REPLACE INTO card_spot_foil_summary VALUES (?,?,?,?,?)',
                    (*key, prepared['revision'], summary))
            if operation_id:
                conn.execute('INSERT INTO card_spot_foil_save_receipts VALUES (?,?,?,?,?,?,?)',
                    (*key, operation_id, fingerprint, prepared['revision'] if prepared else None, time.time()))
                conn.execute('DELETE FROM card_spot_foil_save_receipts WHERE created<? OR rowid NOT IN '
                    '(SELECT rowid FROM card_spot_foil_save_receipts ORDER BY created DESC LIMIT 512)', (time.time()-86400,))
        return prepared, context

    @app.route("/cards/spot-foil/<card_uuid>/<face>", methods=["GET", "PUT", "DELETE"])
    @api_errors
    def card_spot_foil(card_uuid, face):
        card = card_key(dict(card_uuid=card_uuid, face=face))
        settings = payload = None
        writing = request.method != 'GET'
        operation_id = request.headers.get('X-Studio-Save-ID', '') if writing else ''
        if operation_id and not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', operation_id):
            raise ValueError('Provide a valid save identifier.')
        fingerprint = ''
        if writing:
            if request.content_length and request.content_length > 200_500_000:
                return jsonify(ok=False, message="The card finish images are too large."), 413
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict) or 'revision' not in payload:
                raise ValueError('Reload the saved card before editing.')
            if request.args.get('expected_scope') is None:
                raise ValueError('Reload the image library before saving.')
            if operation_id:
                fingerprint = hashlib.sha256(request.method.encode()+request.get_data()).hexdigest()
        with closing(get_connection()) as conn, conn:
            ensure_schema(conn)
            conn.execute('BEGIN')
            context = resolve_context(conn, False)
            token = context.scope_id or 'global'
            key = (token, *card)
            if writing and request.args['expected_scope'] != token:
                raise RuntimeError('The image library changed. Reopen this card before saving.')
            if not conn.execute('SELECT 1 FROM chaos_cards WHERE card_uuid=?', (card_uuid,)).fetchone():
                raise LookupError('This card printing is no longer available.')
            row = read_record(conn, key)
            repeated = writing and saved_request(conn, key, operation_id, fingerprint, row['revision'] if row else None)
        if writing and not repeated:
            if payload['revision'] != (row['revision'] if row else None):
                raise RuntimeError(conflict_message)
            previous = json.loads(row['settings']) if row else {}
            mask = row['mask_png_base64'] if row else ''
            if request.method == 'PUT':
                settings = validate_settings(payload)
                mask = base64.b64encode(decode_mask(payload.get('mask_data'))).decode('ascii')
                for layer in ('edit', 'gloss', 'effect1', 'effect2'):
                    if layer not in payload and previous.get(layer):
                        settings[layer] = previous[layer]
                settings = prepare_effect_bakes(settings, previous)
            elif any(previous.get(layer) for layer in ('edit', 'gloss', 'effect1', 'effect2')) and not payload.get('all_layers'):
                settings = dict(previous, foil_enabled=False)
            prepared = dict(revision=uuid4().hex, settings=json.dumps(settings, allow_nan=False), mask_png_base64=mask) if settings is not None else None
            row, context = commit_finish(key, payload, prepared, summary_settings(settings) if settings is not None else None, operation_id, fingerprint)
        result = record_json(row, key)
        if request.method == 'PUT' and settings is not None:
            # Disposable view caches are optional: a cache error must never turn
            # a successful atomic save into a misleading save failure.
            if any(settings.get(layer) for layer in ("edit", "effect1", "effect2")):
                try:
                    if load_artwork or app.config.get("FINISHING_ARTWORK_LOADER"):
                        bake(card, context, settings)
                except Exception:
                    app.logger.warning("Could not bake finishing artwork; the next view will retry", exc_info=True)
        subject_detector = get_plugin_status("card-finishing-studio")
        return jsonify(ok=True, record=result, preferences=load_preferences(get_config()), workflows=WORKFLOWS,
                       output_formats=OUTPUTS, layer_types=LAYER_TYPES, effect_types=EFFECT_TYPES, ukiyo_types=UKIYO_TYPES, confetti_glitter_types=CONFETTI_GLITTER_TYPES, dragon_trails=DRAGON_TRAILS, dragon_color_effects=DRAGON_COLOR_EFFECTS,
                       shard_templates=SHARD_TEMPLATES, mirror_themes=MIRROR_THEMES,
                       mirror_shapes=MIRROR_SHAPES, mirror_layouts=MIRROR_LAYOUTS,
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
            detected = validate_generation({"text_regions": result.get("regions", []),"text_symbols":result.get("symbols",[])})
            return jsonify(ok=True, regions=detected['text_regions'],symbols=detected['text_symbols'])
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Text detection took too long. Retry with this card or use the selection tools.") from exc
        finally:
            _text_detection_lock.release()

    @app.route("/cards/spot-foil/<card_uuid>/<face>/detect-subject", methods=["POST"])
    @api_errors
    def card_spot_foil_detect_subject(card_uuid, face):
        card_key(dict(card_uuid=card_uuid, face=face))
        if not get_plugin_status("card-finishing-studio").get("ready"):
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
            result = run_plugin_json("card-finishing-studio", "detect_subject", payload, timeout=300)
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
        detector = get_plugin_status("card-finishing-studio")
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
            result = run_plugin_json("card-finishing-studio", "detect_frame", payload, timeout=480)
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
        if request.content_length and request.content_length > 71_000_000:
            return jsonify(ok=False, message="Preview mask is too large."), 413
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or set(payload) != {"effect", "mask_data"}:
            raise ValueError("Provide an effect and its mask.")
        def render():
            effect = validate_effect(payload['effect'])
            png = render_overlay(decode_mask(payload['mask_data']), effect, width=756)
            response = send_file(BytesIO(png), mimetype='image/png')
            response.cache_control.no_store = True
            return response
        return preview_work('effect', render)

    @app.route('/cards/spot-foil/<card_uuid>/<face>/mirror-layout',methods=['POST'])
    @api_errors
    def card_mirror_layout(card_uuid,face):
        card_key(dict(card_uuid=card_uuid,face=face))
        payload=request.get_json(silent=True)
        if not isinstance(payload,dict) or set(payload)-{'seed','origin'}!={'shape','layout','count'}:raise ValueError('Choose a mirror shape, layout and count.')
        return jsonify(ok=True,objects=list(layout_objects(**payload)))

    @app.route('/cards/spot-foil/<card_uuid>/<face>/mirror-surfaces',methods=['POST'])
    @api_errors
    def card_mirror_surfaces(card_uuid,face):
        card_key(dict(card_uuid=card_uuid,face=face))
        if request.content_length and request.content_length > 71_000_000:
            return jsonify(ok=False, message='Preview settings are too large.'), 413
        payload=request.get_json(silent=True)
        def render():
            effect=validate_effect(payload)
            if effect['finish']!='mirror_layers':raise ValueError('Choose Mirror Layers.')
            surfaces={}
            from .mirror_layers import has_strength_overrides
            for key,image in render_mirrors(effect['mirrors'],effect['color'],756,1056,surfaces_only=True,
                                           layer_strength=effect['strength'] if has_strength_overrides(effect['mirrors']) else None):
                output=BytesIO();image.save(output,format='PNG')
                surfaces[key]='data:image/png;base64,'+base64.b64encode(output.getvalue()).decode('ascii')
            return jsonify(ok=True,surfaces=surfaces)
        return preview_work('surfaces', render)

    @app.route('/cards/spot-foil/<card_uuid>/<face>/mirror-path',methods=['POST'])
    @api_errors
    def card_mirror_path(card_uuid,face):
        card_key(dict(card_uuid=card_uuid,face=face))
        if request.content_length and request.content_length>100_000:raise ValueError('Mirror path settings are too large.')
        payload=request.get_json(silent=True)
        if not isinstance(payload,dict) or set(payload)!={'mirrors','width'}:raise ValueError('Provide mirror objects and mask width.')
        width=payload['width']
        if type(width) is not int or not 756<=width<=3024:raise ValueError('Choose a mask width from 756 to 3024 pixels.')
        settings=validate_mirrors(payload['mirrors'])
        image=Image.new('RGBA',(width,round(width*1056/756)),'white');image.putalpha(mirror_selection(settings,*image.size))
        output=BytesIO();image.save(output,format='PNG');output.seek(0)
        return send_file(output,mimetype='image/png')

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
        elif finish == 'confetti_glitter':
            keys |= {'density','seed','particle_type','flip_horizontal','x','y'}
        elif finish == 'ukiyo_e':
            keys |= {'density','seed','ukiyo_type','sparse','flip_horizontal','x','y'}
        elif finish == 'dragon_strike':
            keys |= {'dragon_emblem','dragon_trail','x','y'}
        elif finish in PATH_EFFECTS or finish in PARTICLE_PATH_EFFECTS:
            keys |= {'density','seed'}
        elif finish != 'chocobo_tracks':
            raise ValueError('This effect does not have a copyable template path.')
        # Older clients omit the new track offsets; their default is centered.
        optional = {'x','y'} if finish == 'chocobo_tracks' or finish in PATH_EFFECTS else set()
        if finish == 'dragon_strike':
            optional.add('dragon_alignment')
        if set(payload)-optional != keys:
            raise ValueError('Provide valid template settings.')
        width = payload['width']
        if type(width) is not int or not MASK_SIZE[0] <= width <= MAX_MASK_SIZE[0]:
            raise ValueError('Choose a mask width from 756 to 3024 pixels.')
        height = round(width * MASK_SIZE[1] / MASK_SIZE[0])
        if finish == 'dragon_strike':
            effect=validate_effect(dict(finish=finish,strength=100,scale=payload['scale'],density=100,seed=0,
                rotation=payload['rotation'],position_x=payload['x'],position_y=payload['y'],
                dragon_emblem=payload['dragon_emblem'],dragon_trail=payload['dragon_trail'],dragon_alignment=payload.get('dragon_alignment','dragon')))
            alpha=dragon_selection(width,height,effect['scale'],effect['rotation'],effect['position_x'],effect['position_y'],effect['dragon_emblem'],effect['dragon_trail'],effect['dragon_alignment'])
        elif finish == 'confetti_glitter':
            effect=validate_effect(dict(finish=finish,strength=100,scale=payload['scale'],density=payload['density'],seed=payload['seed'],rotation=payload['rotation'],position_x=payload['x'],position_y=payload['y'],particle_type=payload['particle_type'],flip_horizontal=payload['flip_horizontal']))
            alpha=render_confetti_glitter(effect,width,height,selection=True)
        elif finish == 'ukiyo_e':
            effect=validate_effect(dict(finish=finish,strength=100,scale=payload['scale'],density=payload['density'],seed=payload['seed'],rotation=payload['rotation'],position_x=payload['x'],position_y=payload['y'],ukiyo_type=payload['ukiyo_type'],sparse=payload['sparse'],flip_horizontal=payload['flip_horizontal']))
            alpha=ukiyo_selection(effect,width,height)
        elif finish in PARTICLE_PATH_EFFECTS:
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
        value = ensure_record_effect_bakes(get_connection, (context.scope_id or "global", *card)).get(layer)
        if not value:
            raise LookupError("No effect saved for this layer.")
        path = cached_saved_overlay(value)
        response = send_file(path, mimetype="image/png", etag=path.stem)
        response.cache_control.no_cache = True
        return response

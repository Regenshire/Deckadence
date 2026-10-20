# *** BACKUP CONTENT - Export and Import Selected User Data ***
from contextlib import closing
import configparser
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
from uuid import uuid4

from export_selection import ExportSelection
from backup_system import _disk_path, _is_link, _quote, _safe_name, _write_json, CHUNK_SIZE

# Catalogue rows are dependencies, not an export of the base catalogue.
DEPENDENCIES = {"sets", "chaos_cards", "cards"}
SETTINGS = {"app_config", "selected_sets", "chaos_session_state"}
TABLES = (
    "alternate_image_scopes", "sets", "chaos_cards", "cards", "alternate_sources",
    "alternate_image_isolation", "card_spot_foil", "upscaled_images", "custom_draft_sets",
    "custom_draft_set_cards", "custom_draft_pack_slots", "chaos_pack_art",
    "chaos_booster_variants", "chaos_booster_variant_contents", "chaos_booster_sheets",
    "chaos_booster_sheet_cards", "chaos_campaigns", "chaos_players", "chaos_draft_games",
    "tracked_chaos_packs", "tracked_chaos_pack_cards", "tracked_chaos_pack_campaigns",
    "tracked_chaos_pack_openings", "chaos_pack_history", "card_history",
    "draft_test_sessions", "draft_test_players", "draft_test_pack_pool", "draft_test_packs",
    "draft_test_pack_cards", "draft_test_picks", "decks", "deck_cards",
    "deck_basic_land_printings", "deck_builder_layouts", "deck_external_sources",
    "app_config", "selected_sets", "chaos_session_state",
)
INTEGER_IDS = {
    "alternate_sources": "alternate_source_id", "alternate_image_isolation": "alternate_source_id",
    "upscaled_images": "upscaled_image_id", "custom_draft_set_cards": "custom_set_card_id",
    "custom_draft_pack_slots": "custom_pack_slot_id", "chaos_campaigns": "campaign_id",
    "chaos_players": "player_id", "chaos_draft_games": "draft_game_id",
    "tracked_chaos_packs": "tracked_pack_id", "tracked_chaos_pack_cards": "tracked_pack_card_id",
    "tracked_chaos_pack_campaigns": "tracked_pack_campaign_id", "tracked_chaos_pack_openings": "opening_id",
    "chaos_pack_history": "history_id", "card_history": "history_id",
    "draft_test_sessions": "draft_test_id", "draft_test_players": "draft_test_player_id",
    "draft_test_pack_pool": "draft_test_pack_pool_id", "draft_test_packs": "draft_test_pack_id",
    "draft_test_pack_cards": "draft_test_pack_card_id", "draft_test_picks": "draft_test_pick_id",
    "decks": "deck_id", "deck_cards": "deck_card_id", "deck_builder_layouts": "deck_builder_layout_id",
    "deck_basic_land_printings": "deck_basic_land_printing_id", "deck_external_sources": "deck_external_source_id",
}
REFERENCES = {field: table for table, field in INTEGER_IDS.items() if field not in {"alternate_source_id", "history_id"}}
REFERENCES.update(opened_by_player_id="chaos_players", campaign_player_id="chaos_players",
                  current_human_pack_id="draft_test_packs", original_alternate_source_id="alternate_sources")
SCOPE_FIELDS = {"image_scope_id", "alternate_image_scope_id", "source_image_scope_id", "scope_token"}
KINDS = {
    "alternate": "data/alternate_sources", "isolated": "data/alternate_sources/isolation", "upscale": "data/upscaled_scryfall",
    "deck_source": "data/deck_art_sources", "deck_generated": "data/deck_art_generated",
    "portrait": "data/campaign_player_portraits", "icon": "data/custom_set_icons",
    "card_back": "data/img/card_backs", "pack_art": "data/img/pack_art",
    "print": "print/templates", "cutting": "static/sil/Studio3",
}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".gif", ".bmp", ".svg"}
CUTTING_EXTENSIONS = {".studio3", ".svg", ".dxf", ".fcm", ".pdf", ".png"}
BASE_FOLDERS = ("data/image_cache", "data/chaos_image_cache", "data/chaos_temp_cache", "data/scryfall")


def _checked(path):
    """Reject links in the complete chain before resolving or opening a file."""
    path = Path(os.path.abspath(path))
    for current in [path, *path.parents]:
        if current.exists() and _is_link(current):
            raise ValueError(f"Linked assets are not supported: {current}")
    return path


def _hash(path):
    digest = hashlib.sha256()
    with _disk_path(path).open("rb") as handle:
        if path.suffix.lower() in {".ini", ".json", ".svg"}:
            for line in handle:
                digest.update(line.replace(b"\r\n", b"\n"))
        else:
            while chunk := handle.read(CHUNK_SIZE):
                digest.update(chunk)
    return digest.hexdigest()


def _json_value(value):
    if isinstance(value, str) and value.lstrip().startswith(("{", "[")):
        try:
            return json.loads(value), True
        except ValueError:
            pass
    return value, False


# *** EXPORT CONTENT - Collect Selected Records and Files ***
class UserContentExporter:
    def __init__(self, service, temporary, progress, selection=None):
        self.service, self.root, self.bundle = service, service.root, service.bundle
        self.temporary, self.progress = temporary, progress
        self.selection = selection or ExportSelection()
        self.assets, self.asset_info, self.by_path = {}, {}, {}
        self.warnings = {}
        self.card_ids, self.card_keys, self.set_codes = set(), set(), set()
        self.printing_keys, self.scryfall_ids = set(), set()
        self.custom_codes = set()
        self.defaults = {}
        self.default_cutting = {}
        baseline = self.bundle / "backup_defaults.json"
        if baseline.is_file():
            try:
                document = json.loads(baseline.read_text(encoding="utf-8"))
                self.defaults = document.get("files", {})
                self.default_cutting = document.get("cutting_templates", {})
            except (OSError, ValueError) as error:
                self.skip_asset(baseline, error)
        self.static = self.bundle / "static"

    def asset(self, path, kind, relative=None, style="absolute"):
        option = {"alternate": "modified_cards", "isolated": "modified_cards", "upscale": "modified_cards", "deck_source": "deck_art", "deck_generated": "deck_art", "icon": "custom_set_icons", "card_back": "card_backs", "print": "print_templates", "cutting": "cutting_templates", "portrait": "campaigns", "pack_art": "custom_sets"}[kind]
        if not self.selection.enabled(option) and not (kind == "pack_art" and self.selection.enabled("packs")):
            return None
        self.progress(stage="Selecting custom content", current_file=Path(path).name)
        try:
            path = _checked(path)
            if not path.is_file():
                raise FileNotFoundError("File is missing")
        except (OSError, ValueError) as error:
            self.skip_asset(path, error)
            return None
        key = (str(path).casefold(), kind)
        if key not in self.by_path:
            name = "assets/" + hashlib.sha256((str(path) + kind).encode()).hexdigest()[:24] + "/" + path.name
            _safe_name(name)
            self.by_path[key] = name
            self.assets[name] = path
            self.asset_info[name] = {"kind": kind, "relative": relative or path.name}
            if kind == "card_back":
                self.asset_info[name]["back_prefix"] = "builtin:" if self.static / "img/card_backs" in path.parents else "custom:"
        return {"$asset": self.by_path[key], "style": style}

    def skip_asset(self, path, error):
        self.warnings.setdefault(str(path), {"path": str(path), "reason": str(error)})

    def finalize(self, metadata, included):
        """Remove unavailable references, including those inside serialized JSON."""
        def clean(value):
            parsed, was_json = _json_value(value)
            if was_json:
                return json.dumps(clean(parsed), ensure_ascii=False)
            if isinstance(value, dict):
                if "$asset" in value and value["$asset"] not in included:
                    return None
                return {key: clean(item) for key, item in value.items()}
            if isinstance(value, list):
                return [clean(item) for item in value]
            return value

        records = self.temporary / "records.jsonl"
        replacement = records.with_suffix(".filtered")
        with records.open(encoding="utf-8") as reader, replacement.open("w", encoding="utf-8") as writer:
            for line in reader:
                record = clean(json.loads(line))
                # The upscaling schema requires a string; an empty path means
                # no usable upscale, allowing normal card artwork to be used.
                if record["table"] == "upscaled_images" and record["row"].get("output_image_path") is None:
                    record["row"]["output_image_path"] = ""
                writer.write(json.dumps(record, ensure_ascii=False) + "\n")
        os.replace(replacement, records)
        metadata["assets"] = {name: info for name, info in self.asset_info.items() if name in included}
        for info in metadata["assets"].values():
            if "references" in info:
                info["references"] = {value: name if name in included else None for value, name in info["references"].items()}
        metadata["cutting_templates"] = [entry for entry in metadata["cutting_templates"] if entry["asset"] in included]
        metadata["warnings"] = list(self.warnings.values())

    def _files(self, folder, recursive=False):
        try:
            _checked(folder)
            if recursive:
                for directory, folders, files in os.walk(folder, onerror=lambda error: self.skip_asset(error.filename, error)):
                    for child in folders[:]:
                        try:
                            _checked(Path(directory) / child)
                        except (OSError, ValueError) as error:
                            self.skip_asset(Path(directory) / child, error)
                            folders.remove(child)
                    for filename in files:
                        yield Path(directory) / filename
            else:
                yield from folder.iterdir()
        except (OSError, ValueError) as error:
            self.skip_asset(folder, error)

    def _base_image(self, path):
        return any(path == self.root / folder or self.root / folder in path.parents for folder in BASE_FOLDERS)

    def _encode(self, value, field="", table=""):
        parsed, was_json = _json_value(value)
        if was_json:
            return json.dumps(self._encode(parsed, field, table), ensure_ascii=False)
        if isinstance(value, dict):
            return {key: self._encode(item, key, table) for key, item in value.items()}
        if isinstance(value, list):
            return [self._encode(item, field, table) for item in value]
        if not isinstance(value, str) or not value:
            return value
        if field.endswith("card_uuid"):
            self.card_ids.add(value)
        elif field == "card_key":
            self.card_keys.add(value)
        elif field == "set_code":
            self.set_codes.add(value)
        if field in {"image_cache_path", "front_image_cache_path", "back_image_cache_path"}:
            return None
        if table == "sets" and field == "local_icon_svg_path" and getattr(self, "current_set_code", None) not in self.custom_codes:
            return None
        if field == "card_back_key" and getattr(self.selection, "scope", {}).get("kind") == "campaign":
            prefix, _, filename = value.partition(":")
            if prefix in {"custom", "builtin"} and filename and Path(filename).name == filename:
                folder = self.root / KINDS["card_back"] if prefix == "custom" else self.static / "img/card_backs"
                path = folder / filename
                if prefix == "custom" or self._is_custom_file(path, "static/img/card_backs/" + filename):
                    self.asset(path, "card_back", filename)
            return value
        if value.startswith(("http:", "https:", "builtin:", "custom:")):
            return value
        extension = Path(value).suffix.lower()
        if extension not in IMAGE_EXTENSIONS or not any(word in field for word in ("path", "file", "artwork", "icon")):
            return value
        kind = "isolated" if table == "alternate_image_isolation" else "alternate"
        style = "absolute" if os.path.isabs(value) else "runtime"
        base = self.root
        if table == "upscaled_images" and field in {"output_image_path", "fullbleed_image_path"}:
            kind, base, style = "upscale", self.root / KINDS["upscale"], "upscale"
        elif field in {"icon_svg_path", "local_icon_svg_path"}:
            kind, base, style = "icon", self.static, "static"
        elif "portrait" in field:
            kind = "portrait"
        elif "artwork" in field or table == "decks":
            kind = "deck_source"
        elif table == "chaos_pack_art":
            kind = "pack_art"
        path = Path(os.path.abspath(base / value.replace("\\", "/")))
        if kind == "icon" and not path.is_file() and not os.path.isabs(value):
            runtime_icon = self.root / "static" / value.replace("\\", "/")
            if runtime_icon.is_file():
                path = Path(os.path.abspath(runtime_icon))
        if self._base_image(path):
            return None
        if kind not in {"icon", "deck_source"} and (self.bundle / "static" in path.parents or self.bundle / "print" in path.parents):
            # No generic bundled artwork, frame images, icons or UI resources.
            return value
        return self.asset(path, kind, style=style)

    def _is_custom_file(self, path, relative):
        expected = self.defaults.get(relative)
        bundled = self.bundle / relative
        try:
            _checked(path)
            if expected:
                return _hash(path) != expected
            if self.root != self.bundle and bundled.is_file() and path != bundled:
                return _hash(path) != _hash(bundled)
            return True
        except (OSError, ValueError) as error:
            self.skip_asset(path, error)
            return False

    def _collect_directories(self):
        for kind in ("icon", "card_back", "pack_art", "deck_source", "deck_generated", "print"):
            if kind == "card_back" and getattr(self.selection, "scope", {}).get("kind") == "campaign":
                continue
            if not self.selection.enabled({"icon": "custom_set_icons", "card_back": "card_backs", "pack_art": "custom_sets", "deck_source": "deck_art", "deck_generated": "deck_art", "print": "print_templates"}[kind]):
                continue
            # Partial exports collect category-specific art from selected records.
            if kind in {"icon", "deck_source", "deck_generated", "pack_art"} and (not all(self.selection.enabled(key) for key in ("custom_sets", "decks", "packs")) or self.selection.entities):
                continue
            folder = self.root / KINDS[kind]
            if not folder.is_dir():
                continue
            for path in self._files(folder, recursive=True):
                allowed = IMAGE_EXTENSIONS | ({".ini"} if kind == "print" else set())
                if path.suffix.lower() in allowed and self._is_custom_file(path, path.relative_to(self.root).as_posix()):
                    self.asset(path, kind, path.relative_to(folder).as_posix())
        if self.root != self.bundle and self.selection.enabled("print_templates"):
            folder = self.bundle / KINDS["print"]
            for path in self._files(folder, recursive=True):
                if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS | {".ini"}:
                    relative = path.relative_to(folder).as_posix()
                    if not (self.root / KINDS["print"] / relative).is_file() and self._is_custom_file(path, KINDS["print"] + "/" + relative):
                        self.asset(path, "print", relative)
        # Custom templates can reference artwork outside the template directory.
        for name, path in list(self.assets.items()):
            if self.asset_info[name]["kind"] != "print" or path.suffix.lower() != ".ini":
                continue
            parser = configparser.ConfigParser(interpolation=None)
            try:
                with _disk_path(path).open(encoding="utf-8-sig") as handle:
                    parser.read_file(handle)
            except (OSError, UnicodeError, configparser.Error) as error:
                self.skip_asset(path, error)
                del self.assets[name]
                del self.asset_info[name]
                continue
            references = {}
            for section in parser.sections():
                for field, value in parser.items(section):
                    if Path(value).suffix.lower() not in IMAGE_EXTENSIONS or not value or value.startswith(("http:", "https:")):
                        continue
                    candidate = Path(os.path.abspath(path.parent / value))
                    prefix = next((base for base in (self.root, self.bundle) if base in candidate.parents), None)
                    if candidate.is_file() and prefix and not self._is_custom_file(candidate, candidate.relative_to(prefix).as_posix()):
                        if str(candidate) in self.warnings:
                            references[value] = None
                        continue
                    relative = "assets/" + hashlib.sha256(str(candidate).encode()).hexdigest()[:12] + "/" + candidate.name
                    token = self.asset(candidate, "print", relative)
                    references[value] = token["$asset"] if token else None
            self.asset_info[name]["references"] = references
        cutting_entries = []
        manifest = self.root / "static/sil/Studio3/templates.json"
        if not manifest.is_file():
            manifest = self.static / "sil/Studio3/templates.json"
        registered = {}
        if manifest.is_file():
            try:
                registered = {item["filename"]: item for item in json.loads(manifest.read_text(encoding="utf-8")).get("templates", [])}
            except (OSError, ValueError) as error:
                self.skip_asset(manifest, error)
        for directory in dict.fromkeys((self.static / "sil", self.static / "sil/Studio3", self.root / "static/sil/Studio3")) if self.selection.enabled("cutting_templates") else ():
            if not directory.is_dir():
                continue
            for path in self._files(directory):
                if path.is_file() and path.suffix.lower() in CUTTING_EXTENSIONS:
                    relative = "static/sil/" + ("Studio3/" if directory.name == "Studio3" else "") + path.name
                    modified_registration = path.name in registered and registered[path.name] != self.default_cutting.get(path.name)
                    if self._is_custom_file(path, relative) or modified_registration:
                        token = self.asset(path, "cutting")
                        if token and path.suffix.lower() in {".studio3", ".svg", ".dxf", ".fcm"}:
                            cutting_entries.append({**registered.get(path.name, {"filename": path.name, "name": path.stem}), "asset": token["$asset"]})
        # Modified bundled backs become custom backs on import.
        for path in self._files(self.static / "img/card_backs") if self.selection.enabled("card_backs") and getattr(self.selection, "scope", {}).get("kind") != "campaign" and (self.static / "img/card_backs").is_dir() else ():
            if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS:
                relative = "static/img/card_backs/" + path.name
                if self._is_custom_file(path, relative):
                    self.asset(path, "card_back", path.name)
        return cutting_entries

    def collect(self):
        self.progress(stage="Selecting custom content", completed_bytes=0, total_bytes=0)
        cutting = self._collect_directories()
        schemas, counts = {}, {}
        with closing(sqlite3.connect((self.root / "cards.db").as_uri() + "?mode=ro", uri=True)) as connection:
            connection.row_factory = sqlite3.Row
            connection.execute("BEGIN")
            existing = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            self.selection.prepare(connection, existing, TABLES, INTEGER_IDS, REFERENCES, self.progress)
            if self.selection.enabled("deck_art"):
                for deck_id in self.selection.ids["deck_id"]:
                    path = self.root / KINDS["deck_generated"] / f"deck_art_{deck_id}.png"
                    if path.is_file():
                        token = self.asset(path, "deck_generated")
                        if token:
                            self.asset_info[token["$asset"]]["deck_id"] = deck_id
            if "custom_draft_sets" in existing and self.selection.enabled("custom_sets"):
                self.custom_codes = self.selection.ids["set_code"]
            with (self.temporary / "records.jsonl").open("w", encoding="utf-8") as writer:
                # Discover dependencies while streaming user rows, then export only those catalogue rows.
                for table in (*[name for name in TABLES if name not in DEPENDENCIES], "chaos_cards", "cards", "sets"):
                    if table not in existing or table not in DEPENDENCIES and not self.selection.includes_table(table):
                        continue
                    schemas[table] = [row["name"] for row in connection.execute("PRAGMA table_info(" + _quote(table) + ")")]
                    query = "SELECT * FROM " + _quote(table)
                    if table in DEPENDENCIES:
                        def references(name, values):
                            connection.execute("CREATE TEMP TABLE " + name + "(identity TEXT PRIMARY KEY)")
                            connection.executemany("INSERT INTO " + name + " VALUES (?)", ((value,) for value in values))
                            return "SELECT identity FROM " + name
                        if table == "chaos_cards":
                            ids = references("backup_card_ids", self.card_ids)
                            scryfall = references("backup_scryfall_ids", self.scryfall_ids)
                            connection.execute("CREATE TEMP TABLE backup_printings(set_code TEXT, collector_number TEXT)")
                            connection.executemany("INSERT INTO backup_printings VALUES (?,?)", self.printing_keys)
                            conditions = ["card_uuid IN (" + ids + ")"]
                            if "scryfall_id" in schemas[table]:
                                conditions.append("scryfall_id IN (" + scryfall + ")")
                            if "collector_number" in schemas[table]:
                                conditions.append("(set_code,collector_number) IN (SELECT set_code,collector_number FROM backup_printings)")
                            query += " WHERE " + " OR ".join(conditions)
                        elif table == "cards":
                            query += " WHERE card_key IN (" + references("backup_card_keys", self.card_keys) + ")"
                        else:
                            query += " WHERE set_code IN (" + references("backup_set_codes", self.set_codes | self.custom_codes) + ")"
                    if table.startswith("chaos_booster_") or table == "chaos_pack_art":
                        if not self.custom_codes and table != "chaos_pack_art":
                            continue
                    for raw in connection.execute(query):
                        row = dict(raw)
                        if table not in DEPENDENCIES and not self.selection.allows(table, row):
                            continue
                        row = self.selection.clean(row, REFERENCES, SCOPE_FIELDS, table=table)
                        if table == "chaos_session_state" and str(row.get("state_key", "")).startswith("pending_"):
                            continue
                        if table.startswith("chaos_booster_") and row.get("set_code") not in self.custom_codes:
                            continue
                        if table == "chaos_pack_art" and row.get("set_code") not in self.custom_codes:
                            value = row.get("image_path") or ""
                            if not value or str(value).startswith(("http:", "https:")):
                                continue
                            path = Path(os.path.abspath(self.root / value))
                            if not path.is_file() or not self._is_custom_file(path, os.path.relpath(path, self.root).replace("\\", "/")):
                                continue
                        if table in {"alternate_sources", "alternate_image_isolation", "upscaled_images"}:
                            self.printing_keys.add((row.get("set_code"), row.get("collector_number")))
                            if row.get("scryfall_id"):
                                self.scryfall_ids.add(row["scryfall_id"])
                        if table == "chaos_cards" and row.get("card_uuid") not in self.card_ids and (row.get("set_code"), row.get("collector_number")) not in self.printing_keys and row.get("scryfall_id") not in self.scryfall_ids:
                            continue
                        if table == "cards" and row.get("card_key") not in self.card_keys:
                            continue
                        if table == "sets" and row.get("set_code") not in self.set_codes | self.custom_codes:
                            continue
                        self.current_set_code = row.get("set_code")
                        row = {key: self._encode(value, key, table) for key, value in row.items()}
                        writer.write(json.dumps({"table": table, "row": row}, ensure_ascii=False) + "\n")
                        counts[table] = counts.get(table, 0) + 1
                        if counts[table] % 250 == 0:
                            self.progress(stage="Selecting custom content", current_file=table, completed_files=len(self.assets))
                settings = self.root / "settings.json"
                if self.selection.enabled("config_settings") and settings.is_file():
                    try:
                        settings_row = self._encode(self.selection.clean(json.loads(settings.read_text(encoding="utf-8-sig")), REFERENCES, SCOPE_FIELDS))
                    except (OSError, ValueError) as error:
                        self.skip_asset(settings, error)
                    else:
                        writer.write(json.dumps({"table": "@settings", "row": settings_row}, ensure_ascii=False) + "\n")
                        counts["@settings"] = 1
        return {"schemas": schemas, "row_counts": counts, "assets": self.asset_info, "cutting_templates": cutting, "selection": self.selection.options, "entities": self.selection.entities, "scope": getattr(self.selection, "scope", None),
                "required_dependencies": {table: sorted(ids) for table, ids in self.selection.required.items() if not self.selection.enabled(self.selection.group(table))}}, self.assets


# *** IMPORT CONTENT - Restore Records and Match Related Data ***
class UserContentImporter:
    def __init__(self, service, temporary, metadata, progress):
        self.service, self.root, self.bundle = service, service.root, service.bundle
        self.temporary, self.metadata, self.progress = temporary, metadata, progress
        self.token = uuid4().hex
        self.maps, self.asset_paths, self.strings = {}, {}, {}
        self.icon_paths = {}
        self.deck_art_paths = {}
        self.static = self.bundle / "static"

    def _rows(self, table):
        for row in self.incoming.execute("SELECT payload FROM incoming WHERE table_name=? ORDER BY rowid", (table,)):
            yield json.loads(row[0])

    def _read_records(self):
        self.incoming = sqlite3.connect(self.temporary / "incoming.sqlite")
        self.incoming.execute("CREATE TABLE incoming(table_name TEXT, payload TEXT)")
        counts = {}
        with (self.temporary / "records.jsonl").open("r", encoding="utf-8") as handle:
            while line := handle.readline(16 * 1024 * 1024):
                if not line.endswith("\n"):
                    raise ValueError("A user-content record is too large or incomplete.")
                record = json.loads(line)
                table, row = record.get("table"), record.get("row")
                if table not in TABLES and table != "@settings" or not isinstance(row, dict):
                    raise ValueError("The archive contains an unsupported record.")
                if table != "@settings" and set(row) - set(self.metadata.get("schemas", {}).get(table, [])):
                    raise ValueError("The archive contains undeclared fields.")
                self.incoming.execute("INSERT INTO incoming VALUES (?,?)", (table, json.dumps(row)))
                counts[table] = counts.get(table, 0) + 1
        self.incoming.execute("CREATE INDEX incoming_table ON incoming(table_name)")
        self.incoming.commit()
        if counts != self.metadata.get("row_counts"):
            raise ValueError("The record inventory does not match the archive.")
        return counts

    def _map(self, table, value, required=True):
        if value is None or value == "" or value == "global":
            return value
        mapping = self.maps.get(table, {})
        if str(value) in mapping:
            return mapping[str(value)]
        if required:
            raise ValueError(f"Missing imported relationship: {table} / {value}")
        return value

    def _allocate(self, connection, counts):
        existing = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        for table in counts:
            if table == "@settings":
                continue
            if table not in existing:
                raise ValueError(f"This Deckadence installation does not support {table}. Update Deckadence before importing.")
            columns = {row[1] for row in connection.execute("PRAGMA table_info(" + _quote(table) + ")")}
            if set(self.metadata["schemas"][table]) - columns:
                raise ValueError(f"This installation lacks fields needed by {table}. Update Deckadence before importing.")
            field = INTEGER_IDS.get(table)
            if field:
                maximum = connection.execute("SELECT COALESCE(MAX(" + _quote(field) + "),0) FROM " + _quote(table)).fetchone()[0]
                if "sqlite_sequence" in existing:
                    sequence = connection.execute("SELECT seq FROM sqlite_sequence WHERE name=?", (table,)).fetchone()
                    maximum = max(maximum, sequence[0] if sequence else 0)
                mapping = {}
                for row in self._rows(table):
                    identity = str(row.get(field))
                    if identity in mapping or not isinstance(row.get(field), int) or isinstance(row.get(field), bool):
                        raise ValueError(f"Invalid or duplicate identity in {table}.")
                    maximum += 1
                    mapping[identity] = maximum
                self.maps[table] = mapping
        self.maps["alternate_image_scopes"] = {str(row["image_scope_id"]): uuid4().hex for row in self._rows("alternate_image_scopes")}
        codes = set()
        for table in ("sets", "custom_draft_sets"):
            if table in existing:
                codes.update(str(row[0]).casefold() for row in connection.execute("SELECT set_code FROM " + table))
        custom = {}
        for row in self._rows("custom_draft_sets"):
            source = row["set_code"]
            candidate = source
            suffix = 2
            while candidate.casefold() in codes:
                candidate = source.rstrip("^") + f"_IMP{suffix}^"
                suffix += 1
            codes.add(candidate.casefold())
            custom[str(source)] = candidate
        self.maps["custom_draft_sets"] = custom
        for table, field in (("chaos_campaigns", "campaign_name"), ("chaos_players", "player_name"), ("tracked_chaos_packs", "pack_tracking_code")):
            if not counts.get(table):
                continue
            used = {str(row[0]).casefold() for row in connection.execute("SELECT " + field + " FROM " + table)}
            for row in self._rows(table):
                source = row[field]
                candidate, number = source, 2
                while candidate.casefold() in used:
                    candidate = f"{source} (Imported {number})" if field != "pack_tracking_code" else f"{source}.IMP{number}"
                    number += 1
                used.add(candidate.casefold())
                self.strings[(field, str(row[INTEGER_IDS[table]]))] = candidate
                if field == "pack_tracking_code":
                    self.strings[source] = candidate

    def _transform(self, value, field="", table="", context=None):
        context = context or {}
        parsed, was_json = _json_value(value)
        if was_json:
            return json.dumps(self._transform(parsed, field, table, context), ensure_ascii=False)
        if isinstance(value, dict):
            if "$asset" in value:
                name = value["$asset"]
                if name not in self.asset_paths:
                    raise ValueError("A referenced custom asset is missing from the archive.")
                path = self.asset_paths[name]
                style = value.get("style")
                if style == "upscale":
                    return path.relative_to(self.root / KINDS["upscale"]).as_posix()
                if style == "runtime":
                    return path.relative_to(self.root).as_posix()
                if style == "static":
                    path = self.icon_paths.get(name, path)
                    if name in self.icon_paths:
                        return path.relative_to(self.root / "static").as_posix()
                    return os.path.relpath(path, self.static).replace("\\", "/")
                return str(path)
            return {key: self._transform(item, key, table, value) for key, item in value.items()}
        if isinstance(value, list):
            return [self._transform(item, field, table, context) for item in value]
        if value is None or value == "":
            return value
        if field in SCOPE_FIELDS:
            return self._map("alternate_image_scopes", value)
        if field.endswith("_ids") and field[:-1] in REFERENCES:
            return self._map(REFERENCES[field[:-1]], value)
        if field == "set_code":
            return self._map("custom_draft_sets", value, False)
        if field == "campaign_key" and value != "__none__":
            return str(self._map("chaos_campaigns", value))
        if field == "alternate_source_id":
            isolated = any(context.get(key) not in {None, "", "global"} for key in ("image_scope_id", "source_image_scope_id"))
            source = "alternate_image_isolation" if table == "alternate_image_isolation" or isolated else "alternate_sources"
            return self._map(source, value)
        if field in REFERENCES:
            if field == "original_alternate_source_id":
                # Historical provenance may outlive a deleted global source.
                return self.maps.get("alternate_sources", {}).get(str(value))
            return self._map(REFERENCES[field], value)
        if field in {"source_id", "source_item_id"}:
            kind = context.get("source_type")
            target = {"draft_test": "draft_test_sessions", "draft_pick": "draft_test_sessions" if field == "source_id" else "draft_test_picks",
                      "tracked_pack": "tracked_chaos_packs", "chaos_pack": "tracked_chaos_packs"}.get(kind)
            if target:
                return self._map(target, value)
        if isinstance(value, str):
            if value in self.strings:
                return self.strings[value]
            source_root = str(self.metadata.get("source_root", "")).replace("\\", "/").rstrip("/")
            normalized = value.replace("\\", "/")
            if source_root and normalized.casefold().startswith(source_root.casefold() + "/"):
                return str(self.root / normalized[len(source_root) + 1:])
        return value

    def _plan_assets(self):
        assets = self.metadata.get("assets", {})
        actual = {path.relative_to(self.temporary).as_posix() for path in (self.temporary / "assets").rglob("*") if path.is_file()}
        if actual != set(assets):
            raise ValueError("The custom asset inventory does not match the archive.")
        planned = set()
        for name, info in assets.items():
            _safe_name(name)
            kind = info.get("kind")
            relative = str(_safe_name(info.get("relative")))
            if kind not in KINDS:
                raise ValueError("Unsupported custom asset category.")
            extension = Path(relative).suffix.lower()
            allowed = CUTTING_EXTENSIONS if kind == "cutting" else IMAGE_EXTENSIONS | ({".ini"} if kind == "print" else set())
            if extension not in allowed:
                raise ValueError("The archive contains a non-content asset.")
            folder = self.root / KINDS[kind]
            asset_key = hashlib.sha256(name.encode()).hexdigest()[:16]
            if kind in {"card_back", "cutting", "print"}:
                # Flat filenames remain discoverable by template/card-back registries.
                original = Path(relative)
                discriminator = asset_key
                if kind == "card_back":
                    discriminator = hashlib.sha256((info.get("back_prefix", "custom:") + original.name).encode()).hexdigest()[:16]
                filename = original.stem + "_import_" + self.token + "_" + discriminator + original.suffix
                destination = folder / original.parent / filename
            else:
                destination = folder / "imports" / self.token / asset_key / relative
            _checked(destination)
            if destination.exists() or str(destination).casefold() in planned:
                raise ValueError("An import asset filename unexpectedly exists. Retry the import.")
            planned.add(str(destination).casefold())
            self.asset_paths[name] = destination
            if kind == "deck_generated" and "deck_id" in info:
                if type(info["deck_id"]) is not int:
                    raise ValueError("Invalid deck artwork identity.")
                deck_id = self._map("decks", info["deck_id"])
                self.deck_art_paths[name] = self.root / KINDS["deck_generated"] / f"deck_art_{deck_id}.png"
            if kind == "icon":
                mirror = self.root / "static/img/set_icons" / ("import_" + self.token) / asset_key / destination.name
                _checked(mirror)
                self.icon_paths[name] = mirror
            if kind == "cutting":
                self.strings[Path(relative).name] = destination.name
            if kind == "card_back" and "/" not in relative:
                self.strings[info.get("back_prefix", "custom:") + Path(relative).name] = "custom:" + destination.name

    def _install_assets(self):
        for index, (name, destination) in enumerate(self.asset_paths.items()):
            destination.parent.mkdir(parents=True, exist_ok=True)
            source = self.temporary.joinpath(*_safe_name(name).parts)
            os.replace(_disk_path(source), _disk_path(destination))
            for mirror in (self.icon_paths.get(name), self.deck_art_paths.get(name)):
                if mirror is not None:
                    mirror.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(_disk_path(destination), _disk_path(mirror))
            self.progress(stage="Installing custom assets", completed_files=index + 1,
                          completed_bytes=index + 1, total_bytes=len(self.asset_paths), progress_unit="files", current_file=destination.name)
        # Remap template IDs as well as filenames and registration backgrounds.
        template_ids = set()
        for name, destination in self.asset_paths.items():
            if self.metadata["assets"][name]["kind"] != "print" or destination.suffix.lower() != ".ini":
                continue
            parser = configparser.ConfigParser(interpolation=None)
            parser.read(destination, encoding="utf-8-sig")
            old = parser.get("Template", "Template_ID").strip().lower()
            if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", old):
                raise ValueError("Invalid custom print Template_ID.")
            if old in template_ids:
                raise ValueError(f"Custom print templates have duplicate Template_ID: {old}")
            template_ids.add(old)
            new = old + "_import_" + self.token[:8]
            self.strings[old] = new
            parser.set("Template", "Template_ID", new)
            for section in parser.sections():
                for field, value in parser.items(section):
                    references = self.metadata["assets"][name].get("references", {})
                    reference = references.get(value)
                    if value in references and reference is None:
                        parser.set(section, field, "")
                        continue
                    if reference:
                        if reference not in self.asset_paths:
                            raise ValueError("A print-template asset is missing from the archive.")
                        parser.set(section, field, os.path.relpath(self.asset_paths[reference], destination.parent).replace("\\", "/"))
                        continue
                    for asset, info in self.metadata["assets"].items():
                        if info["kind"] == "print" and info["relative"] == value.replace("\\", "/"):
                            parser.set(section, field, os.path.relpath(self.asset_paths[asset], destination.parent).replace("\\", "/"))
            # Preserve user comments and formatting; change only portable identifiers/paths.
            section = ""
            lines = []
            for line in destination.read_text(encoding="utf-8-sig").splitlines(keepends=True):
                header = re.match(r"^\s*\[([^]]+)\]", line)
                if header:
                    section = header[1]
                match = re.match(r"^(\s*[^#;\s][^=]*?)(\s*=\s*)(.*?)(\n)?$", line)
                if match and parser.has_option(section, match[1].strip()):
                    desired = parser.get(section, match[1].strip())
                    if desired != match[3].strip():
                        line = match[1] + match[2] + desired + (match[4] or "")
                lines.append(line)
            destination.write_text("".join(lines), encoding="utf-8")

    def _replace_json(self, path, value):
        _checked(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        _write_json(path, value)

    def _cutting_manifest(self):
        entries = self.metadata.get("cutting_templates", [])
        if not entries:
            return
        path = self.root / "static/sil/Studio3/templates.json"
        original = path if path.is_file() else self.static / "sil/Studio3/templates.json"
        document = json.loads(original.read_text(encoding="utf-8")) if original.is_file() else {"version": 1, "templates": []}
        for entry in entries:
            name = entry.get("asset")
            if name not in self.asset_paths or self.metadata["assets"][name]["kind"] != "cutting":
                raise ValueError("Invalid cutting template registration.")
            new = {key: self._transform(value, key) for key, value in entry.items() if key != "asset"}
            new["filename"] = self.asset_paths[name].name
            document.setdefault("templates", []).append(new)
        self._replace_json(path, document)

    def _import_rows(self, connection, counts):
        imported = 0
        connection.execute("PRAGMA defer_foreign_keys=ON")
        if "selected_sets" in self.metadata.get("schemas", {}):
            connection.execute("DELETE FROM selected_sets")
        if "chaos_session_state" in self.metadata.get("schemas", {}):
            connection.execute("DELETE FROM chaos_session_state WHERE substr(state_key,1,8)='pending_'")
        for table in TABLES:
            for source in self._rows(table):
                row = {key: self._transform(value, key, table, source) for key, value in source.items()}
                field = INTEGER_IDS.get(table)
                if field:
                    row[field] = self._map(table, source[field])
                for unique in ("campaign_name", "player_name", "pack_tracking_code"):
                    identity = str(source.get(field))
                    if (unique, identity) in self.strings and unique in row:
                        row[unique] = self.strings[(unique, identity)]
                # Selected entity settings are scalar strings, not normal FK columns.
                if table in {"app_config", "chaos_session_state"}:
                    key_column, value_column = ("config_key", "config_value") if table == "app_config" else ("state_key", "state_value")
                    key = source[key_column]
                    for needle, target in (("draft_game_id", "chaos_draft_games"), ("campaign_player_id", "chaos_players"), ("campaign_id", "chaos_campaigns"), ("deck_id", "decks")):
                        if key.endswith(needle) and source[value_column] not in {None, "", "None"}:
                            row[value_column] = str(self._map(target, source[value_column]))
                            break
                columns = list(row)
                operation = "INSERT"
                if table in DEPENDENCIES:
                    # Stable catalogue identities reuse destination rows; no base data is replaced.
                    operation = "INSERT OR IGNORE"
                sql = operation + " INTO " + _quote(table) + " (" + ",".join(map(_quote, columns)) + ") VALUES (" + ",".join("?" for _ in columns) + ")"
                if table in {"app_config", "chaos_session_state"}:
                    key, value = ("config_key", "config_value") if table == "app_config" else ("state_key", "state_value")
                    sql += " ON CONFLICT(" + _quote(key) + ") DO UPDATE SET " + _quote(value) + "=excluded." + _quote(value)
                elif table == "selected_sets":
                    sql += " ON CONFLICT(set_code) DO NOTHING"
                elif table == "card_spot_foil":
                    # Preserve established shared-library choices on merge.
                    # Imported isolated scopes have fresh IDs and cannot collide.
                    sql += " ON CONFLICT(scope_token,card_uuid,face) DO NOTHING"
                elif table == "chaos_pack_art":
                    # Custom pack art for an existing official set is an intentional user override.
                    sql += " ON CONFLICT(set_code,booster_name) DO UPDATE SET " + ",".join(_quote(key) + "=excluded." + _quote(key) for key in columns if key not in {"set_code", "booster_name"})
                connection.execute(sql, list(row.values()))
                imported += 1
                if imported % 100 == 0:
                    self.progress(stage="Merging user records", current_file=table, completed_bytes=imported,
                                  total_bytes=sum(counts.values()), progress_unit="records", completed_files=len(self.asset_paths))
        return imported

    def apply(self):
        connection = None
        try:
            counts = self._read_records()
            connection = sqlite3.connect(self.root / "cards.db", timeout=30)
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("BEGIN IMMEDIATE")
            self._allocate(connection, counts)
            self._plan_assets()
            connection.execute("CREATE TABLE IF NOT EXISTS _user_backup_imports(import_token TEXT PRIMARY KEY, imported_at_utc TEXT NOT NULL)")
            replacements = list(self.deck_art_paths.values())
            if self.metadata.get("cutting_templates"):
                replacements.append(self.root / "static/sil/Studio3/templates.json")
            if counts.get("@settings"):
                replacements.append(self.root / "settings.json")
            self.service.begin_import_journal(self.token, [*self.asset_paths.values(), *self.icon_paths.values()], replacements)
            self._install_assets()
            self._cutting_manifest()
            imported = self._import_rows(connection, counts)
            settings = list(self._rows("@settings"))
            if settings:
                if len(settings) != 1:
                    raise ValueError("Invalid runtime settings record.")
                path = self.root / "settings.json"
                current = json.loads(path.read_text(encoding="utf-8-sig")) if path.is_file() else {}
                current.update(self._transform(settings[0]))
                self._replace_json(path, current)
            connection.execute("INSERT INTO _user_backup_imports VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))", (self.token,))
            connection.commit()
            connection.close()
            connection = None
            self.service._recover_import()
            self.progress(stage="Complete", completed_bytes=imported, total_bytes=imported, progress_unit="records", completed_files=len(self.asset_paths))
            return {"imported_rows": imported, "extracted_files": len(self.asset_paths), "row_counts": counts,
                    "message": "User content imported into the existing database. Existing decks, packs and campaigns were preserved; imported settings were applied."}
        except Exception:
            if connection:
                connection.rollback()
                connection.close()
                connection = None
            self.service._recover_import()
            raise
        finally:
            if connection:
                connection.close()
            if hasattr(self, "incoming"):
                self.incoming.close()

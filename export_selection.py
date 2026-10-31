# *** EXPORT SELECTION - Select the Data to Include in a Backup ***
import json
import sqlite3


class ExportSelection:
    OPTIONS = (
        "custom_sets", "decks", "packs", "modified_cards", "deck_art", "custom_set_icons",
        "campaigns", "print_templates", "cutting_templates", "card_backs", "config_settings",
    )
    MODIFIED = {"custom_cards", "alternate_sources", "alternate_image_isolation", "upscaled_images", "alternate_image_scopes", "card_spot_foil"}
    CONFIG = {"app_config", "selected_sets", "chaos_session_state"}
    SETS = {"custom_draft_sets", "custom_draft_set_cards", "custom_draft_pack_slots", "chaos_pack_art"}
    PACKS = {"tracked_chaos_packs", "tracked_chaos_pack_cards", "tracked_chaos_pack_campaigns", "tracked_chaos_pack_openings"}
    IDENTIFIERS = {"deck_ids": ("decks", "deck_id"), "pack_ids": ("tracked_chaos_packs", "tracked_pack_id"), "set_codes": ("custom_draft_sets", "set_code")}

    def __init__(self, options=None, entities=None):
        options = {} if options is None else options
        entities = {} if entities is None else entities
        if not isinstance(options, dict) or set(options) - set(self.OPTIONS) or any(type(value) is not bool for value in options.values()):
            raise ValueError("Invalid export selections.")
        if not isinstance(entities, dict) or set(entities) - set(self.IDENTIFIERS):
            raise ValueError("Invalid export entity selection.")
        for key, values in entities.items():
            if not isinstance(values, list) or any(type(value) is not (str if key == "set_codes" else int) for value in values):
                raise ValueError("Invalid export entity identifiers.")
        self.options = {key: options.get(key, True) for key in self.OPTIONS}
        self.entities = entities
        self.ids, self.cards, self.card_keys, self.scopes, self.printings = {}, set(), set(), set(), set()
        self.identities = {}
        self.required = {}
        self.integer_ids = {}

    def enabled(self, name):
        return self.options[name]

    def group(self, table):
        if table in self.MODIFIED:
            return "modified_cards"
        if table in self.CONFIG:
            return "config_settings"
        if table in self.SETS or table.startswith("chaos_booster_"):
            return "custom_sets"
        if table in self.PACKS:
            return "packs"
        if table.startswith("deck"):
            return "decks"
        return "campaigns"

    # *** EXPORT CONTENT - Collect Selected Records and Related Cards ***
    def prepare(self, connection, existing, tables, integer_ids, references, progress):
        connection.row_factory = sqlite3.Row
        self.integer_ids = integer_ids
        self.ids, self.cards, self.card_keys, self.scopes, self.printings = {}, set(), set(), set(), set()
        self.identities, self.required, self.scryfall_ids = {}, {}, set()
        self.pack_codes = set()
        for key, (table, field) in self.IDENTIFIERS.items():
            selected = set()
            if table in existing and self.enabled({"deck_ids": "decks", "pack_ids": "packs", "set_codes": "custom_sets"}[key]):
                selected = {row[0] for row in connection.execute('SELECT "' + field + '" FROM "' + table + '"')}
                if key in self.entities:
                    selected.intersection_update(self.entities[key])
            self.ids[field] = selected
        if "tracked_chaos_packs" in existing:
            self.pack_codes = {row[1] for row in connection.execute("SELECT tracked_pack_id,set_code FROM tracked_chaos_packs") if row[0] in self.ids["tracked_pack_id"]}

        def discover(value, field=""):
            if isinstance(value, str) and value.lstrip().startswith(("{", "[")):
                try:
                    discover(json.loads(value), field)
                    return
                except ValueError:
                    pass
            if isinstance(value, dict):
                for key, item in value.items():
                    discover(item, key)
            elif isinstance(value, list):
                for item in value:
                    discover(item, field)
            elif value:
                if field.endswith("card_uuid") and collect_cards:
                    self.cards.add(value)
                elif field == "card_key" and collect_cards:
                    self.card_keys.add(value)
                elif field in {"image_scope_id", "alternate_image_scope_id", "source_image_scope_id"}:
                    self.scopes.add(value)

        for table in tables:
            progress(stage="Selecting custom content", current_file=table)
            collect_cards = self.group(table) in {"custom_sets", "decks", "packs", "campaigns"} and self.enabled(self.group(table))
            if table not in existing or not self.enabled(self.group(table)) or table in self.MODIFIED or table in {"sets", "cards", "chaos_cards"}:
                continue
            for raw in connection.execute('SELECT * FROM "' + table + '"'):
                row = dict(raw)
                if self.allows(table, row):
                    discover(row)
        if "chaos_cards" in existing:
            connection.execute("CREATE TEMP TABLE export_selected_cards(card_uuid TEXT PRIMARY KEY)")
            connection.executemany("INSERT INTO export_selected_cards VALUES (?)", ((value,) for value in self.cards))
            for row in connection.execute("SELECT * FROM chaos_cards WHERE card_uuid IN (SELECT card_uuid FROM export_selected_cards)"):
                self.printings.add((row["set_code"], row["collector_number"] if "collector_number" in row.keys() else None))
                if "scryfall_id" in row.keys() and row["scryfall_id"]:
                    self.scryfall_ids.add(row["scryfall_id"])
        if "alternate_image_scopes" in existing:
            self.scopes.intersection_update(row[0] for row in connection.execute("SELECT image_scope_id FROM alternate_image_scopes"))
        else:
            self.scopes.clear()
        # Required relationships (for example a draft-history pack pool) must
        # retain their minimal parent records even if that category is unchecked.
        changed = True
        while changed:
            changed = False
            for table in tables:
                if table not in existing or not self.includes_table(table) or table in {"sets", "cards", "chaos_cards"}:
                    continue
                progress(stage="Selecting required records", current_file=table)
                required_fields = {row["name"] for row in connection.execute('PRAGMA table_info("' + table + '")') if row["notnull"]}
                for raw in connection.execute('SELECT * FROM "' + table + '"'):
                    row = dict(raw)
                    if not self.allows(table, row):
                        continue
                    for field in required_fields:
                        target = references.get(field)
                        if target and target != table and row.get(field) is not None:
                            identities = self.required.setdefault(target, set())
                            if str(row[field]) not in identities:
                                identities.add(str(row[field]))
                                changed = True
        for table in tables:
            if table not in existing or not self.includes_table(table) or table in {"sets", "cards", "chaos_cards"}:
                continue
            progress(stage="Selecting custom content", current_file=table)
            field = integer_ids.get(table)
            if field:
                self.identities[table] = {str(row[field]) for row in connection.execute('SELECT * FROM "' + table + '"') if self.allows(table, dict(row))}

    def includes_table(self, table):
        return (table == "chaos_pack_art" and (self.enabled("custom_sets") or self.enabled("packs"))
                or table == "app_config" and self.enabled("card_backs") and not getattr(self, "scope", None)
                or self.enabled(self.group(table)) or bool(self.required.get(table))
                or table in self.PACKS and bool(self.required.get("tracked_chaos_packs")))

    # *** EXPORT FILTERS - Check Which Records to Include ***
    def allows(self, table, row):
        if table == "app_config" and row.get("config_key") == "card_back_library":
            return self.enabled("config_settings") or self.enabled("card_backs") and not getattr(self, "scope", None)
        if table == "custom_cards":
            # Original artwork is a catalogue dependency even when alternate
            # images are excluded from a deck/set/pack export.
            return (row.get("card_uuid") in self.cards or
                    self.enabled("modified_cards") and not self.entities and not getattr(self, "scope", None))
        if table == "chaos_pack_art":
            return (self.enabled("custom_sets") and row.get("set_code") in self.ids.get("set_code", set())
                    or self.enabled("packs") and ("pack_ids" not in self.entities or row.get("set_code") in self.pack_codes))
        primary = self.integer_ids.get(table)
        required = primary and str(row.get(primary)) in self.required.get(table, set())
        required_pack = table in self.PACKS and str(row.get("tracked_pack_id")) in self.required.get("tracked_chaos_packs", set())
        if not self.enabled(self.group(table)) and not required and not required_pack:
            return False
        if table == "alternate_image_scopes":
            return row.get("image_scope_id") in self.scopes
        if table in self.MODIFIED:
            scope = row.get("scope_token", row.get("image_scope_id", row.get("source_image_scope_id")))
            matches = (row.get("card_uuid") in self.cards or row.get("card_key") in self.card_keys
                       or row.get("scryfall_id") in self.scryfall_ids
                       or (row.get("set_code"), row.get("collector_number")) in self.printings)
            return matches and (not scope or scope == "global" or scope in self.scopes)
        for field, selected in self.ids.items():
            if field in row and (table.startswith("deck") and field == "deck_id" or table in self.PACKS and field == "tracked_pack_id" or self.group(table) == "custom_sets" and field == "set_code"):
                if row[field] not in selected and not required and not required_pack:
                    return False
        if table in {"tracked_chaos_pack_campaigns", "tracked_chaos_pack_openings"} and not self.enabled("campaigns"):
            return False
        return True

    def clean(self, value, references, scope_fields, field="", table="", context=None):
        context = context or {}
        if isinstance(value, str) and value.lstrip().startswith(("{", "[")):
            try:
                parsed = json.loads(value)
            except ValueError:
                pass
            else:
                return json.dumps(self.clean(parsed, references, scope_fields, field, table, context), ensure_ascii=False)
        if isinstance(value, dict):
            result = {key: self.clean(item, references, scope_fields, key, table, value) for key, item in value.items()}
            if value.get("source_type") in {"draft_test", "draft_pick", "tracked_pack", "chaos_pack"} and value.get("source_id") is not None and result.get("source_id") is None:
                result["source_type"] = "standalone"
            return result
        if isinstance(value, list):
            return [self.clean(item, references, scope_fields, field, table, context) for item in value]
        if value is None or value == "":
            return value
        if field in scope_fields:
            return value if (self.enabled("modified_cards") and value in self.scopes) or value == "global" else None
        target = references.get(field[:-1] if field.endswith("_ids") else field)
        if field == "campaign_key" and value != "__none__":
            target = "chaos_campaigns"
        if field == "alternate_source_id":
            target = "alternate_image_isolation" if table == "alternate_image_isolation" or any(context.get(key) not in {None, "", "global"} for key in ("image_scope_id", "source_image_scope_id")) else "alternate_sources"
        if field in {"source_id", "source_item_id"}:
            target = {"draft_test": "draft_test_sessions", "draft_pick": "draft_test_sessions" if field == "source_id" else "draft_test_picks", "tracked_pack": "tracked_chaos_packs", "chaos_pack": "tracked_chaos_packs"}.get(context.get("source_type"))
        if target and str(value) not in self.identities.get(target, set()):
            return None
        if field == "card_back_key" and not self.enabled("card_backs") and str(value).startswith("custom:"):
            return ""
        if field in {"config_value", "state_value"}:
            key = context.get("config_key", context.get("state_key", ""))
            for needle, target in (("draft_game_id", "chaos_draft_games"), ("campaign_player_id", "chaos_players"), ("campaign_id", "chaos_campaigns"), ("deck_id", "decks")):
                if key.endswith(needle) and str(value) not in self.identities.get(target, set()):
                    return ""
        if field in {"deck_art_json", "deck_artwork_path"} and not self.enabled("deck_art"):
            return None
        return value

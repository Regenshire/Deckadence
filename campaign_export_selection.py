# *** CAMPAIGN EXPORT - Select the Campaign Data to Export ***
import sqlite3

from export_selection import ExportSelection


class CampaignExportSelection(ExportSelection):
    # Setup the Campaign Export
    def __init__(self, campaign_id, options=None):
        if campaign_id is not None and (type(campaign_id) is not int or campaign_id <= 0):
            raise ValueError("Invalid campaign identifier.")
        options = dict(options or {})
        options.update(campaigns=True, config_settings=False, print_templates=False,
                       cutting_templates=False, card_backs=True)
        super().__init__(options, {"deck_ids": [], "pack_ids": [], "set_codes": []})
        self.campaign_id = campaign_id
        self.scope = {"kind": "campaign", "campaign_id": campaign_id}
        self.draft_ids = set()

    # Select the Campaign Decks, Packs, and Sets
    def prepare(self, connection, existing, tables, integer_ids, references, progress):
        connection.row_factory = sqlite3.Row

        def rows(table):
            return [dict(row) for row in connection.execute('SELECT * FROM "' + table + '"')] if table in existing else []

        def owned(row):
            return row.get("campaign_id") == self.campaign_id

        if self.campaign_id is not None and not any(
                row["campaign_id"] == self.campaign_id for row in rows("chaos_campaigns")):
            raise ValueError("The campaign was not found.")
        self.draft_ids = {row["draft_test_id"] for row in rows("draft_test_sessions") if owned(row)}
        decks = [row for row in rows("decks") if owned(row)]
        deck_ids = {row["deck_id"] for row in decks}
        campaign_key = str(self.campaign_id) if self.campaign_id is not None else "__none__"
        pack_ids = {row["tracked_pack_id"] for row in rows("tracked_chaos_pack_campaigns")
                    if row.get("campaign_key") == campaign_key}
        pack_ids.update(row["tracked_pack_id"] for row in rows("tracked_chaos_pack_openings") if owned(row))
        for table in ("draft_test_pack_pool", "draft_test_packs"):
            pack_ids.update(row["tracked_pack_id"] for row in rows(table)
                            if row["draft_test_id"] in self.draft_ids and row.get("tracked_pack_id"))
        deck_cards = [row for row in rows("deck_cards") if row["deck_id"] in deck_ids]
        for row in [*decks, *deck_cards]:
            if row.get("source_type") in {"tracked_pack", "chaos_pack"} and row.get("source_id"):
                pack_ids.add(row["source_id"])
        codes = {row["set_code"] for row in rows("tracked_chaos_packs") if row["tracked_pack_id"] in pack_ids}
        # A custom set's definition is a dependency only when this campaign uses it.
        card_ids = {row["card_uuid"] for row in deck_cards}
        for row in rows("custom_draft_set_cards"):
            if row.get("card_uuid") in card_ids:
                codes.add(row["set_code"])
        self.entities.update(deck_ids=sorted(deck_ids), pack_ids=sorted(pack_ids), set_codes=sorted(codes))
        super().prepare(connection, existing, tables, integer_ids, references, progress)

    # Check Which Records Belong in the Export
    def allows(self, table, row):
        if table == "chaos_campaigns":
            return self.campaign_id is not None and row.get("campaign_id") == self.campaign_id
        if table == "tracked_chaos_pack_campaigns":
            key = str(self.campaign_id) if self.campaign_id is not None else "__none__"
            if row.get("campaign_key") != key:
                return False
        if table in {"chaos_players", "chaos_draft_games", "draft_test_sessions",
                     "tracked_chaos_pack_campaigns", "tracked_chaos_pack_openings"}:
            if row.get("campaign_id") != self.campaign_id:
                return False
        if table.startswith("draft_test_") and row.get("draft_test_id") not in self.draft_ids:
            return False
        # These histories have no campaign ownership field; they are global.
        if table in {"chaos_pack_history", "card_history"}:
            return False
        return super().allows(table, row)


# *** CAMPAIGN IMPORT - Check the Campaign Backup File ***
def validate_campaign_archive(metadata, records_path):
    import json
    scope = metadata.get("scope") or {}
    if scope.get("kind") != "campaign":
        raise ValueError("Choose a campaign export. Full Deckadence backups belong in Backup Export / Import.")
    campaign_id = scope.get("campaign_id")
    CampaignExportSelection(campaign_id)  # Validate the identifier, including No Campaign.
    forbidden = ExportSelection.CONFIG | {"@settings", "chaos_pack_history", "card_history"}
    if forbidden.intersection(metadata.get("schemas", {})) or forbidden.intersection(metadata.get("row_counts", {})):
        raise ValueError("This archive includes application data outside the campaign.")
    card_backs = set()
    def collect_backs(value):
        if isinstance(value, dict):
            if isinstance(value.get("card_back_key"), str):
                card_backs.add(value["card_back_key"])
            for item in value.values():
                collect_backs(item)
        elif isinstance(value, list):
            for item in value:
                collect_backs(item)
        elif isinstance(value, str) and value.lstrip().startswith(("{", "[")):
            try:
                collect_backs(json.loads(value))
            except ValueError:
                pass
    with records_path.open(encoding="utf-8") as reader:
        for line in reader:
            record = json.loads(line)
            table, row = record["table"], record["row"]
            if table in forbidden:
                raise ValueError("This archive includes application data outside the campaign.")
            if "campaign_id" in row and row["campaign_id"] != campaign_id:
                raise ValueError("This archive includes another campaign.")
            collect_backs(row)
    # A referenced card back may also carry its matching 3 mm bleed master.
    allowed_back_assets = set(card_backs)
    for key in card_backs:
        prefix, separator, filename = key.partition(":")
        if separator and prefix in {"custom", "builtin"} and filename:
            parent, _, basename = filename.rpartition("/")
            allowed_back_assets.add(prefix + ":fullbleed/" + filename)
            allowed_back_assets.add(prefix + ":" + (parent + "/" if parent else "") + "fullbleed/" + basename)
    if metadata.get("cutting_templates") or any(
            asset.get("kind") in {"print", "cutting"}
            or (asset.get("kind") == "card_back" and
                asset.get("back_prefix", "custom:") + asset.get("relative", "") not in allowed_back_assets)
            for asset in metadata.get("assets", {}).values()):
        raise ValueError("This archive includes assets outside the campaign.")

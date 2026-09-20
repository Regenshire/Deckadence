import os
import shutil
import time
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from io import BytesIO
from contextlib import closing
from uuid import uuid4
import json

from paths import (
    ALTERNATE_SOURCE_DIR,
    CAMPAIGN_PLAYER_PORTRAIT_DIR,
    CUSTOM_SET_ICON_DIR,
    DECK_ART_GENERATED_DIR,
    DECK_ART_SOURCE_DIR,
    EXPORT_ROOT_DIR,
    RUNTIME_BASE_DIR,
    RUNTIME_CARD_BACK_DIR,
    RUNTIME_PACK_ART_DIR,
    RUNTIME_PRINT_TEMPLATE_DIR,
    get_static_dir,
)

from db.database import get_db_connection, isolation_operation, IsolationStorage


DECKADENCE_EXPORT_VERSION = "1"

EXPORT_KIND_PACKS = "packs"
EXPORT_KIND_CAMPAIGN = "campaign"
EXPORT_KIND_FULL = "full"

MANIFEST_FILENAME = "manifest.xml"
ARCHIVE_FILE_ROOT = "files"


PACK_TABLE_NAMES = {
    "tracked_chaos_packs",
    "tracked_chaos_pack_cards",
    "tracked_chaos_pack_openings",
    "tracked_chaos_pack_campaigns",
    "alternate_sources",
    "alternate_image_scopes",
    "alternate_image_isolation",
}

SETTINGS_TABLE_NAMES = {
    "app_config",
    "selected_sets",
}

# These are intentionally broad because campaign tables have evolved over time.
# The filtering below also checks actual table/column existence at runtime.
CAMPAIGN_TABLE_NAME_PREFIXES = (
    "chaos_campaign",
    "campaign_",
)

CAMPAIGN_TABLE_NAME_CONTAINS = (
    "draft_game",
    "campaign",
)

PLAYER_TABLE_NAMES = {
    "chaos_players",
}

HISTORY_TABLE_NAMES = {
    "chaos_pack_history",
    "card_history",
    "tracked_chaos_pack_openings",
}

FILE_FIELD_NAMES = {
    "local_image_path",
    "fullbleed_image_path",
    "portrait_image_path",
    "image_path",
}

CAMPAIGN_EXPORT_MODE_DATA_ONLY = "data_only"
CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES = "cards_and_images"

CAMPAIGN_IMAGE_TABLE_NAMES = {
    "alternate_sources",
    "alternate_image_scopes",
    "alternate_image_isolation",
}

PORTABLE_IMPORT_ID_FIELDS = {
    "alternate_sources": "alternate_source_id",
    "chaos_draft_games": "draft_game_id",
    "chaos_players": "player_id",
    "tracked_chaos_pack_cards": "tracked_pack_card_id",
    "tracked_chaos_pack_openings": "opening_id",
    "tracked_chaos_packs": "tracked_pack_id",
}

PORTABLE_IMPORT_TABLE_ORDER = {
    "alternate_image_scopes": 10,
    "alternate_sources": 20,
    "alternate_image_isolation": 30,
    "chaos_campaigns": 40,
    "chaos_players": 50,
    "chaos_draft_games": 60,
    "tracked_chaos_packs": 70,
    "tracked_chaos_pack_cards": 80,
    "tracked_chaos_pack_campaigns": 90,
    "tracked_chaos_pack_openings": 100,
}

FULL_BACKUP_ADDITIONAL_TABLE_NAMES = {
    "sets",
}

FULL_BACKUP_EXTRA_DIRECTORIES = (
    CUSTOM_SET_ICON_DIR,
    RUNTIME_CARD_BACK_DIR,
    RUNTIME_PACK_ART_DIR,
    DECK_ART_SOURCE_DIR,
    DECK_ART_GENERATED_DIR,
    RUNTIME_PRINT_TEMPLATE_DIR,
    os.path.join(
        get_static_dir(),
        "sil",
        "Studio3",
    ),
)


def utc_now_text():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def utc_timestamp_for_filename():
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def make_export_filename_safe(value):
    clean_value = str(value or "").strip()

    if not clean_value:
        return "imomir_export"

    safe_chars = []

    for char in clean_value:
        if char.isalnum() or char in ("-", "_", "."):
            safe_chars.append(char)
        else:
            safe_chars.append("_")

    safe_value = "".join(safe_chars).strip("_")

    return safe_value or "imomir_export"

def normalize_id_list(values):
    normalized_values = []

    for value in values or []:
        try:
            parsed_value = int(value)
        except (TypeError, ValueError):
            continue

        if parsed_value > 0 and parsed_value not in normalized_values:
            normalized_values.append(parsed_value)

    return normalized_values

def ensure_export_root():
    os.makedirs(EXPORT_ROOT_DIR, exist_ok=True)

def delete_from_table_if_exists(cursor, table_name):
    cursor.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
        """,
        (table_name,),
    )

    if not cursor.fetchone():
        return 0

    cursor.execute(f"SELECT COUNT(*) AS row_count FROM {table_name}")
    row = cursor.fetchone()
    row_count = int(row["row_count"] or 0)

    cursor.execute(f"DELETE FROM {table_name}")

    return row_count


def clear_all_history_data():
    conn = get_db_connection()
    cursor = conn.cursor()

    deleted_counts = {}

    try:
        for table_name in [
            "card_history",
            "chaos_pack_history",
            "tracked_chaos_pack_openings",
        ]:
            deleted_counts[table_name] = delete_from_table_if_exists(cursor, table_name)

        # Some newer campaign/history tables may exist depending on your current schema.
        for table_name in get_sqlite_table_names():
            clean_name = table_name.lower()

            if clean_name in deleted_counts:
                continue

            if "history" in clean_name or "opening" in clean_name:
                deleted_counts[table_name] = delete_from_table_if_exists(cursor, table_name)

        conn.commit()

    finally:
        conn.close()

    return {
        "deleted_counts": deleted_counts,
        "total_deleted": sum(deleted_counts.values()),
    }

@isolation_operation
def clear_all_packs_data():
    conn = get_db_connection()
    cursor = conn.cursor()

    deleted_counts = {}

    try:
        # Child/link tables first.
        for table_name in [
            "tracked_chaos_pack_campaigns",
            "tracked_chaos_pack_openings",
            "tracked_chaos_pack_cards",
            "tracked_chaos_packs",
        ]:
            deleted_counts[table_name] = delete_from_table_if_exists(cursor, table_name)

        conn.commit()

    finally:
        conn.close()

    return {
        "deleted_counts": deleted_counts,
        "total_deleted": sum(deleted_counts.values()),
    }

def clear_export_root():
    ensure_export_root()

    removed_count = 0

    for item_name in os.listdir(EXPORT_ROOT_DIR):
        item_path = os.path.join(EXPORT_ROOT_DIR, item_name)

        try:
            if os.path.isdir(item_path):
                shutil.rmtree(item_path)
                removed_count += 1
            elif os.path.isfile(item_path):
                os.remove(item_path)
                removed_count += 1
        except Exception:
            continue

    return {
        "removed_count": removed_count,
    }


def normalize_auto_clear_exports_days(value):
    clean_value = str(value or "7").strip().lower()

    if clean_value == "off":
        return None

    if clean_value not in {"1", "7", "30"}:
        clean_value = "7"

    return int(clean_value)


def auto_clear_export_root(auto_clear_exports_value):
    clear_days = normalize_auto_clear_exports_days(auto_clear_exports_value)

    if clear_days is None:
        return {
            "removed_count": 0,
            "enabled": False,
            "days": None,
        }

    ensure_export_root()

    cutoff_timestamp = time.time() - (clear_days * 24 * 60 * 60)
    removed_count = 0

    for item_name in os.listdir(EXPORT_ROOT_DIR):
        item_path = os.path.join(EXPORT_ROOT_DIR, item_name)

        try:
            item_mtime = os.path.getmtime(item_path)

            if item_mtime >= cutoff_timestamp:
                continue

            if os.path.isdir(item_path):
                shutil.rmtree(item_path)
                removed_count += 1
            elif os.path.isfile(item_path):
                os.remove(item_path)
                removed_count += 1
        except Exception:
            continue

    return {
        "removed_count": removed_count,
        "enabled": True,
        "days": clear_days,
    }

def get_sqlite_table_names():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    )

    table_names = [row["name"] for row in cursor.fetchall()]
    conn.close()

    return table_names


def table_exists(table_name):
    return table_name in set(get_sqlite_table_names())


def get_table_columns(table_name):
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(f"PRAGMA table_info({table_name})")

    columns = [
        row["name"]
        for row in cursor.fetchall()
    ]

    conn.close()

    return columns


def table_has_column(table_name, column_name):
    return column_name in set(get_table_columns(table_name))


def fetch_table_rows(table_name, where_clause="", params=None):
    params = params or []

    conn = get_db_connection()
    cursor = conn.cursor()

    sql = f"SELECT * FROM {table_name}"

    if where_clause:
        sql += f" WHERE {where_clause}"

    cursor.execute(sql, params)

    rows = [
        {
            column_name: row[column_name]
            for column_name in row.keys()
        }
        for row in cursor.fetchall()
    ]

    conn.close()

    return rows


def get_all_tracked_pack_ids():
    if not table_exists("tracked_chaos_packs"):
        return []

    rows = fetch_table_rows("tracked_chaos_packs")

    return normalize_id_list([
        row.get("tracked_pack_id")
        for row in rows
    ])

def get_tracked_pack_ids_for_campaign(campaign_id):
    campaign_id = int(campaign_id)

    if not table_exists("tracked_chaos_pack_campaigns"):
        return []

    membership_rows = fetch_table_rows(
        "tracked_chaos_pack_campaigns",
        where_clause="campaign_key = ?",
        params=[str(campaign_id)],
    )

    return normalize_id_list([
        row.get("tracked_pack_id")
        for row in membership_rows
    ])


def get_tracked_pack_ids_for_default_campaign():
    if not table_exists("tracked_chaos_pack_campaigns"):
        return []

    membership_rows = fetch_table_rows(
        "tracked_chaos_pack_campaigns",
        where_clause="campaign_key = '__none__'",
        params=[],
    )

    return normalize_id_list([
        row.get("tracked_pack_id")
        for row in membership_rows
    ])



def get_card_uuids_for_tracked_pack_ids(tracked_pack_ids):
    pack_ids = normalize_id_list(tracked_pack_ids)

    if not pack_ids:
        return []

    if not table_exists("tracked_chaos_pack_cards"):
        return []

    placeholders = ",".join(["?"] * len(pack_ids))

    rows = fetch_table_rows(
        "tracked_chaos_pack_cards",
        where_clause=f"tracked_pack_id IN ({placeholders})",
        params=pack_ids,
    )

    card_uuids = sorted({
        str(row.get("card_uuid") or "").strip()
        for row in rows
        if str(row.get("card_uuid") or "").strip()
    })

    return card_uuids


def get_existing_pack_backup_tables():
    existing_tables = set(get_sqlite_table_names())

    return sorted([
        table_name
        for table_name in PACK_TABLE_NAMES
        if table_name in existing_tables
    ])


def get_existing_settings_backup_tables():
    existing_tables = set(get_sqlite_table_names())

    return sorted([
        table_name
        for table_name in SETTINGS_TABLE_NAMES
        if table_name in existing_tables
    ])


def is_campaign_table_name(table_name):
    clean_name = (table_name or "").strip().lower()

    if clean_name in PLAYER_TABLE_NAMES:
        return True

    if any(clean_name.startswith(prefix) for prefix in CAMPAIGN_TABLE_NAME_PREFIXES):
        return True

    if any(fragment in clean_name for fragment in CAMPAIGN_TABLE_NAME_CONTAINS):
        return True

    return False


def get_existing_campaign_backup_tables():
    existing_tables = get_sqlite_table_names()

    return sorted([
        table_name
        for table_name in existing_tables
        if is_campaign_table_name(table_name)
    ])


def get_existing_full_backup_tables():
    excluded_tables = {
        # Large downloaded/generated reference tables should be refreshable,
        # not part of user backup payloads.
        "cards",
        "sets",
        "chaos_cards",
        "chaos_booster_variants",
        "chaos_booster_variant_contents",
        "chaos_booster_sheets",
        "chaos_booster_sheet_cards",
        "scryfall_default_cards",
        "card_prices",
        "import_metadata",
        "chaos_session_state",
        "upscaled_images",
        "upscaling_jobs",
        "upscaling_job_items",
        "_isolation_gc_queue",
        "_isolation_epochs",
    }

    return sorted([
        table_name
        for table_name in get_sqlite_table_names()
        if table_name not in excluded_tables
    ])


def get_rows_for_pack_table(table_name, tracked_pack_ids):
    pack_ids = normalize_id_list(tracked_pack_ids)

    if not pack_ids:
        return []

    if table_name in {"alternate_image_scopes", "alternate_image_isolation"}:
        placeholders = ",".join("?" for _ in pack_ids)

        return fetch_table_rows(
            table_name,
            where_clause=(
                "image_scope_id IN (SELECT alternate_image_scope_id "
                "FROM tracked_chaos_packs WHERE tracked_pack_id IN ("
                + placeholders + "))"
            ),
            params=pack_ids,
        )

    if table_name == "alternate_sources":
        card_uuids = get_card_uuids_for_tracked_pack_ids(pack_ids)

        if not card_uuids:
            return []

        placeholders = ",".join(["?"] * len(card_uuids))

        return fetch_table_rows(
            table_name,
            where_clause=f"card_uuid IN ({placeholders})",
            params=card_uuids,
        )

    if table_has_column(table_name, "tracked_pack_id"):
        placeholders = ",".join(["?"] * len(pack_ids))

        return fetch_table_rows(
            table_name,
            where_clause=f"tracked_pack_id IN ({placeholders})",
            params=pack_ids,
        )

    return fetch_table_rows(table_name)


def get_rows_for_campaign_table(table_name, campaign_id):
    campaign_id = int(campaign_id)

    if table_has_column(table_name, "campaign_id"):
        return fetch_table_rows(
            table_name,
            where_clause="campaign_id = ?",
            params=[campaign_id],
        )

    if table_name == "chaos_players":
        # Older schema may not scope players by campaign. Include players for campaign backup.
        return fetch_table_rows(table_name)

    return fetch_table_rows(table_name)

def get_rows_for_default_campaign_table(table_name):
    if table_has_column(table_name, "campaign_id"):
        return fetch_table_rows(
            table_name,
            where_clause="campaign_id IS NULL",
            params=[],
        )

    if table_name == "chaos_players":
        # Older schema may not scope players by campaign. Include players for No Campaign backup.
        return fetch_table_rows(table_name)

    return []

def normalize_campaign_export_mode(value):
    clean_value = str(value or "").strip().lower()

    if clean_value == CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES:
        return CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES

    return CAMPAIGN_EXPORT_MODE_DATA_ONLY


def parse_campaign_source_json(value):
    if isinstance(value, dict):
        return dict(value)

    raw_value = str(value or "").strip()

    if not raw_value:
        return None

    try:
        parsed_value = json.loads(raw_value)
    except (TypeError, ValueError):
        return None

    return (
        parsed_value
        if isinstance(parsed_value, dict)
        else None
    )


def normalize_campaign_source_json(
    value,
    *,
    strip_file_backed_data=False,
):
    parsed_source = parse_campaign_source_json(value)

    if parsed_source is None:
        return None

    if strip_file_backed_data:
        parsed_source = strip_campaign_file_backed_data(
            parsed_source
        )

    return json.dumps(
        parsed_source,
        ensure_ascii=False,
        separators=(",", ":"),
    )


def strip_campaign_file_backed_data(value):
    if isinstance(value, list):
        return [
            strip_campaign_file_backed_data(item)
            for item in value
        ]

    if not isinstance(value, dict):
        return value

    result = {}

    for key, item in value.items():
        if key in {
            "image_scope_id",
            "alternate_image_scope_id",
        }:
            result[key] = None
            continue

        if key in FILE_FIELD_NAMES:
            result[key] = None
            continue

        if key == "source_json":
            result[key] = normalize_campaign_source_json(
                item,
                strip_file_backed_data=True,
            )
            continue

        if isinstance(item, (list, dict)):
            result[key] = strip_campaign_file_backed_data(item)
        else:
            result[key] = item

    return result


def prepare_portable_export_rows(
    rows_by_table,
    export_mode,
):
    clean_export_mode = normalize_campaign_export_mode(
        export_mode
    )

    data_only = (
        clean_export_mode
        == CAMPAIGN_EXPORT_MODE_DATA_ONLY
    )

    prepared_rows_by_table = {}

    for table_name, table_rows in rows_by_table.items():
        if (
            data_only
            and table_name in CAMPAIGN_IMAGE_TABLE_NAMES
        ):
            continue

        prepared_rows = []

        for row in table_rows or []:
            prepared_row = (
                strip_campaign_file_backed_data(row)
                if data_only
                else dict(row)
            )

            if (
                not data_only
                and "source_json" in prepared_row
            ):
                prepared_row["source_json"] = (
                    normalize_campaign_source_json(
                        prepared_row.get("source_json")
                    )
                )

            prepared_rows.append(prepared_row)

        prepared_rows_by_table[
            table_name
        ] = prepared_rows

    return prepared_rows_by_table


def filter_pack_membership_rows(
    rows_by_table,
    *,
    campaign_id=None,
    enabled=False,
):
    if not enabled:
        return rows_by_table

    membership_rows = rows_by_table.get(
        "tracked_chaos_pack_campaigns",
        [],
    )

    opening_rows = rows_by_table.get(
        "tracked_chaos_pack_openings",
        [],
    )

    if campaign_id is None:
        rows_by_table["tracked_chaos_pack_campaigns"] = [
            row
            for row in membership_rows
            if str(
                row.get("campaign_key")
                or ""
            ).strip() == "__none__"
        ]

        rows_by_table["tracked_chaos_pack_openings"] = [
            row
            for row in opening_rows
            if row.get("campaign_id") in {None, ""}
        ]
    else:
        campaign_key = str(int(campaign_id))

        rows_by_table["tracked_chaos_pack_campaigns"] = [
            row
            for row in membership_rows
            if str(
                row.get("campaign_key")
                or ""
            ).strip() == campaign_key
        ]

        rows_by_table["tracked_chaos_pack_openings"] = [
            row
            for row in opening_rows
            if str(
                row.get("campaign_id")
                or ""
            ).strip() == campaign_key
        ]

    return rows_by_table


def build_pack_rows_by_table(
    tracked_pack_ids=None,
    include_image_dependencies=True,
    source_campaign_id=None,
    filter_campaign_membership=False,
):
    pack_ids = normalize_id_list(
        tracked_pack_ids or []
    )

    if not pack_ids:
        pack_ids = get_all_tracked_pack_ids()

    if not pack_ids:
        raise ValueError(
            "No packs were available to export."
        )

    rows_by_table = {}

    for table_name in get_existing_pack_backup_tables():
        rows_by_table[table_name] = (
            get_rows_for_pack_table(
                table_name,
                tracked_pack_ids=pack_ids,
            )
        )

    filter_pack_membership_rows(
        rows_by_table,
        campaign_id=source_campaign_id,
        enabled=filter_campaign_membership,
    )

    if include_image_dependencies:
        return include_isolated_archive_dependencies(
            rows_by_table
        )

    return rows_by_table


def build_campaign_rows_by_table(
    campaign_id,
    export_mode=CAMPAIGN_EXPORT_MODE_DATA_ONLY,
):
    campaign_id = int(campaign_id)
    clean_export_mode = normalize_campaign_export_mode(
        export_mode
    )

    rows_by_table = {}

    for table_name in get_existing_campaign_backup_tables():
        rows_by_table[table_name] = (
            get_rows_for_campaign_table(
                table_name,
                campaign_id=campaign_id,
            )
        )

    campaign_pack_ids = (
        get_tracked_pack_ids_for_campaign(
            campaign_id
        )
    )

    if campaign_pack_ids:
        pack_rows_by_table = build_pack_rows_by_table(
            campaign_pack_ids,
            include_image_dependencies=False,
            source_campaign_id=campaign_id,
            filter_campaign_membership=True,
        )

        for table_name, table_rows in (
            pack_rows_by_table.items()
        ):
            existing_rows = rows_by_table.get(
                table_name,
                [],
            )

            rows_by_table[table_name] = (
                merge_rows_by_identity(
                    existing_rows,
                    table_rows,
                )
            )

    if (
        clean_export_mode
        == CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES
    ):
        rows_by_table = (
            include_isolated_archive_dependencies(
                rows_by_table
            )
        )

    validate_portable_pack_integrity(
        rows_by_table,
        expected_pack_ids=campaign_pack_ids,
        require_membership=True,
    )

    return prepare_portable_export_rows(
        rows_by_table,
        clean_export_mode,
    )


def build_default_campaign_rows_by_table(
    export_mode=CAMPAIGN_EXPORT_MODE_DATA_ONLY,
):
    clean_export_mode = normalize_campaign_export_mode(
        export_mode
    )

    rows_by_table = {}

    for table_name in get_existing_campaign_backup_tables():
        rows_by_table[table_name] = (
            get_rows_for_default_campaign_table(
                table_name
            )
        )

    default_pack_ids = (
        get_tracked_pack_ids_for_default_campaign()
    )

    if default_pack_ids:
        pack_rows_by_table = build_pack_rows_by_table(
            default_pack_ids,
            include_image_dependencies=False,
            source_campaign_id=None,
            filter_campaign_membership=True,
        )

        for table_name, table_rows in (
            pack_rows_by_table.items()
        ):
            existing_rows = rows_by_table.get(
                table_name,
                [],
            )

            rows_by_table[table_name] = (
                merge_rows_by_identity(
                    existing_rows,
                    table_rows,
                )
            )

    if (
        clean_export_mode
        == CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES
    ):
        rows_by_table = (
            include_isolated_archive_dependencies(
                rows_by_table
            )
        )

    validate_portable_pack_integrity(
        rows_by_table,
        expected_pack_ids=default_pack_ids,
        require_membership=True,
    )

    return prepare_portable_export_rows(
        rows_by_table,
        clean_export_mode,
    )


def include_isolated_archive_dependencies(
    rows_by_table,
):
    scopes = set()

    for rows in rows_by_table.values():
        for row in rows:
            scope = (
                row.get("image_scope_id")
                or row.get(
                    "alternate_image_scope_id"
                )
            )

            if scope:
                scopes.add(scope)

            parsed_source = parse_campaign_source_json(
                row.get("source_json")
            )

            if not parsed_source:
                continue

            for card in (
                parsed_source.get("cards", [])
                or []
            ):
                if not isinstance(card, dict):
                    continue

                card_scope = card.get(
                    "image_scope_id"
                )

                if card_scope:
                    scopes.add(card_scope)

    with closing(get_db_connection()) as conn:
        for scope in scopes:
            row = conn.execute(
                "SELECT * "
                "FROM alternate_image_scopes "
                "WHERE image_scope_id = ?",
                (scope,),
            ).fetchone()

            if row is None:
                raise ValueError(
                    "An exported record references a "
                    "missing image scope. Repair or "
                    "regenerate that record first."
                )

            for table in (
                "alternate_image_scopes",
                "alternate_image_isolation",
            ):
                required = [
                    dict(item)
                    for item in conn.execute(
                        f"SELECT * FROM {table} "
                        "WHERE image_scope_id = ?",
                        (scope,),
                    )
                ]

                rows_by_table[table] = (
                    merge_rows_by_identity(
                        rows_by_table.get(
                            table,
                            [],
                        ),
                        required,
                    )
                )

    return rows_by_table


def build_full_rows_by_table():
    rows_by_table = {}

    for table_name in get_existing_full_backup_tables():
        rows_by_table[table_name] = fetch_table_rows(
            table_name
        )

    if (
        table_exists("sets")
        and table_exists("custom_draft_sets")
    ):
        rows_by_table["sets"] = fetch_table_rows(
            "sets",
            where_clause=(
                "set_code IN ("
                "SELECT set_code "
                "FROM custom_draft_sets"
                ")"
            ),
        )

    return include_isolated_archive_dependencies(
        rows_by_table
    )


def get_row_identity(row):
    if "image_scope_id" in row and (
        "alternate_source_id" in row or set(row).issubset({
            "image_scope_id", "revision", "created_at_utc", "updated_at_utc"
        })
    ):
        return ("image_scope", row["image_scope_id"], row.get("alternate_source_id"))
    # Used only to merge rows inside one export payload.
    # Keep simple and stable across schema changes.
    for key_name in (
        "tracked_pack_card_id",
        "opening_id",
        "tracked_pack_campaign_id",
        "alternate_source_id",
        "draft_game_id",
        "player_id",
        "tracked_pack_id",
        "campaign_id",
        "config_key",
        "set_code",
        "history_id",
    ):
        if key_name in row:
            return (key_name, row.get(key_name))

    return tuple(sorted(row.items()))


def merge_rows_by_identity(left_rows, right_rows):
    merged_lookup = {}

    for row in list(left_rows or []) + list(right_rows or []):
        merged_lookup[get_row_identity(row)] = row

    return list(merged_lookup.values())

def validate_portable_pack_integrity(
    rows_by_table,
    *,
    expected_pack_ids=None,
    require_membership=False,
):
    pack_rows = list(
        rows_by_table.get("tracked_chaos_packs", [])
        or []
    )

    pack_ids = []
    pack_by_id = {}

    for row in pack_rows:
        try:
            pack_id = int(row.get("tracked_pack_id"))
        except (TypeError, ValueError):
            raise ValueError(
                "Portable export contains an invalid saved-pack ID."
            )

        if pack_id in pack_by_id:
            raise ValueError(
                f"Portable export contains duplicate saved pack {pack_id}."
            )

        pack_ids.append(pack_id)
        pack_by_id[pack_id] = row

    pack_id_set = set(pack_ids)

    if expected_pack_ids is not None:
        expected_id_set = set(
            normalize_id_list(expected_pack_ids or [])
        )

        if pack_id_set != expected_id_set:
            raise ValueError(
                "Portable export pack membership changed while the "
                "archive was being built. Nothing was exported."
            )

    card_counts = {
        pack_id: 0
        for pack_id in pack_ids
    }

    for row in (
        rows_by_table.get(
            "tracked_chaos_pack_cards",
            [],
        )
        or []
    ):
        try:
            pack_id = int(
                row.get("tracked_pack_id")
            )
        except (TypeError, ValueError):
            raise ValueError(
                "Portable export contains a card with an invalid pack ID."
            )

        if pack_id not in pack_id_set:
            raise ValueError(
                "Portable export contains card data for a pack that "
                "is not part of the export."
            )

        card_counts[pack_id] += 1

    for pack_id, pack_row in pack_by_id.items():
        try:
            expected_card_count = int(
                pack_row.get("total_cards")
                or 0
            )
        except (TypeError, ValueError):
            expected_card_count = 0

        actual_card_count = card_counts.get(
            pack_id,
            0,
        )

        if expected_card_count != actual_card_count:
            tracking_code = str(
                pack_row.get("pack_tracking_code")
                or pack_id
            ).strip()

            raise ValueError(
                f"Pack {tracking_code} says it contains "
                f"{expected_card_count} card(s), but only "
                f"{actual_card_count} saved card row(s) were found. "
                "Nothing was exported or imported."
            )

    membership_ids = []

    for row in (
        rows_by_table.get(
            "tracked_chaos_pack_campaigns",
            [],
        )
        or []
    ):
        try:
            pack_id = int(
                row.get("tracked_pack_id")
            )
        except (TypeError, ValueError):
            raise ValueError(
                "Portable export contains an invalid campaign membership."
            )

        if pack_id not in pack_id_set:
            raise ValueError(
                "Portable export contains campaign membership for a "
                "pack that is not part of the export."
            )

        membership_ids.append(pack_id)

    if len(membership_ids) != len(
        set(membership_ids)
    ):
        raise ValueError(
            "Portable export contains duplicate campaign membership rows."
        )

    if (
        require_membership
        and set(membership_ids) != pack_id_set
    ):
        raise ValueError(
            "Portable campaign membership does not exactly match the "
            "saved packs in the archive."
        )

    for row in (
        rows_by_table.get(
            "tracked_chaos_pack_openings",
            [],
        )
        or []
    ):
        try:
            pack_id = int(
                row.get("tracked_pack_id")
            )
        except (TypeError, ValueError):
            raise ValueError(
                "Portable export contains invalid pack history."
            )

        if pack_id not in pack_id_set:
            raise ValueError(
                "Portable export contains history for a pack that is "
                "not part of the export."
            )

    return {
        "pack_count": len(pack_rows),
        "card_count": sum(
            card_counts.values()
        ),
    }




def add_xml_field(row_element, field_name, field_value):
    field_element = ET.SubElement(row_element, "field")
    field_element.set("name", str(field_name))

    if field_value is None:
        field_element.set("is_null", "1")
        field_element.text = ""
    else:
        field_element.set("is_null", "0")
        field_element.text = str(field_value)

    return field_element


def add_xml_table(tables_element, table_name, rows):
    table_element = ET.SubElement(tables_element, "table")
    table_element.set("name", table_name)
    table_element.set("row_count", str(len(rows or [])))

    for row in rows or []:
        row_element = ET.SubElement(table_element, "row")

        for field_name, field_value in row.items():
            add_xml_field(row_element, field_name, field_value)

    return table_element


def is_safe_relative_path(relative_path):
    clean_path = str(relative_path or "").replace("\\", "/").lstrip("/")

    if not clean_path:
        return False

    if ".." in clean_path.split("/"):
        return False

    return True


def resolve_runtime_relative_path(relative_path):
    clean_path = str(relative_path or "").replace("\\", "/").lstrip("/")

    if not is_safe_relative_path(clean_path):
        return ""

    absolute_path = os.path.abspath(os.path.join(RUNTIME_BASE_DIR, clean_path))
    runtime_base = os.path.abspath(RUNTIME_BASE_DIR)

    if not absolute_path.startswith(runtime_base):
        return ""

    return absolute_path

def normalize_export_file_relative_path(table_name, field_name, field_value):
    clean_value = str(field_value or "").strip()

    if not clean_value:
        return ""

    clean_value = clean_value.replace("\\", "/").lstrip("/")

    # Portrait fields may store only the filename. The actual file lives in
    # data/campaign_player_portraits.
    if field_name == "portrait_image_path":
        if "/" not in clean_value:
            return os.path.relpath(
                os.path.join(
                    CAMPAIGN_PLAYER_PORTRAIT_DIR,
                    clean_value,
                ),
                RUNTIME_BASE_DIR,
            ).replace("\\", "/")

    return clean_value

def add_file_payload(
    file_payloads,
    absolute_path,
):
    if not absolute_path:
        return

    absolute_path = os.path.abspath(
        absolute_path
    )

    if not os.path.isfile(absolute_path):
        return

    runtime_base = os.path.abspath(
        RUNTIME_BASE_DIR
    )

    try:
        common_path = os.path.commonpath([
            runtime_base,
            absolute_path,
        ])
    except ValueError:
        return

    if common_path != runtime_base:
        return

    relative_path = os.path.relpath(
        absolute_path,
        runtime_base,
    ).replace("\\", "/")

    if not is_safe_relative_path(
        relative_path
    ):
        return

    file_payloads[relative_path] = {
        "relative_path": relative_path,
        "absolute_path": absolute_path,
        "archive_path": (
            f"{ARCHIVE_FILE_ROOT}/"
            f"{relative_path}"
        ),
    }


def add_directory_file_payloads(
    file_payloads,
    directory_path,
):
    if (
        not directory_path
        or not os.path.isdir(directory_path)
    ):
        return

    for (
        root_path,
        directory_names,
        filenames,
    ) in os.walk(directory_path):
        directory_names.sort(
            key=str.casefold
        )

        for filename in sorted(
            filenames,
            key=str.casefold,
        ):
            add_file_payload(
                file_payloads,
                os.path.join(
                    root_path,
                    filename,
                ),
            )


def add_full_backup_extra_file_payloads(
    file_payloads,
    rows_by_table,
):
    for directory_path in (
        FULL_BACKUP_EXTRA_DIRECTORIES
    ):
        add_directory_file_payloads(
            file_payloads,
            directory_path,
        )

    static_root = get_static_dir()

    for row in rows_by_table.get(
        "custom_draft_sets",
        [],
    ):
        icon_relative_path = str(
            row.get("icon_svg_path")
            or ""
        ).replace(
            "\\",
            "/",
        ).lstrip("/")

        if (
            not icon_relative_path
            or not is_safe_relative_path(
                icon_relative_path
            )
        ):
            continue

        add_file_payload(
            file_payloads,
            os.path.join(
                static_root,
                icon_relative_path.replace(
                    "/",
                    os.sep,
                ),
            ),
        )


def collect_file_payloads(
    rows_by_table,
    export_kind=None,
):
    file_payloads = {}

    for (
        table_name,
        rows,
    ) in rows_by_table.items():
        for row in rows or []:
            for (
                field_name,
                field_value,
            ) in row.items():
                if (
                    field_name
                    not in FILE_FIELD_NAMES
                ):
                    continue

                relative_path = (
                    normalize_export_file_relative_path(
                        table_name=table_name,
                        field_name=field_name,
                        field_value=field_value,
                    )
                )

                if not relative_path:
                    continue

                if not is_safe_relative_path(
                    relative_path
                ):
                    continue

                absolute_path = (
                    resolve_runtime_relative_path(
                        relative_path
                    )
                )

                add_file_payload(
                    file_payloads,
                    absolute_path,
                )

    if export_kind == EXPORT_KIND_FULL:
        add_full_backup_extra_file_payloads(
            file_payloads,
            rows_by_table,
        )

    return list(
        file_payloads.values()
    )


def build_export_manifest(
    export_kind,
    rows_by_table,
    file_payloads=None,
    content_mode="",
):
    root = ET.Element("imomir_export")
    root.set("version", DECKADENCE_EXPORT_VERSION)
    root.set("kind", export_kind)
    root.set("created_at_utc", utc_now_text())

    if content_mode:
        root.set("content_mode", content_mode)

    tables_element = ET.SubElement(root, "tables")

    for table_name in sorted(rows_by_table.keys()):
        add_xml_table(
            tables_element,
            table_name=table_name,
            rows=rows_by_table[table_name],
        )

    files_element = ET.SubElement(root, "files")

    for file_payload in file_payloads or []:
        file_element = ET.SubElement(files_element, "file")
        file_element.set(
            "relative_path",
            file_payload["relative_path"],
        )
        file_element.set(
            "archive_path",
            file_payload["archive_path"],
        )

    return root


def write_manifest_to_bytes(root):
    buffer = BytesIO()
    tree = ET.ElementTree(root)
    ET.indent(tree, space="    ", level=0)
    tree.write(buffer, encoding="utf-8", xml_declaration=True)
    buffer.seek(0)

    return buffer.getvalue()


def create_export_archive(
    export_kind,
    rows_by_table,
    filename_prefix,
    auto_clear_exports_value=None,
    include_files=True,
    content_mode="",
):
    if auto_clear_exports_value is not None:
        auto_clear_export_root(auto_clear_exports_value)

    ensure_export_root()

    safe_prefix = make_export_filename_safe(filename_prefix)
    zip_filename = f"{safe_prefix}_{utc_timestamp_for_filename()}.zip"
    zip_path = os.path.join(
        EXPORT_ROOT_DIR,
        zip_filename,
    )

    file_payloads = (
        collect_file_payloads(
            rows_by_table,
            export_kind=export_kind,
        )
        if include_files
        else []
    )

    root = build_export_manifest(
        export_kind,
        rows_by_table,
        file_payloads=file_payloads,
        content_mode=content_mode,
    )
    manifest_bytes = write_manifest_to_bytes(root)

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr(MANIFEST_FILENAME, manifest_bytes)

        for file_payload in file_payloads:
            zip_file.write(
                file_payload["absolute_path"],
                file_payload["archive_path"],
            )

    return {
        "zip_path": zip_path,
        "zip_filename": zip_filename,
        "export_kind": export_kind,
        "table_count": len(rows_by_table),
        "file_count": len(file_payloads),
    }


@isolation_operation
def export_packs_archive(
    tracked_pack_ids=None,
    export_mode=CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES,
    auto_clear_exports_value=None,
    source_campaign_id=None,
    filter_campaign_membership=False,
):
    clean_export_mode = normalize_campaign_export_mode(
        export_mode
    )

    rows_by_table = build_pack_rows_by_table(
        tracked_pack_ids,
        include_image_dependencies=(
            clean_export_mode
            == CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES
        ),
        source_campaign_id=source_campaign_id,
        filter_campaign_membership=(
            filter_campaign_membership
        ),
    )

    rows_by_table.pop(
        "tracked_chaos_pack_openings",
        None,
    )

    validate_portable_pack_integrity(
        rows_by_table,
        expected_pack_ids=tracked_pack_ids,
        require_membership=filter_campaign_membership,
    )

    rows_by_table = prepare_portable_export_rows(
        rows_by_table,
        clean_export_mode,
    )

    return create_export_archive(
        export_kind=EXPORT_KIND_PACKS,
        rows_by_table=rows_by_table,
        filename_prefix="deckadence_packs_export",
        auto_clear_exports_value=(
            auto_clear_exports_value
        ),
        include_files=(
            clean_export_mode
            == CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES
        ),
        content_mode=clean_export_mode,
    )


@isolation_operation
def export_campaign_archive(
    campaign_id,
    export_mode=CAMPAIGN_EXPORT_MODE_DATA_ONLY,
    auto_clear_exports_value=None,
):
    clean_export_mode = normalize_campaign_export_mode(
        export_mode
    )

    rows_by_table = build_campaign_rows_by_table(
        campaign_id,
        export_mode=clean_export_mode,
    )

    if not any(rows_by_table.values()):
        raise ValueError(
            "No campaign data was available to export."
        )

    return create_export_archive(
        export_kind=EXPORT_KIND_CAMPAIGN,
        rows_by_table=rows_by_table,
        filename_prefix=(
            f"deckadence_campaign_{campaign_id}_export"
        ),
        auto_clear_exports_value=(
            auto_clear_exports_value
        ),
        include_files=(
            clean_export_mode
            == CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES
        ),
        content_mode=clean_export_mode,
    )


@isolation_operation
def export_default_campaign_archive(
    export_mode=CAMPAIGN_EXPORT_MODE_DATA_ONLY,
    auto_clear_exports_value=None,
):
    clean_export_mode = normalize_campaign_export_mode(
        export_mode
    )

    rows_by_table = build_default_campaign_rows_by_table(
        export_mode=clean_export_mode,
    )

    if not any(rows_by_table.values()):
        raise ValueError(
            "No default campaign data was available to export."
        )

    return create_export_archive(
        export_kind=EXPORT_KIND_CAMPAIGN,
        rows_by_table=rows_by_table,
        filename_prefix="deckadence_no_campaign_export",
        auto_clear_exports_value=(
            auto_clear_exports_value
        ),
        include_files=(
            clean_export_mode
            == CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES
        ),
        content_mode=clean_export_mode,
    )



@isolation_operation
def export_full_archive(auto_clear_exports_value=None):
    rows_by_table = build_full_rows_by_table()

    return create_export_archive(
        export_kind=EXPORT_KIND_FULL,
        rows_by_table=rows_by_table,
        filename_prefix="imomir_full_backup",
        auto_clear_exports_value=auto_clear_exports_value,
    )


def load_export_manifest_from_zip(zip_file):
    if MANIFEST_FILENAME not in zip_file.namelist():
        raise ValueError("Export archive does not contain manifest.xml.")

    manifest_bytes = zip_file.read(MANIFEST_FILENAME)
    root = ET.fromstring(manifest_bytes)

    if root.tag != "imomir_export":
        raise ValueError("XML manifest is not a Deckadence export file.")

    version = root.get("version") or ""

    if version != DECKADENCE_EXPORT_VERSION:
        raise ValueError(f"Unsupported Deckadence export version: {version}")

    return root

def get_archive_content_mode(root):
    explicit_mode = str(
        root.get("content_mode")
        or ""
    ).strip().lower()

    if explicit_mode:
        return normalize_campaign_export_mode(
            explicit_mode
        )

    return (
        CAMPAIGN_EXPORT_MODE_CARDS_AND_IMAGES
        if root.find("./files/file") is not None
        else CAMPAIGN_EXPORT_MODE_DATA_ONLY
    )



def get_tables_from_manifest(root):
    tables_element = root.find("tables")

    if tables_element is None:
        return {}

    rows_by_table = {}

    for table_element in tables_element.findall("table"):
        table_name = (table_element.get("name") or "").strip()

        if not table_name:
            continue

        table_rows = []

        for row_element in table_element.findall("row"):
            row_data = {}

            for field_element in row_element.findall("field"):
                field_name = (field_element.get("name") or "").strip()

                if not field_name:
                    continue

                if field_element.get("is_null") == "1":
                    row_data[field_name] = None
                else:
                    row_data[field_name] = field_element.text or ""

            if row_data:
                table_rows.append(row_data)

        rows_by_table[table_name] = table_rows

    return rows_by_table

def get_campaign_name_from_rows(rows_by_table):
    for table_name, table_rows in rows_by_table.items():
        if not table_name.startswith("chaos_campaign"):
            continue

        for row_data in table_rows:
            campaign_name = str(
                row_data.get("campaign_name")
                or ""
            ).strip()

            if campaign_name:
                return campaign_name

    return ""


def normalize_import_identity(value):
    if value in {None, ""}:
        return ""

    return str(value).strip()


def get_next_import_integer_ids(
    table_name,
    id_field,
    count,
):
    count = max(0, int(count or 0))

    if count <= 0:
        return []

    current_max = 0

    if table_exists(table_name):
        with closing(get_db_connection()) as conn:
            row = conn.execute(
                f"SELECT COALESCE(MAX({id_field}), 0) "
                f"FROM {table_name}"
            ).fetchone()

            current_max = (
                int(row[0] or 0)
                if row
                else 0
            )

    return list(
        range(
            current_max + 1,
            current_max + count + 1,
        )
    )


def build_portable_import_id_map(
    rows_by_table,
    table_name,
):
    id_field = PORTABLE_IMPORT_ID_FIELDS.get(
        table_name
    )

    if not id_field:
        return {}

    source_ids = []

    for row in (
        rows_by_table.get(table_name, [])
        or []
    ):
        source_id = normalize_import_identity(
            row.get(id_field)
        )

        if (
            source_id
            and source_id not in source_ids
        ):
            source_ids.append(source_id)

    new_ids = get_next_import_integer_ids(
        table_name,
        id_field,
        len(source_ids),
    )

    return dict(
        zip(source_ids, new_ids)
    )


def make_unique_import_campaign_name(
    campaign_name,
):
    clean_name = str(
        campaign_name
        or "Imported Campaign"
    ).strip()

    if not clean_name:
        clean_name = "Imported Campaign"

    with closing(get_db_connection()) as conn:
        existing_names = {
            str(row[0] or "")
            .strip()
            .casefold()
            for row in conn.execute(
                "SELECT campaign_name "
                "FROM chaos_campaigns"
            )
        }

    if clean_name.casefold() not in existing_names:
        return clean_name

    candidate = (
        f"{clean_name} (Imported)"
    )

    if candidate.casefold() not in existing_names:
        return candidate

    suffix = 2

    while True:
        candidate = (
            f"{clean_name} "
            f"(Imported {suffix})"
        )

        if (
            candidate.casefold()
            not in existing_names
        ):
            return candidate

        suffix += 1


def get_existing_pack_tracking_codes():
    if not table_exists(
        "tracked_chaos_packs"
    ):
        return set()

    with closing(get_db_connection()) as conn:
        return {
            str(row[0] or "")
            .strip()
            .upper()
            for row in conn.execute(
                "SELECT pack_tracking_code "
                "FROM tracked_chaos_packs"
            )
            if str(row[0] or "").strip()
        }


def make_unique_import_tracking_code(
    pack_tracking_code,
    reserved_codes,
):
    clean_code = str(
        pack_tracking_code
        or ""
    ).strip().upper()

    if (
        clean_code
        and clean_code not in reserved_codes
    ):
        reserved_codes.add(clean_code)
        return clean_code

    parts = [
        part
        for part in clean_code.split(".")
        if part
    ]

    if len(parts) >= 2:
        prefix = ".".join(parts[:2])
    elif parts:
        prefix = parts[0]
    else:
        prefix = "IMP.P"

    while True:
        candidate = (
            f"{prefix}."
            f"{uuid4().hex[:4].upper()}"
        )

        if candidate not in reserved_codes:
            reserved_codes.add(candidate)
            return candidate


def get_mapped_import_id(
    id_map,
    value,
):
    return id_map.get(
        normalize_import_identity(value)
    )


def remap_import_source_json(
    value,
    *,
    target_campaign_id,
    pack_id_map,
    player_id_map,
    draft_game_id_map,
    new_tracking_code,
):
    parsed_source = parse_campaign_source_json(
        value
    )

    if parsed_source is None:
        return None

    def remap(value_to_remap):
        if isinstance(value_to_remap, list):
            return [
                remap(item)
                for item in value_to_remap
            ]

        if not isinstance(
            value_to_remap,
            dict,
        ):
            return value_to_remap

        result = {}

        for key, item in (
            value_to_remap.items()
        ):
            if key == "campaign_id":
                result[key] = (
                    target_campaign_id
                )

            elif key == "tracked_pack_id":
                result[key] = (
                    get_mapped_import_id(
                        pack_id_map,
                        item,
                    )
                )

            elif key in {
                "player_id",
                "opened_by_player_id",
            }:
                result[key] = (
                    get_mapped_import_id(
                        player_id_map,
                        item,
                    )
                )

            elif key == "draft_game_id":
                result[key] = (
                    get_mapped_import_id(
                        draft_game_id_map,
                        item,
                    )
                )

            elif key == "pack_tracking_code":
                result[key] = (
                    new_tracking_code
                )

            else:
                result[key] = remap(item)

        return result

    return json.dumps(
        remap(parsed_source),
        ensure_ascii=False,
        separators=(",", ":"),
    )


def remap_portable_import_rows(
    rows_by_table,
    import_scope,
    *,
    campaign_name_override="",
    target_campaign_id=None,
):
    clean_scope = str(
        import_scope
        or ""
    ).strip().lower()

    if clean_scope not in {
        EXPORT_KIND_CAMPAIGN,
        EXPORT_KIND_PACKS,
    }:
        return rows_by_table, {}

    source_rows = {
        table_name: [
            dict(row)
            for row in table_rows or []
        ]
        for table_name, table_rows
        in rows_by_table.items()
    }

    import_metadata = {}
    campaign_id = None

    if clean_scope == EXPORT_KIND_CAMPAIGN:
        requested_name = (
            str(
                campaign_name_override
                or ""
            ).strip()
            or get_campaign_name_from_rows(
                source_rows
            )
            or "Imported Campaign"
        )

        campaign_name = (
            make_unique_import_campaign_name(
                requested_name
            )
        )

        campaign_id = (
            get_next_import_integer_ids(
                "chaos_campaigns",
                "campaign_id",
                1,
            )[0]
        )

        import_metadata.update({
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
        })

    elif target_campaign_id is not None:
        try:
            campaign_id = int(
                target_campaign_id
            )
        except (TypeError, ValueError):
            campaign_id = None

    id_maps = {
        table_name:
            build_portable_import_id_map(
                source_rows,
                table_name,
            )
        for table_name
        in PORTABLE_IMPORT_ID_FIELDS
    }

    pack_id_map = id_maps.get(
        "tracked_chaos_packs",
        {},
    )

    player_id_map = id_maps.get(
        "chaos_players",
        {},
    )

    draft_game_id_map = id_maps.get(
        "chaos_draft_games",
        {},
    )

    if (
        clean_scope == EXPORT_KIND_PACKS
        and not pack_id_map
    ):
        raise ValueError(
            "Import archive does not contain "
            "any saved packs."
        )

    reserved_tracking_codes = (
        get_existing_pack_tracking_codes()
    )

    tracking_codes = {}

    for row in source_rows.get(
        "tracked_chaos_packs",
        [],
    ) or []:
        source_pack_id = (
            normalize_import_identity(
                row.get("tracked_pack_id")
            )
        )

        if not source_pack_id:
            continue

        tracking_codes[source_pack_id] = (
            make_unique_import_tracking_code(
                row.get(
                    "pack_tracking_code"
                ),
                reserved_tracking_codes,
            )
        )

    membership_enabled = {}

    for row in source_rows.get(
        "tracked_chaos_pack_campaigns",
        [],
    ) or []:
        source_pack_id = (
            normalize_import_identity(
                row.get("tracked_pack_id")
            )
        )

        if (
            not source_pack_id
            or source_pack_id
            in membership_enabled
        ):
            continue

        try:
            membership_enabled[
                source_pack_id
            ] = (
                1
                if int(
                    row.get(
                        "campaign_enabled"
                    )
                    or 0
                )
                else 0
            )
        except (TypeError, ValueError):
            membership_enabled[
                source_pack_id
            ] = 1

    updated_rows = {}

    for table_name, table_rows in (
        source_rows.items()
    ):
        if table_name in {
            "chaos_campaigns",
            "tracked_chaos_pack_campaigns",
        }:
            continue

        table_id_field = (
            PORTABLE_IMPORT_ID_FIELDS.get(
                table_name
            )
        )

        table_id_map = id_maps.get(
            table_name,
            {},
        )

        remapped_rows = []

        for source_row in table_rows:
            row = dict(source_row)

            if table_id_field:
                source_id = (
                    normalize_import_identity(
                        source_row.get(
                            table_id_field
                        )
                    )
                )

                if source_id:
                    row[
                        table_id_field
                    ] = table_id_map[
                        source_id
                    ]

            if "campaign_id" in row:
                row["campaign_id"] = (
                    campaign_id
                )

            if (
                table_name
                == "tracked_chaos_packs"
            ):
                source_pack_id = (
                    normalize_import_identity(
                        source_row.get(
                            "tracked_pack_id"
                        )
                    )
                )

                new_tracking_code = (
                    tracking_codes[
                        source_pack_id
                    ]
                )

                row[
                    "pack_tracking_code"
                ] = new_tracking_code

                row["source_json"] = (
                    remap_import_source_json(
                        source_row.get(
                            "source_json"
                        ),
                        target_campaign_id=(
                            campaign_id
                        ),
                        pack_id_map=(
                            pack_id_map
                        ),
                        player_id_map=(
                            player_id_map
                        ),
                        draft_game_id_map=(
                            draft_game_id_map
                        ),
                        new_tracking_code=(
                            new_tracking_code
                        ),
                    )
                )

                if (
                    source_pack_id
                    not in membership_enabled
                ):
                    membership_enabled[
                        source_pack_id
                    ] = 1

                if "campaign_enabled" in row:
                    row["campaign_enabled"] = (
                        membership_enabled[
                            source_pack_id
                        ]
                    )

            elif (
                table_name
                == "tracked_chaos_pack_cards"
            ):
                new_pack_id = (
                    get_mapped_import_id(
                        pack_id_map,
                        source_row.get(
                            "tracked_pack_id"
                        ),
                    )
                )

                if new_pack_id is None:
                    continue

                row["tracked_pack_id"] = (
                    new_pack_id
                )

            elif (
                table_name
                == "tracked_chaos_pack_openings"
            ):
                new_pack_id = (
                    get_mapped_import_id(
                        pack_id_map,
                        source_row.get(
                            "tracked_pack_id"
                        ),
                    )
                )

                if new_pack_id is None:
                    continue

                row["tracked_pack_id"] = (
                    new_pack_id
                )

                row["campaign_id"] = (
                    campaign_id
                )

                if (
                    clean_scope
                    == EXPORT_KIND_CAMPAIGN
                ):
                    row[
                        "opened_by_player_id"
                    ] = (
                        get_mapped_import_id(
                            player_id_map,
                            source_row.get(
                                "opened_by_player_id"
                            ),
                        )
                    )

                    row[
                        "draft_game_id"
                    ] = (
                        get_mapped_import_id(
                            draft_game_id_map,
                            source_row.get(
                                "draft_game_id"
                            ),
                        )
                    )

                else:
                    row[
                        "opened_by_player_id"
                    ] = None

                    row[
                        "draft_game_id"
                    ] = None

            remapped_rows.append(row)

        updated_rows[
            table_name
        ] = remapped_rows

    if clean_scope == EXPORT_KIND_CAMPAIGN:
        source_campaign_rows = (
            source_rows.get(
                "chaos_campaigns",
                [],
            )
            or []
        )

        campaign_row = (
            dict(source_campaign_rows[0])
            if source_campaign_rows
            else {}
        )

        campaign_row.update({
            "campaign_id": campaign_id,
            "campaign_name": campaign_name,
            "is_active": 1,
            "created_at_utc": (
                campaign_row.get(
                    "created_at_utc"
                )
                or utc_now_text()
            ),
        })

        updated_rows[
            "chaos_campaigns"
        ] = [campaign_row]

    membership_ids = (
        get_next_import_integer_ids(
            "tracked_chaos_pack_campaigns",
            "tracked_pack_campaign_id",
            len(pack_id_map),
        )
    )

    updated_rows[
        "tracked_chaos_pack_campaigns"
    ] = [
        {
            "tracked_pack_campaign_id":
                membership_id,
            "tracked_pack_id":
                new_pack_id,
            "campaign_key": (
                str(campaign_id)
                if campaign_id is not None
                else "__none__"
            ),
            "campaign_id":
                campaign_id,
            "campaign_enabled":
                membership_enabled.get(
                    source_pack_id,
                    1,
                ),
            "added_at_utc":
                utc_now_text(),
        }
        for (
            membership_id,
            (
                source_pack_id,
                new_pack_id,
            ),
        )
        in zip(
            membership_ids,
            pack_id_map.items(),
        )
    ]

    import_metadata[
        "pack_count"
    ] = len(pack_id_map)

    return (
        updated_rows,
        import_metadata,
    )



def get_allowed_tables_for_import(import_scope):
    clean_scope = (import_scope or "").strip().lower()

    if clean_scope == EXPORT_KIND_PACKS:
        return set(get_existing_pack_backup_tables())

    if clean_scope == EXPORT_KIND_CAMPAIGN:
        return (
            set(get_existing_campaign_backup_tables())
            | set(get_existing_pack_backup_tables())
            | {"chaos_campaigns"}
        )

    if clean_scope == EXPORT_KIND_FULL:
        return (
            set(
                get_existing_full_backup_tables()
            )
            | FULL_BACKUP_ADDITIONAL_TABLE_NAMES
        )

    raise ValueError(f"Unknown import scope: {import_scope}")


def extract_files_from_manifest(zip_file, root):
    files_element = root.find("files")

    if files_element is None:
        return 0

    extracted_count = 0
    archive_names = set(zip_file.namelist())

    for file_element in files_element.findall("file"):
        relative_path = (file_element.get("relative_path") or "").strip()
        archive_path = (file_element.get("archive_path") or "").strip()

        if not relative_path or not archive_path:
            continue

        if archive_path not in archive_names:
            continue

        destination_path = resolve_runtime_relative_path(relative_path)

        if not destination_path:
            continue

        os.makedirs(os.path.dirname(destination_path), exist_ok=True)

        with zip_file.open(archive_path) as source_file:
            with open(destination_path, "wb") as output_file:
                shutil.copyfileobj(source_file, output_file)

        extracted_count += 1

    return extracted_count


def insert_or_replace_manifest_rows(
    rows_by_table,
    allowed_tables,
    *,
    replace_existing=True,
):
    allowed_tables = set(
        allowed_tables or []
    )

    existing_tables = set(
        get_sqlite_table_names()
    )

    imported_rows = 0

    conn = get_db_connection()
    cursor = conn.cursor()

    insert_keyword = (
        "INSERT OR REPLACE"
        if replace_existing
        else "INSERT"
    )

    try:
        for table_name in sorted(
            rows_by_table,
            key=lambda name: (
                PORTABLE_IMPORT_TABLE_ORDER.get(
                    name,
                    1000,
                ),
                name,
            ),
        ):
            table_rows = rows_by_table[
                table_name
            ]

            if table_name not in existing_tables:
                continue

            if (
                allowed_tables
                and table_name
                not in allowed_tables
            ):
                continue

            table_columns = set(
                get_table_columns(table_name)
            )

            for row_data in table_rows:
                filtered_row = {
                    field_name: field_value
                    for (
                        field_name,
                        field_value,
                    )
                    in row_data.items()
                    if field_name
                    in table_columns
                }

                if not filtered_row:
                    continue

                columns = list(
                    filtered_row.keys()
                )

                column_sql = ", ".join(
                    columns
                )

                placeholder_sql = ", ".join(
                    ["?"] * len(columns)
                )

                cursor.execute(
                    f"{insert_keyword} INTO "
                    f"{table_name} "
                    f"({column_sql}) "
                    f"VALUES ({placeholder_sql})",
                    [
                        filtered_row[column]
                        for column in columns
                    ],
                )

                imported_rows += 1

        conn.commit()

    except Exception:
        conn.rollback()
        raise

    finally:
        conn.close()

    return imported_rows


def prepare_isolated_archive_import(zip_file, root):
    """Remap isolated namespaces and paths before extracting or inserting anything."""
    tables = get_tables_from_manifest(root)
    scopes = tables.get("alternate_image_scopes", [])
    mapping = {
        row["image_scope_id"]: uuid4().hex
        for row in scopes
    }

    file_elements = {
        item.get("relative_path"): item
        for item in root.findall("./files/file")
    }

    paths = {}
    prefix = os.path.relpath(
        ALTERNATE_SOURCE_DIR, RUNTIME_BASE_DIR
    ).replace("\\", "/")
    archive_names = set(zip_file.namelist())

    tables["alternate_image_isolation"] = sorted(
        tables.get("alternate_image_isolation", []),
        key=lambda row: (row["image_scope_id"], int(row["alternate_source_id"])),
    )
    for row in tables["alternate_image_isolation"]:
        if row.get("image_scope_id") not in mapping:
            raise ValueError(
                "Archive contains an isolated source without its scope."
            )

        row.pop("alternate_source_id", None)

        for field in ("local_image_path", "fullbleed_image_path"):
            path = row.get(field)

            if not path or path in paths:
                continue

            item = file_elements.get(path)

            if (
                item is None
                or item.get("archive_path") not in archive_names
            ):
                raise ValueError(
                    "Archive is missing an isolated image: " + path
                )

            paths[path] = (
                prefix + "/isolation/import-" + uuid4().hex
                + os.path.splitext(path)[1]
            )

            item.set("relative_path", paths[path])

    portrait_directory = os.path.relpath(
        CAMPAIGN_PLAYER_PORTRAIT_DIR,
        RUNTIME_BASE_DIR,
    ).replace("\\", "/")

    remapped_portraits = {}

    for row in (
        tables.get("chaos_players", [])
        or []
    ):
        portrait_value = str(
            row.get("portrait_image_path")
            or ""
        ).strip()

        if not portrait_value:
            continue

        source_relative_path = (
            normalize_export_file_relative_path(
                table_name="chaos_players",
                field_name="portrait_image_path",
                field_value=portrait_value,
            )
        )

        if source_relative_path in remapped_portraits:
            row["portrait_image_path"] = (
                remapped_portraits[
                    source_relative_path
                ]
            )
            continue

        item = file_elements.get(
            source_relative_path
        )

        if (
            item is None
            or item.get("archive_path")
            not in archive_names
        ):
            row["portrait_image_path"] = None
            continue

        extension = os.path.splitext(
            source_relative_path
        )[1]

        new_filename = (
            "import-"
            + uuid4().hex
            + extension
        )

        remapped_portraits[
            source_relative_path
        ] = new_filename

        row["portrait_image_path"] = (
            new_filename
        )

        item.set(
            "relative_path",
            portrait_directory.rstrip("/")
            + "/"
            + new_filename,
        )

    def remap(value):
        if isinstance(value, list):
            return [remap(item) for item in value]

        if not isinstance(value, dict):
            return value

        result = dict(value)

        for key, item in result.items():
            if key in {"image_scope_id", "alternate_image_scope_id"} and item:
                if item not in mapping:
                    raise ValueError(
                        "Archive references an image scope it does not contain."
                    )

                result[key] = mapping[item]

            elif key in FILE_FIELD_NAMES and item in paths:
                result[key] = paths[item]

            elif isinstance(item, (list, dict)):
                result[key] = remap(item)

            elif key == "source_json":
                parsed_source = (
                    parse_campaign_source_json(
                        item
                    )
                )

                result[key] = (
                    json.dumps(
                        remap(parsed_source),
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                    if parsed_source is not None
                    else None
                )

        return result

    return {
        name: [remap(row) for row in rows]
        for name, rows in tables.items()
    }

def import_archive_from_path(
    archive_path,
    import_scope,
    campaign_name_override="",
    target_campaign_id=None,
):
    if (
        not archive_path
        or not os.path.exists(archive_path)
    ):
        raise ValueError(
            "Export archive was not found."
        )

    with zipfile.ZipFile(
        archive_path,
        "r",
    ) as zip_file:
        root = load_export_manifest_from_zip(
            zip_file
        )

        manifest_kind = (
            root.get("kind")
            or ""
        ).strip().lower()

        content_mode = (
            get_archive_content_mode(root)
        )

        if manifest_kind != import_scope:
            raise ValueError(
                "This archive contains "
                f"{manifest_kind or 'unknown'} data, not "
                f"{import_scope} data."
            )

        allowed_tables = (
            get_allowed_tables_for_import(
                import_scope
            )
        )

        rows_by_table = (
            prepare_isolated_archive_import(
                zip_file,
                root,
            )
        )

        portable_metadata = {}

        if import_scope in {
            EXPORT_KIND_CAMPAIGN,
            EXPORT_KIND_PACKS,
        }:
            validate_portable_pack_integrity(
                rows_by_table,
                require_membership=(
                    import_scope
                    == EXPORT_KIND_CAMPAIGN
                ),
            )

            (
                rows_by_table,
                portable_metadata,
            ) = remap_portable_import_rows(
                rows_by_table,
                import_scope,
                campaign_name_override=(
                    campaign_name_override
                ),
                target_campaign_id=(
                    target_campaign_id
                ),
            )

        extracted_files = (
            extract_files_from_manifest(
                zip_file,
                root,
            )
        )

        imported_rows = (
            insert_or_replace_manifest_rows(
                rows_by_table,
                allowed_tables,
                replace_existing=(
                    import_scope
                    == EXPORT_KIND_FULL
                ),
            )
        )

    return {
        "manifest_kind": manifest_kind,
        "content_mode": content_mode,
        "import_scope": import_scope,
        "imported_rows": imported_rows,
        "extracted_files": extracted_files,
        **portable_metadata,
    }


@isolation_operation
def import_archive_from_file_object(
    file_object,
    import_scope,
    campaign_name_override="",
    target_campaign_id=None,
):
    if not file_object:
        raise ValueError(
            "No export archive file was provided."
        )

    archive_bytes = file_object.read()

    if not archive_bytes:
        raise ValueError(
            "Export archive file was empty."
        )

    with zipfile.ZipFile(
        BytesIO(archive_bytes),
        "r",
    ) as zip_file:
        root = load_export_manifest_from_zip(
            zip_file
        )

        manifest_kind = (
            root.get("kind")
            or ""
        ).strip().lower()

        content_mode = (
            get_archive_content_mode(root)
        )

        if manifest_kind != import_scope:
            raise ValueError(
                "This archive contains "
                f"{manifest_kind or 'unknown'} data, not "
                f"{import_scope} data."
            )

        allowed_tables = (
            get_allowed_tables_for_import(
                import_scope
            )
        )

        rows_by_table = (
            prepare_isolated_archive_import(
                zip_file,
                root,
            )
        )

        portable_metadata = {}

        if import_scope in {
            EXPORT_KIND_CAMPAIGN,
            EXPORT_KIND_PACKS,
        }:
            validate_portable_pack_integrity(
                rows_by_table,
                require_membership=(
                    import_scope
                    == EXPORT_KIND_CAMPAIGN
                ),
            )

            (
                rows_by_table,
                portable_metadata,
            ) = remap_portable_import_rows(
                rows_by_table,
                import_scope,
                campaign_name_override=(
                    campaign_name_override
                ),
                target_campaign_id=(
                    target_campaign_id
                ),
            )

        extracted_files = (
            extract_files_from_manifest(
                zip_file,
                root,
            )
        )

        imported_rows = (
            insert_or_replace_manifest_rows(
                rows_by_table,
                allowed_tables,
                replace_existing=(
                    import_scope
                    == EXPORT_KIND_FULL
                ),
            )
        )

    return {
        "manifest_kind": manifest_kind,
        "content_mode": content_mode,
        "import_scope": import_scope,
        "imported_rows": imported_rows,
        "extracted_files": extracted_files,
        **portable_metadata,
    }
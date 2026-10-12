import json
import re
from contextlib import closing
from datetime import datetime, timezone

from db.database import get_db_connection


HELP_TOUR_STATUSES = {
    "active",
    "paused",
    "completed",
    "dismissed",
}

_HELP_TOUR_ID_PATTERN = re.compile(
    r"^[a-z0-9][a-z0-9_-]{0,79}$"
)

_HELP_STEP_ID_PATTERN = re.compile(
    r"^[a-z0-9][a-z0-9_-]{0,79}$"
)


def _utc_now_text():
    return datetime.now(timezone.utc).isoformat()


def ensure_help_schema():
    with closing(get_db_connection()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS help_tour_progress (
                tour_id TEXT PRIMARY KEY,
                tour_version INTEGER NOT NULL DEFAULT 1,
                current_step_id TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                context_json TEXT NOT NULL DEFAULT '{}',
                started_at_utc TEXT NOT NULL,
                updated_at_utc TEXT NOT NULL,
                completed_at_utc TEXT
            )
            """
        )

        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_help_tour_progress_status_updated
            ON help_tour_progress (
                status,
                updated_at_utc DESC
            )
            """
        )

        conn.commit()


class HelpProgressRepository:
    MAX_CONTEXT_JSON_LENGTH = 20000

    @staticmethod
    def _normalize_identifier(
        value,
        label,
        pattern,
    ):
        clean_value = str(
            value or ""
        ).strip().lower()

        if (
            not clean_value
            or not pattern.fullmatch(clean_value)
        ):
            raise ValueError(
                f"Invalid {label}."
            )

        return clean_value

    @classmethod
    def normalize_tour_id(
        cls,
        value,
    ):
        return cls._normalize_identifier(
            value,
            "help tour id",
            _HELP_TOUR_ID_PATTERN,
        )

    @classmethod
    def normalize_step_id(
        cls,
        value,
        allow_empty=False,
    ):
        clean_value = str(
            value or ""
        ).strip().lower()

        if allow_empty and not clean_value:
            return ""

        return cls._normalize_identifier(
            clean_value,
            "help step id",
            _HELP_STEP_ID_PATTERN,
        )

    @staticmethod
    def normalize_status(
        value,
    ):
        clean_status = str(
            value or ""
        ).strip().lower()

        if clean_status not in HELP_TOUR_STATUSES:
            raise ValueError(
                "Invalid help tour status."
            )

        return clean_status

    @classmethod
    def normalize_context(
        cls,
        value,
    ):
        context_value = (
            value
            if isinstance(value, dict)
            else {}
        )

        serialized = json.dumps(
            context_value,
            separators=(",", ":"),
            sort_keys=True,
        )

        if (
            len(serialized)
            > cls.MAX_CONTEXT_JSON_LENGTH
        ):
            raise ValueError(
                "Help tour context is too large."
            )

        return serialized

    @staticmethod
    def _serialize_row(
        row,
    ):
        if row is None:
            return None

        result = dict(row)

        try:
            result["context"] = json.loads(
                result.pop(
                    "context_json"
                )
                or "{}"
            )
        except (
            TypeError,
            ValueError,
            json.JSONDecodeError,
        ):
            result.pop(
                "context_json",
                None,
            )
            result["context"] = {}

        return result

    def get(
        self,
        tour_id,
    ):
        clean_tour_id = (
            self.normalize_tour_id(
                tour_id
            )
        )

        with closing(
            get_db_connection()
        ) as conn:
            row = conn.execute(
                """
                SELECT *
                FROM help_tour_progress
                WHERE tour_id = ?
                """,
                (
                    clean_tour_id,
                ),
            ).fetchone()

        return self._serialize_row(
            row
        )

    def get_active(
        self,
    ):
        with closing(
            get_db_connection()
        ) as conn:
            row = conn.execute(
                """
                SELECT *
                FROM help_tour_progress
                WHERE status = 'active'
                ORDER BY updated_at_utc DESC
                LIMIT 1
                """
            ).fetchone()

        return self._serialize_row(
            row
        )

    def save(
        self,
        tour_id,
        *,
        tour_version=1,
        current_step_id="",
        status="active",
        context=None,
    ):
        clean_tour_id = (
            self.normalize_tour_id(
                tour_id
            )
        )

        clean_step_id = (
            self.normalize_step_id(
                current_step_id,
                allow_empty=True,
            )
        )

        clean_status = (
            self.normalize_status(
                status
            )
        )

        context_json = (
            self.normalize_context(
                context
            )
        )

        try:
            clean_version = max(
                1,
                int(tour_version),
            )
        except (
            TypeError,
            ValueError,
        ):
            clean_version = 1

        now_utc = _utc_now_text()

        with closing(
            get_db_connection()
        ) as conn:
            existing = conn.execute(
                """
                SELECT started_at_utc
                FROM help_tour_progress
                WHERE tour_id = ?
                """,
                (
                    clean_tour_id,
                ),
            ).fetchone()

            started_at_utc = (
                existing["started_at_utc"]
                if existing
                else now_utc
            )

            completed_at_utc = (
                now_utc
                if clean_status == "completed"
                else None
            )

            if clean_status == "active":
                conn.execute(
                    """
                    UPDATE help_tour_progress
                    SET
                        status = 'paused',
                        updated_at_utc = ?
                    WHERE status = 'active'
                      AND tour_id <> ?
                    """,
                    (
                        now_utc,
                        clean_tour_id,
                    ),
                )

            conn.execute(
                """
                INSERT INTO help_tour_progress (
                    tour_id,
                    tour_version,
                    current_step_id,
                    status,
                    context_json,
                    started_at_utc,
                    updated_at_utc,
                    completed_at_utc
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tour_id)
                DO UPDATE SET
                    tour_version =
                        excluded.tour_version,
                    current_step_id =
                        excluded.current_step_id,
                    status =
                        excluded.status,
                    context_json =
                        excluded.context_json,
                    updated_at_utc =
                        excluded.updated_at_utc,
                    completed_at_utc =
                        excluded.completed_at_utc
                """,
                (
                    clean_tour_id,
                    clean_version,
                    clean_step_id or None,
                    clean_status,
                    context_json,
                    started_at_utc,
                    now_utc,
                    completed_at_utc,
                ),
            )

            conn.commit()

        return self.get(
            clean_tour_id
        )
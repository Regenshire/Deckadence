"""A stable, anonymous HTTP identity shared by this installation's downloads."""
from contextlib import closing
from pathlib import Path
import sqlite3
import threading
from uuid import UUID, uuid4

from paths import DATA_ROOT_DIR


class DownloadIdentity:
    def __init__(self, path):
        self.path = Path(path)
        self._user_agent = None
        self._lock = threading.Lock()

    def user_agent(self):
        with self._lock:
            if self._user_agent is None:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                # A transaction also coordinates first use across app processes.
                with closing(sqlite3.connect(self.path, timeout=30)) as connection:
                    with connection:
                        connection.execute(
                            "CREATE TABLE IF NOT EXISTS installation "
                            "(id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)"
                        )
                        connection.execute(
                            "INSERT OR IGNORE INTO installation (id, value) VALUES (1, ?)",
                            (str(uuid4()),),
                        )
                        value = connection.execute(
                            "SELECT value FROM installation WHERE id = 1"
                        ).fetchone()[0]
                        # Validate instead of silently changing an existing identity.
                        self._user_agent = str(UUID(value))
            return self._user_agent


_identity = DownloadIdentity(Path(DATA_ROOT_DIR) / "download_identity.sqlite3")


def get_download_user_agent():
    return _identity.user_agent()

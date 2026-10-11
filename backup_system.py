"""Shared archive safety, disk-space and cross-process locking helpers."""
from __future__ import annotations

from contextlib import contextmanager
from functools import wraps
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import zipfile

from paths import RUNTIME_BASE_DIR, BUNDLE_BASE_DIR

CHUNK_SIZE = 4 * 1024 * 1024
MANIFEST = "backup_manifest.json"
INVENTORY = "backup_inventory.jsonl"


def _write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def _is_link(path):
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def _safe_name(name):
    if not isinstance(name, str) or not name or "\\" in name or ":" in name or "\x00" in name:
        raise ValueError("The archive contains an unsafe file path.")
    parts = name.split("/")
    if any(part in {"", ".", ".."} or part.rstrip(" .") != part for part in parts):
        raise ValueError("The archive contains an unsafe file path.")
    return PurePosixPath(name)



def _disk_path(path):
    # Extended Windows paths preserve the literal MTG set icon CON.svg and
    # support deeply nested/long plugin and image filenames.
    path = Path(path)
    if os.name != "nt":
        return path
    value = str(path.absolute())
    prefix = '\\\\?\\'
    if value.startswith(prefix):
        return path
    if value.startswith('\\\\'):
        return Path(prefix + 'UNC\\' + value[2:])
    return Path(prefix + value)


def _quote(name):
    return '"' + name.replace('"', '""') + '"'


def _exclusive(method):
    @wraps(method)
    def guarded(self, *args, **kwargs):
        with self._operation_lock():
            return method(self, *args, **kwargs)
    return guarded


class ArchiveOperations:
    def __init__(self, runtime_root=None, bundle_root=None, app_version=""):
        self.root = Path(runtime_root or RUNTIME_BASE_DIR).resolve()
        self.bundle = Path(bundle_root or BUNDLE_BASE_DIR).resolve()
        self.app_version = app_version
        self.work = self.root / "Export" / "backup-work"
        self.backups = self.root / "Export"
        self.pending = self.work / "pending-restore.json"

    @contextmanager
    def _operation_lock(self):
        # Preserve interrupted-import recovery data from the former location.
        legacy = self.root / ".backup-work"
        if legacy.is_dir() and not self.work.exists():
            # Both migration targets must stay within this installation.
            if legacy.parent != self.root or self.root not in self.work.parents:
                raise ValueError("Invalid backup workspace migration path.")
            self.work.parent.mkdir(parents=True, exist_ok=True)
            if _is_link(legacy) or _is_link(self.work.parent):
                raise ValueError("The backup staging directory cannot be linked.")
            os.replace(legacy, self.work)
        self.work.mkdir(parents=True, exist_ok=True)
        if _is_link(self.work):
            raise ValueError("The backup staging directory cannot be linked.")
        with (self.work / "operation.lock").open("a+b") as handle:
            if handle.tell() == 0:
                handle.write(b"0")
                handle.flush()
            handle.seek(0)
            try:
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError as error:
                raise ValueError("Another backup or restore operation is already using this installation.") from error
            try:
                yield
            finally:
                if os.name == "nt":
                    handle.seek(0)
                    msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    fcntl.flock(handle.fileno(), fcntl.LOCK_UN)

    @staticmethod
    def is_backup(archive_path):
        with zipfile.ZipFile(archive_path) as archive:
            return MANIFEST in archive.namelist()

    @staticmethod
    def _space(directory, required):
        available = shutil.disk_usage(directory).free
        if available < required:
            raise ValueError(
                f"Not enough free space on {directory}: need approximately "
                f"{required / (1024 ** 3):.2f} GiB; {available / (1024 ** 3):.2f} GiB available."
            )

    def pending_status(self):
        try:
            state = json.loads(self.pending.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        return {"staged": True, "message": "A restore is staged. Restart Deckadence to apply it.",
                "created_at_utc": state.get("metadata", {}).get("created_at_utc", "")}

    def _stage_path(self, state):
        name = state.get("stage", "")
        if not isinstance(name, str) or not name.startswith("restore-") or len(name) != 40 or any(char not in "0123456789abcdef" for char in name[8:]):
            raise ValueError("The restore journal has an invalid staging directory.")
        stage = self.work / name
        if stage.exists() and _is_link(stage):
            raise ValueError("The restore staging directory is linked.")
        return stage

    @_exclusive
    def cancel_restore(self):
        if not self.pending.exists():
            return
        state = json.loads(self.pending.read_text(encoding="utf-8"))
        if state.get("phase") != "ready":
            raise ValueError("The old restore was interrupted while applying. Recover it with the previous application version first.")
        stage = self._stage_path(state)
        if stage.exists():
            shutil.rmtree(_disk_path(stage))
        self.pending.unlink()


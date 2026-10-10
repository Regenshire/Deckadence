"""Streamed portable archives containing user records and assets, never cards.db."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import tempfile
import zipfile
from uuid import uuid4

from backup_system import (
    ArchiveOperations, CHUNK_SIZE, MANIFEST, INVENTORY,
    _disk_path, _safe_name, _exclusive, _write_json,
)

FORMAT = "deckadence_user_content"
VERSION = 3
RECORDS = "records.jsonl"


class UserBackupService(ArchiveOperations):
    def begin_import_journal(self, token, files, replacements):
        from portable_content import _checked
        recovery = self.work / ("recovery-" + token)
        recovery.mkdir()
        saved = []
        for index, path in enumerate(replacements):
            _checked(path)
            existed = path.is_file()
            if existed:
                shutil.copyfile(path, recovery / str(index))
                with (recovery / str(index)).open("r+b") as handle:
                    os.fsync(handle.fileno())
            saved.append({"path": str(path), "existed": existed})
        _write_json(self.work / "import-journal.json", {"token": token, "files": list(map(str, files)), "replacements": saved})

    def _recover_import(self):
        """A DB receipt distinguishes a committed import from an interrupted one."""
        from portable_content import _checked, IMAGE_EXTENSIONS, CUTTING_EXTENSIONS
        journal = self.work / "import-journal.json"
        if not journal.exists():
            return
        _checked(journal)
        state = json.loads(journal.read_text(encoding="utf-8"))
        token = state.get("token", "")
        if len(token) != 32 or any(char not in "0123456789abcdef" for char in token):
            raise ValueError("Invalid import recovery journal.")
        recovery = _checked(self.work / ("recovery-" + token))
        targets = []
        for value in state.get("files", []):
            path = _checked(value)
            if not (self.root in path.parents or self.bundle in path.parents) or token not in str(path) or path.suffix.lower() not in IMAGE_EXTENSIONS | CUTTING_EXTENSIONS | {".ini"}:
                raise ValueError("Invalid recovery asset path.")
            targets.append(path)
        replacements = state.get("replacements", [])
        allowed = {self.root / "settings.json", self.root / "static/sil/Studio3/templates.json"}
        for record in replacements:
            if _checked(record["path"]) not in allowed or type(record.get("existed")) is not bool:
                raise ValueError("Invalid recovery settings path.")
        database = sqlite3.connect((self.root / "cards.db").as_uri() + "?mode=ro", uri=True)
        try:
            exists = database.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='_user_backup_imports'").fetchone()
            committed = bool(exists and database.execute("SELECT 1 FROM _user_backup_imports WHERE import_token=?", (token,)).fetchone())
        finally:
            database.close()
        if not committed:
            for index, record in enumerate(replacements):
                path = Path(record["path"])
                if record["existed"]:
                    original = recovery / str(index)
                    if not original.is_file():
                        raise ValueError("An interrupted import is missing its settings rollback file.")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    temporary = path.with_suffix(path.suffix + ".recovery")
                    shutil.copyfile(original, temporary)
                    os.replace(temporary, path)
                else:
                    path.unlink(missing_ok=True)
            for path in reversed(targets):
                _disk_path(path).unlink(missing_ok=True)
        shutil.rmtree(_disk_path(recovery))
        journal.unlink()

    @_exclusive
    def recover_import(self):
        self._recover_import()

    @_exclusive
    def create_backup(self, output_directory=None, progress=None):
        from portable_content import UserContentExporter
        progress = progress or (lambda **state: None)
        self._recover_import()
        if self.pending.exists():
            raise ValueError("Cancel the old staged full restore before exporting user content.")
        output = Path(output_directory or self.backups).expanduser().resolve()
        for name in ("data", "print", "static", "plugins", ".backup-work"):
            managed = self.root / name
            if output == managed or managed in output.parents:
                raise ValueError("Choose a backup folder outside managed content folders.")
        output.mkdir(parents=True, exist_ok=True)
        destination = output / ("deckadence_user_content_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S") + "_" + uuid4().hex[:8] + ".zip")
        partial = destination.with_suffix(".zip.partial")
        try:
            with tempfile.TemporaryDirectory(prefix="export-", dir=self.work) as temporary:
                temporary = Path(temporary)
                metadata, assets = UserContentExporter(self, temporary, progress).collect()
                files = {RECORDS: temporary / RECORDS, **assets}
                total = sum(path.stat().st_size for path in files.values())
                self._space(output, total + max(CHUNK_SIZE, total // 100))
                completed = 0
                inventory_path = temporary / INVENTORY
                with zipfile.ZipFile(partial, "w", allowZip64=True) as archive:
                    with inventory_path.open("w", encoding="utf-8") as inventory:
                        for index, (name, path) in enumerate(files.items()):
                            _safe_name(name)
                            before = path.stat()
                            digest = hashlib.sha256()
                            written = 0
                            info = zipfile.ZipInfo("payload/" + name)
                            info.compress_type = zipfile.ZIP_DEFLATED if name == RECORDS else zipfile.ZIP_STORED
                            with _disk_path(path).open("rb") as reader, archive.open(info, "w", force_zip64=True) as writer:
                                while chunk := reader.read(CHUNK_SIZE):
                                    writer.write(chunk)
                                    digest.update(chunk)
                                    written += len(chunk)
                                    completed += len(chunk)
                                    progress(stage="Exporting user content", current_file=path.name,
                                             completed_bytes=completed, total_bytes=total, completed_files=index)
                            if written != before.st_size or before.st_mtime_ns != path.stat().st_mtime_ns:
                                raise ValueError(f"A file changed during export: {path.name}. Retry after image jobs finish.")
                            inventory.write(json.dumps({"path": name, "size": written, "sha256": digest.hexdigest()}) + "\n")
                    archive.write(inventory_path, INVENTORY, compress_type=zipfile.ZIP_DEFLATED)
                    metadata.update(format=FORMAT, version=VERSION, app_version=self.app_version,
                                    created_at_utc=datetime.now(timezone.utc).isoformat(), source_root=str(self.root),
                                    file_count=len(files), total_bytes=completed)
                    archive.writestr(MANIFEST, json.dumps(metadata, ensure_ascii=False))
                with partial.open("r+b") as handle:
                    os.fsync(handle.fileno())
                os.replace(partial, destination)
                progress(stage="Complete", completed_bytes=completed, total_bytes=completed, completed_files=len(files))
                return {"zip_path": str(destination), "zip_filename": destination.name, "export_kind": "user_content",
                        "file_count": len(files), "total_bytes": completed, "row_counts": metadata["row_counts"],
                        "message": "User content exported. Download the archive or copy it from the saved location."}
        finally:
            partial.unlink(missing_ok=True)

    def _extract(self, archive_path, temporary, progress):
        with zipfile.ZipFile(archive_path) as archive:
            info = archive.getinfo(MANIFEST)
            if info.file_size > 64 * 1024 * 1024:
                raise ValueError("The backup metadata is too large.")
            metadata = json.loads(archive.read(info))
            if metadata.get("format") != FORMAT or metadata.get("version") != VERSION:
                raise ValueError("Use a portable user-content backup. Full-database archives cannot be merged safely.")
            members = {}
            seen_names = set()
            for item in archive.infolist():
                _safe_name(item.filename)
                if item.filename.casefold() in seen_names or item.is_dir() or stat.S_ISLNK(item.external_attr >> 16):
                    raise ValueError("The archive contains duplicate or linked entries.")
                seen_names.add(item.filename.casefold())
                if item.filename in {MANIFEST, INVENTORY}:
                    continue
                if not item.filename.startswith("payload/"):
                    raise ValueError("The archive contains an unexpected file.")
                name = item.filename[len("payload/"):]
                if name != RECORDS and not name.startswith("assets/"):
                    raise ValueError("The archive contains non-user content.")
                members[name] = item
            if RECORDS not in members or len(members) != metadata.get("file_count") or sum(item.file_size for item in members.values()) != metadata.get("total_bytes"):
                raise ValueError("The backup inventory does not match its metadata.")
            self._space(self.work, metadata["total_bytes"] + CHUNK_SIZE)
            completed = 0
            seen = set()
            with archive.open(INVENTORY) as inventory:
                while line := inventory.readline(128 * 1024):
                    if not line.endswith(b"\n"):
                        raise ValueError("Invalid inventory record.")
                    record = json.loads(line)
                    name = record.get("path")
                    if name not in members or name in seen or record.get("size") != members[name].file_size:
                        raise ValueError("Invalid or duplicate inventory entry.")
                    seen.add(name)
                    destination = _disk_path(temporary.joinpath(*_safe_name(name).parts))
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    digest = hashlib.sha256()
                    with archive.open(members[name]) as reader, destination.open("wb") as writer:
                        while chunk := reader.read(CHUNK_SIZE):
                            writer.write(chunk)
                            digest.update(chunk)
                            completed += len(chunk)
                            progress(stage="Validating archive", current_file=name, completed_bytes=completed,
                                     total_bytes=metadata["total_bytes"], completed_files=len(seen) - 1)
                        writer.flush()
                        os.fsync(writer.fileno())
                    if digest.hexdigest() != record.get("sha256"):
                        raise ValueError(f"Checksum mismatch: {name}")
            if seen != set(members):
                raise ValueError("Missing inventory entries.")
        return metadata

    @_exclusive
    def import_backup(self, archive_path, progress=None):
        from portable_content import UserContentImporter
        progress = progress or (lambda **state: None)
        self._recover_import()
        if self.pending.exists():
            raise ValueError("Cancel the old staged full restore before importing user content.")
        archive_path = Path(archive_path).expanduser().resolve()
        if not archive_path.is_file():
            raise ValueError("The archive was not found on the Deckadence computer.")
        with tempfile.TemporaryDirectory(prefix="import-", dir=self.work) as temporary:
            temporary = Path(temporary)
            metadata = self._extract(archive_path, temporary, progress)
            return UserContentImporter(self, temporary, metadata, progress).apply()

    stage_restore = import_backup

    def pending_status(self):
        return {"message": "An old full restore is staged. Cancel it; portable imports do not require a restart."} if self.pending.exists() else None

    def apply_pending_restore(self):
        raise ValueError("Portable user-content imports never replace the database at startup.")


def recover_interrupted_import():
    UserBackupService().recover_import()

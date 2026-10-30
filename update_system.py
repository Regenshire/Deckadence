"""Portable release packaging and the independent Deckadence update helper.

The helper is self-contained; HTTPS also uses the application's bundled certifi
roots so a Mac download does not depend on the build machine's certificate path.
The GitHub repository and HTTPS are the trust boundary; SHA-256 detects damaged
or mismatched downloads. Checksums are not publisher signatures.
"""
from __future__ import annotations

import argparse
from contextlib import closing, contextmanager
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import sqlite3
import ssl
import stat
import subprocess
import sys
import tarfile
import time
import traceback
import urllib.parse
import urllib.request
import uuid
import zipfile

from settings import APP_SERVER_PORT

SCHEMA = 1
UPDATER_VERSION = 1
REPOSITORY = "Regenshire/Deckadence"
INSTALL_MANIFEST = "deckadence-install.json"
WORK_NAME = ".deckadence-update"
CHUNK = 1024 * 1024
MAX_METADATA = 8 * CHUNK
MAX_PACKAGE = 4 * 1024 ** 3
MAX_UNPACKED = 12 * 1024 ** 3
MANAGED_ROOTS = frozenset({
    "Deckadence.exe", "Deckadence", "DeckadenceUpdater.exe", "DeckadenceUpdater",
    "_internal", "Deckadence.app", "Start_Deckadence.bat", "Start_Deckadence.sh",
    "Start_Deckadence.command", "Install_Shortcuts.bat",
    "Install_Deckadence_Shortcuts.ps1", "README.md", "README_LINUX.txt",
    "LICENSE.txt", "BUILD_INFO.txt", INSTALL_MANIFEST,
})


def version_tuple(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", value):
        raise ValueError("Updates require a stable major.minor.patch version.")
    return tuple(map(int, value.split(".")))


def platform_key():
    machine = platform.machine().lower()
    machine = {"amd64": "x86_64", "aarch64": "arm64"}.get(machine, machine)
    system = {"Windows": "windows", "Linux": "linux", "Darwin": "macos"}.get(platform.system())
    key = f"{system}-{machine}"
    if key not in {"windows-x86_64", "linux-x86_64", "macos-arm64"}:
        raise ValueError("In-app updates are not available for this operating system and processor.")
    return key


def executable_name(key=None):
    return "Deckadence.exe" if (key or platform_key()).startswith("windows-") else "Deckadence"


def helper_name(key=None):
    return "DeckadenceUpdater.exe" if (key or platform_key()).startswith("windows-") else "DeckadenceUpdater"


def metadata_name(key):
    return f"Deckadence-update-{key}.json"


def resolve_server_port(root, default=APP_SERVER_PORT):
    value = os.environ.get("DECKADENCE_SERVER_PORT")
    if value is None:
        try:
            value = read_json(Path(root) / WORK_NAME / "server-port.json").get("port")
        except (OSError, ValueError, AttributeError):
            pass
    try:
        port = int(value)
        return port if 1 <= port <= 65535 else default
    except (TypeError, ValueError):
        return default


def disk_path(path):
    path = Path(path).absolute()
    if os.name != "nt" or str(path).startswith("\\\\?\\"):
        return path
    value = str(path)
    return Path("\\\\?\\UNC\\" + value[2:] if value.startswith("\\\\") else "\\\\?\\" + value)


def is_link(path):
    info = disk_path(path).lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def safe_path(name):
    if not isinstance(name, str) or not name or "\\" in name or ":" in name or "\x00" in name:
        raise ValueError("Unsafe path in update package.")
    parts = name.split("/")
    if any(p in {"", ".", ".."} or p.rstrip(" .") != p for p in parts):
        raise ValueError("Unsafe path in update package.")
    if parts[0] not in MANAGED_ROOTS:
        raise ValueError(f"Update package contains a user-data or unknown path: {parts[0]}")
    return PurePosixPath(name)


def safe_link(name, target):
    safe_path(name)
    if not isinstance(target, str) or not target or "\\" in target or ":" in target or "\x00" in target or target.startswith("/"):
        raise ValueError("Unsafe symbolic link in update package.")
    parts = name.split("/")[:-1]
    for part in target.split("/"):
        if part == "..":
            if len(parts) <= 1:
                raise ValueError("An update link escapes its application directory.")
            parts.pop()
        elif part not in {"", "."}:
            parts.append(part)
    if name.split("/")[0] not in {"_internal", "Deckadence.app"}:
        raise ValueError("Update links are only allowed inside the application bundle.")
    safe_path("/".join(parts))


def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(value, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)


def read_json(path):
    with Path(path).open("rb") as stream:
        data = stream.read(MAX_METADATA + 1)
    if len(data) > MAX_METADATA:
        raise ValueError("Update metadata is too large.")
    return json.loads(data)


def sha256(path):
    digest = hashlib.sha256()
    with disk_path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def check_space(root, required):
    if shutil.disk_usage(root).free < required:
        raise ValueError(f"Not enough free space for a safe update. Approximately {required / 1024 ** 3:.1f} GiB is needed.")


def inventory(root, roots):
    result = {}
    def visit(path, name):
        safe_path(name)
        if is_link(path):
            target = os.readlink(disk_path(path)).replace("\\", "/")
            safe_link(name, target)
            result[name] = {"link": target}
        elif disk_path(path).is_dir():
            for child in sorted(disk_path(path).iterdir()):
                visit(path / child.name, name + "/" + child.name)
        elif disk_path(path).is_file():
            info = disk_path(path).stat()
            result[name] = {"size": info.st_size, "sha256": sha256(path), "mode": stat.S_IMODE(info.st_mode) & 0o777}
        else:
            raise ValueError(f"Unexpected application file: {name}")
    for name in sorted(roots):
        if name != INSTALL_MANIFEST:
            visit(Path(root) / name, name)
    return result


def validate_install(document, key=None, version=None):
    if not isinstance(document, dict) or document.get("schema") != SCHEMA:
        raise ValueError("This installation needs a newer updater. Install the release manually.")
    version_tuple(document.get("version"))
    if document.get("platform") not in {"windows-x86_64", "linux-x86_64", "macos-arm64"}:
        raise ValueError("Unsupported installation platform.")
    if key is not None and document.get("platform") != key:
        raise ValueError("The update package is for a different platform.")
    if version is not None and document["version"] != version:
        raise ValueError("The update package version does not match its release.")
    roots = document.get("roots")
    if not isinstance(roots, list) or not roots or len(set(roots)) != len(roots) or not set(roots) <= MANAGED_ROOTS:
        raise ValueError("Invalid application file ownership manifest.")
    if not {INSTALL_MANIFEST, "_internal", executable_name(document["platform"]), helper_name(document["platform"])} <= set(roots):
        raise ValueError("The release is missing its runtime or updater.")
    files = document.get("files")
    if not isinstance(files, dict) or not files:
        raise ValueError("The release has no application file inventory.")
    seen = set()
    for name, record in files.items():
        safe_path(name)
        if name == INSTALL_MANIFEST or name.split("/")[0] not in roots or name.casefold() in seen:
            raise ValueError("Invalid or duplicate application file.")
        seen.add(name.casefold())
        if not isinstance(record, dict):
            raise ValueError("Invalid application inventory record.")
        if "link" in record:
            safe_link(name, record["link"])
        elif type(record.get("size")) is not int or not 0 <= record["size"] <= MAX_UNPACKED or not re.fullmatch(r"[a-f0-9]{64}", str(record.get("sha256", ""))) or type(record.get("mode")) is not int or not 0 <= record["mode"] <= 0o777:
            raise ValueError("Invalid application checksum or file mode.")
    for name in files:
        for parent in PurePosixPath(name).parents:
            if str(parent) in files:
                raise ValueError("A package file is also used as a parent directory.")
    return document


def record_update_event(root, operation, message, *, error=False):
    """Diagnostics must never prevent an update or hide the original error."""
    try:
        work = workspace(root)
        value = {"time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                 "operation": operation, "message": str(message)}
        if error:
            value["traceback"] = traceback.format_exc()
            write_json(work / "last-error.json", value)
        with (work / "events.log").open("a", encoding="utf-8") as log:
            log.write(json.dumps(value, ensure_ascii=False) + "\n")
    except OSError:
        pass


def preserve_local_files(root, work, state):
    """Carry additions forward; archive replaced files without comparing their bytes."""
    root, work = Path(root), Path(work)
    preserved = work / "preserved-files" / state["id"]
    identity = str.casefold if os.name == "nt" else str
    known = {identity(name) for name in state["old"]["files"]}
    incoming = {identity(name) for name in state["new"]["files"]}
    incoming_parents = {str(parent) for name in incoming for parent in PurePosixPath(name).parents}
    additions = []

    def conflicts(name):
        key = identity(name)
        return key in incoming or key in incoming_parents or any(str(parent) in incoming for parent in PurePosixPath(key).parents)

    def visit(source, name):
        if is_link(source):
            if identity(name) not in known:
                additions.append(name)
        elif source.is_dir():
            for child in source.iterdir():
                visit(child, name + "/" + child.name)
        elif source.is_file():
            if identity(name) not in known and name != INSTALL_MANIFEST:
                additions.append(name)

    for name in sorted(set(state["old"]["roots"]) | set(state["new"]["roots"])):
        source = root / name
        if source.exists() or source.is_symlink():
            visit(source, name)

    # Replaced files remain in previous-app for rollback. Local additions that
    # collide with a new release file also get a durable, separately kept copy.
    for name in additions:
        if not conflicts(name):
            continue
        source, target = root / name, preserved / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_symlink():
            os.symlink(os.readlink(source), target, target_is_directory=source.is_dir())
        else:
            shutil.copy2(source, target)
    state["local_additions"] = [name for name in additions if not conflicts(name)]
    state["preserved_conflicts"] = [name for name in additions if conflicts(name)]
    write_json(work / "transaction.json", state)
    record_update_event(root, "preserve", f"Carrying forward {len(state['local_additions'])} local additions; preserving {len(state['preserved_conflicts'])} filename conflicts.")


def restore_local_files(root, work, state):
    """Restore additions from the previous application without replacing release files."""
    for name in state.get("local_additions", []):
        source, target = work / "previous-app" / name, root / name
        if target.exists() or target.is_symlink():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_symlink():
            os.symlink(os.readlink(source), target, target_is_directory=source.is_dir())
        else:
            shutil.copy2(source, target)


def package_release(root, output, version, key):
    """Run after launchers/signing are complete, before publishing the release."""
    root, output = Path(root).resolve(), Path(output).resolve()
    version_tuple(version)
    if key not in {"windows-x86_64", "linux-x86_64", "macos-arm64"}:
        raise ValueError("Unsupported release platform.")
    roots = sorted(path.name for path in root.iterdir())
    if INSTALL_MANIFEST not in roots:
        roots.append(INSTALL_MANIFEST)
    if not set(roots) <= MANAGED_ROOTS:
        raise ValueError("The release folder contains user data or unexpected files.")
    manifest = {"schema": SCHEMA, "version": version, "platform": key, "roots": sorted(roots), "files": inventory(root, roots)}
    validate_install(manifest, key, version)
    write_json(root / INSTALL_MANIFEST, manifest)
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_suffix(output.suffix + ".partial")
    try:
        if output.name.endswith(".tar.gz"):
            with tarfile.open(partial, "w:gz", dereference=False) as archive:
                for name in sorted(set(manifest["files"]) | {INSTALL_MANIFEST}):
                    path = root / name
                    # Preserve symlinks, but represent repeated regular inodes
                    # as files rather than tar hardlinks.
                    archive.inodes.clear()
                    info = archive.gettarinfo(str(path), arcname="Deckadence/" + name)
                    if info.isfile():
                        with disk_path(path).open("rb") as stream:
                            archive.addfile(info, stream)
                    else:
                        archive.addfile(info)
        elif output.suffix == ".zip":
            with zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for name in sorted(set(manifest["files"]) | {INSTALL_MANIFEST}):
                    path = root / name
                    if is_link(path):
                        info = zipfile.ZipInfo("Deckadence/" + name)
                        info.create_system = 3
                        info.external_attr = (stat.S_IFLNK | 0o777) << 16
                        archive.writestr(info, os.readlink(disk_path(path)))
                    else:
                        archive.write(disk_path(path), "Deckadence/" + name)
        else:
            raise ValueError("Release packages must be ZIP or tar.gz archives.")
        os.replace(partial, output)
    finally:
        partial.unlink(missing_ok=True)
    size = output.stat().st_size
    digest = sha256(output)
    metadata = {"schema": SCHEMA, "version": version, "platform": key,
                "minimum_updater": UPDATER_VERSION, "minimum_app_version": "3.2.0",
                "package": output.name, "size": size, "sha256": digest,
                "unpacked_size": sum(r.get("size", 0) for r in manifest["files"].values()) + (root / INSTALL_MANIFEST).stat().st_size}
    write_json(output.parent / metadata_name(key), metadata)
    output.with_name(output.name + ".sha256").write_text(f"{digest}  {output.name}\n", encoding="utf-8")
    return metadata


class GitHubRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if parsed.scheme != "https" or parsed.hostname not in {"github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"} or parsed.username or parsed.password:
            raise ValueError("GitHub redirected the update to an untrusted location.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def github_open(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in {"api.github.com", "github.com"} or parsed.username or parsed.password:
        raise ValueError("Updates must come from the Deckadence GitHub release.")
    context = ssl.create_default_context()
    # Keep OS trust roots and add the roots shipped with the application. This
    # matters especially for frozen macOS Python/OpenSSL installations.
    try:
        import certifi
    except ImportError:
        pass
    else:
        context.load_verify_locations(cafile=certifi.where())
    opener = urllib.request.build_opener(GitHubRedirects(), urllib.request.HTTPSHandler(context=context))
    request = urllib.request.Request(url, headers={"User-Agent": "Deckadence-Updater/1", "Accept": "application/vnd.github+json" if parsed.hostname == "api.github.com" else "application/octet-stream"})
    return opener.open(request, timeout=30)


def github_json(url, limit=MAX_METADATA):
    with github_open(url) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("GitHub update metadata exceeded the allowed size.")
    return json.loads(data)


def asset_url(asset, tag):
    name = asset.get("name", "")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.-]+", name):
        raise ValueError("Invalid release asset name.")
    expected = f"https://github.com/{REPOSITORY}/releases/download/{tag}/{name}"
    if asset.get("browser_download_url") != expected or asset.get("state") != "uploaded":
        raise ValueError("The update asset is not a completed Deckadence release upload.")
    return expected


def discover_update(current_version, key):
    release = github_json(f"https://api.github.com/repos/{REPOSITORY}/releases/latest")
    tag = release.get("tag_name", "")
    version = tag.removeprefix("v")
    version_tuple(version)
    result = {"available": False, "version": version, "notes": str(release.get("body", ""))[:12000],
              "release_url": f"https://github.com/{REPOSITORY}/releases/tag/{tag}"}
    if release.get("draft") or release.get("prerelease") or version_tuple(version) <= version_tuple(current_version):
        return {**result, "message": "You are running the latest compatible stable release."}
    assets = release.get("assets", [])
    candidates = [a for a in assets if a.get("name") == metadata_name(key)]
    if len(candidates) != 1:
        return {**result, "message": "A newer release exists, but its in-app update package is not available for this platform yet. You can view the release on GitHub."}
    metadata = github_json(asset_url(candidates[0], tag))
    if not isinstance(metadata, dict) or metadata.get("schema") != SCHEMA or metadata.get("platform") != key or metadata.get("version") != version:
        raise ValueError("The release update metadata is incompatible or mismatched.")
    if type(metadata.get("minimum_updater")) is not int or metadata["minimum_updater"] > UPDATER_VERSION:
        raise ValueError("This release requires a newer updater. Install it manually from GitHub.")
    if version_tuple(metadata.get("minimum_app_version")) > version_tuple(current_version):
        raise ValueError("This release requires an intermediate application version. See its release notes.")
    for field, maximum in (("size", MAX_PACKAGE), ("unpacked_size", MAX_UNPACKED)):
        if type(metadata.get(field)) is not int or not 0 < metadata[field] <= maximum:
            raise ValueError("The update package size is invalid.")
    if not re.fullmatch(r"[a-f0-9]{64}", str(metadata.get("sha256", ""))):
        raise ValueError("The update has no valid SHA-256 checksum.")
    packages = [a for a in assets if a.get("name") == metadata.get("package")]
    if len(packages) != 1 or packages[0].get("size") != metadata["size"]:
        raise ValueError("The release package is missing or does not match its metadata.")
    package = packages[0]
    if package.get("digest") and package["digest"] != "sha256:" + metadata["sha256"]:
        raise ValueError("GitHub's package checksum does not match the update metadata.")
    return {**result, "available": True, "message": "Ready to download.", "metadata": metadata, "url": asset_url(package, tag)}


def download_update(release, destination, progress=lambda **values: None):
    metadata = release["metadata"]
    digest, total = hashlib.sha256(), 0
    try:
        with github_open(release["url"]) as response, Path(destination).open("xb") as output:
            for chunk in iter(lambda: response.read(CHUNK), b""):
                total += len(chunk)
                if total > metadata["size"]:
                    raise ValueError("The update download is larger than expected.")
                output.write(chunk)
                digest.update(chunk)
                progress(completed_bytes=total, total_bytes=metadata["size"])
            output.flush()
            os.fsync(output.fileno())
        if total != metadata["size"] or digest.hexdigest() != metadata["sha256"]:
            raise ValueError("The update download is incomplete or its checksum failed. Try downloading again.")
    except Exception:
        Path(destination).unlink(missing_ok=True)
        raise


def extract_update(archive_path, destination, metadata):
    """Extract regular files first, then confined links; never follow archive links."""
    destination = Path(destination)
    destination.mkdir()
    seen, links, total = set(), [], 0
    def consume(name, size, mode, stream=None, target=None, directory=False):
        nonlocal total
        name = name.rstrip("/")
        if name == "Deckadence" and directory:
            return
        if not name.startswith("Deckadence/"):
            raise ValueError("The package does not have the expected Deckadence folder.")
        name = name[len("Deckadence/"):]
        safe_path(name)
        if name.casefold() in seen or len(seen) > 100000:
            raise ValueError("The package has duplicate or excessive entries.")
        seen.add(name.casefold())
        total += size
        if total > metadata["unpacked_size"] + MAX_METADATA or size < 0:
            raise ValueError("The expanded update is larger than expected.")
        path = destination / name
        if directory:
            disk_path(path).mkdir(parents=True, exist_ok=True)
        elif target is not None:
            safe_link(name, target)
            if os.name == "nt":
                raise ValueError("Windows update packages cannot contain symbolic links.")
            links.append((name, target))
        else:
            disk_path(path.parent).mkdir(parents=True, exist_ok=True)
            with disk_path(path).open("xb") as output:
                shutil.copyfileobj(stream, output, CHUNK)
            if os.name != "nt":
                os.chmod(path, mode & 0o777)
    if zipfile.is_zipfile(archive_path):
        with zipfile.ZipFile(archive_path) as archive:
            for info in archive.infolist():
                if "\\" in info.orig_filename:
                    raise ValueError("Unsafe path in update ZIP.")
                mode = info.external_attr >> 16
                if stat.S_ISLNK(mode):
                    if info.file_size > 4096:
                        raise ValueError("Invalid archive symbolic link.")
                    consume(info.filename, info.file_size, mode, target=archive.read(info).decode("utf-8"))
                elif stat.S_IFMT(mode) not in {0, stat.S_IFREG, stat.S_IFDIR}:
                    raise ValueError("Unsupported file type in update ZIP.")
                else:
                    with archive.open(info) as stream:
                        consume(info.filename, info.file_size, mode or 0o644, stream=stream, directory=info.is_dir())
    else:
        with tarfile.open(archive_path, "r:gz") as archive:
            for info in archive:
                if not (info.isfile() or info.isdir() or info.issym()):
                    raise ValueError("Unsupported file type in update tar archive.")
                stream = archive.extractfile(info) if info.isfile() else None
                try:
                    consume(info.name, info.size, info.mode, stream=stream, target=info.linkname if info.issym() else None, directory=info.isdir())
                finally:
                    if stream:
                        stream.close()
    link_names = {name for name, _ in links}
    for name, target in links:
        if any(str(parent) in link_names for parent in PurePosixPath(name).parents):
            raise ValueError("An archive link cannot be another link's parent.")
        path = destination / name
        disk_path(path.parent).mkdir(parents=True, exist_ok=True)
        os.symlink(target, path)
    document = validate_install(read_json(destination / INSTALL_MANIFEST), metadata["platform"], metadata["version"])
    return document


def workspace(root):
    root = Path(root).resolve()
    work = root / WORK_NAME
    if work.exists() and is_link(work):
        raise ValueError("The update workspace cannot be a link.")
    work.mkdir(exist_ok=True)
    return work


def remove_owned(path, parent):
    """Delete only a direct, validated child of a directory we own."""
    path, parent = Path(path), Path(parent).resolve()
    if path.parent.resolve() != parent or path.name in {"", ".", ".."}:
        raise ValueError("Unsafe update cleanup path.")
    if not path.exists() and not path.is_symlink():
        return
    if is_link(path):
        raise ValueError("An update directory was replaced with a link.")
    if path.is_dir():
        shutil.rmtree(disk_path(path))
    else:
        disk_path(path).unlink()


@contextmanager
def operation_lock(work):
    with (work / "operation.lock").open("a+b") as handle:
        if not handle.tell():
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
            raise ValueError("An update is already running. Wait for it to finish.") from error
        try:
            yield
        finally:
            if os.name == "nt":
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def transaction(work):
    state = read_json(work / "transaction.json")
    if not isinstance(state, dict) or state.get("schema") != SCHEMA or not re.fullmatch(r"[a-f0-9]{32}", str(state.get("id", ""))):
        raise ValueError("Invalid update recovery journal.")
    for key in ("old", "new"):
        validate_install(state.get(key))
    if state["old"]["platform"] != state["new"]["platform"]:
        raise ValueError("Invalid recovery platform.")
    if not re.fullmatch(r"[a-f0-9]{64}", str(state.get("token", ""))):
        raise ValueError("Invalid update startup token.")
    return state


def pid_alive(pid):
    if type(pid) is not int or pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = kernel.OpenProcess(0x00100000, False, pid)
        if not handle:
            return ctypes.get_last_error() == 5
        try:
            return kernel.WaitForSingleObject(handle, 0) == 258
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def wait_for_exit(pid, timeout=90):
    deadline = time.monotonic() + timeout
    while pid_alive(pid):
        if time.monotonic() >= deadline:
            raise ValueError("Deckadence did not close in time. Close it and run its Start launcher to recover.")
        time.sleep(0.2)


def launch_options(application=False):
    if os.name == "nt":
        window = subprocess.CREATE_NEW_CONSOLE if application else subprocess.CREATE_NO_WINDOW
        return {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP | window}
    return {"start_new_session": True}


def launch_app(root, work, state=None):
    environment = os.environ.copy()
    for key in ("DECKADENCE_UPDATE_TOKEN", "DECKADENCE_UPDATE_HELPER", "_PYI_APPLICATION_HOME_DIR", "_PYI_ARCHIVE_FILE", "_PYI_PARENT_PROCESS_LEVEL"):
        environment.pop(key, None)
    environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    environment["DECKADENCE_SERVER_PORT"] = str(state.get("port", resolve_server_port(root)) if state else resolve_server_port(root))
    if state:
        environment["DECKADENCE_UPDATE_TOKEN"] = state["token"]
        environment["DECKADENCE_UPDATE_HELPER"] = str(os.getpid())
    with (work / "startup.log").open("ab") as log:
        return subprocess.Popen([str(root / executable_name())], cwd=root, env=environment,
                                stdin=subprocess.DEVNULL, stdout=log, stderr=log, **launch_options(application=True))


def startup_pending(root):
    return (Path(root) / WORK_NAME / "transaction.json").exists()


def guard_startup():
    """Called before application imports can open/migrate the user's database."""
    if not getattr(sys, "frozen", False):
        return
    root = Path(sys.executable).resolve().parent
    path = root / WORK_NAME / "transaction.json"
    token = os.environ.get("DECKADENCE_UPDATE_TOKEN")
    if not path.exists():
        if token:
            raise SystemExit("The update was cancelled. Start Deckadence using its normal launcher.")
        return
    state = transaction(workspace(root))
    if state.get("phase") != "testing" or not token or token != state["token"]:
        raise SystemExit("An update needs to finish or recover. Run Start_Deckadence from this folder.")
    helper_pid = int(os.environ.get("DECKADENCE_UPDATE_HELPER", "0"))
    if not pid_alive(helper_pid):
        raise SystemExit("The update helper stopped. Run Start_Deckadence to recover.")
    # If the helper is interrupted, release executable/database locks even when
    # startup is still performing migrations. The helper's snapshot is durable.
    import threading
    def watch_helper():
        while path.exists():
            if not pid_alive(helper_pid):
                # Commit deletes the journal before the helper exits. Recheck
                # after observing its exit so that race cannot kill a healthy
                # newly updated app (or a later update's process).
                try:
                    current = read_json(path)
                except FileNotFoundError:
                    return
                if current.get("id") != state["id"]:
                    return
                os._exit(76)
            time.sleep(0.5)
    threading.Thread(target=watch_helper, name="update-startup-lease", daemon=True).start()


def snapshot_data(root, work, state):
    saved = work / "saved-data"
    saved.mkdir()
    state["data_existed"] = {}
    for name in ("cards.db", "settings.json"):
        source = root / name
        state["data_existed"][name] = source.exists()
        if not source.exists():
            continue
        if is_link(source):
            raise ValueError("The database/settings must be regular files for automatic recovery.")
        if name == "cards.db":
            with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as database, closing(sqlite3.connect(saved / name)) as backup:
                database.backup(backup)
        else:
            shutil.copy2(source, saved / name)
        with (saved / name).open("r+b") as stream:
            os.fsync(stream.fileno())
    state["snapshot_ready"] = True
    write_json(work / "transaction.json", state)


def restore_data(root, work, state):
    if not state.get("snapshot_ready"):
        return
    for name in ("cards.db", "settings.json"):
        target = root / name
        if state["data_existed"][name]:
            saved = work / "saved-data" / name
            if not saved.is_file() or is_link(saved):
                raise ValueError("A recovery snapshot is missing. Keep this folder intact for manual recovery.")
            temporary = root / (name + ".update-restore")
            shutil.copy2(saved, temporary)
            os.replace(temporary, target)
        else:
            target.unlink(missing_ok=True)
        if name == "cards.db":
            for suffix in ("-wal", "-shm", "-journal"):
                (root / (name + suffix)).unlink(missing_ok=True)


def rollback(root, work, state, message):
    # A failed snapshot has not touched application files. Keep that distinction
    # in the journal so recovery itself can also be interrupted and retried.
    state.setdefault("swap_started", state.get("phase") != "prepared")
    state["phase"] = "rolling_back"
    write_json(work / "transaction.json", state)
    backup = work / "previous-app"
    roots = set(state["old"]["roots"]) | set(state["new"]["roots"])
    existing = set(state.get("existing_roots", state["old"]["roots"]))
    if state["swap_started"]:
        for name in sorted(roots):
            target, original = root / name, backup / name
            if original.exists() or original.is_symlink():
                remove_owned(target, root)
                os.replace(original, target)
            elif name not in existing:
                remove_owned(target, root)
    restore_data(root, work, state)
    record_update_event(root, "rollback", message)
    write_json(work / "last-result.json", {"state": "failed", "version": state["old"]["version"],
               "message": "Update did not complete; the previous version and database were restored. " + message})
    (work / "transaction.json").unlink()


def healthy(state, port):
    request = urllib.request.Request(f"http://127.0.0.1:{port}/maintenance/updates/health",
                                     headers={"X-Deckadence-Update-Token": state["token"]})
    # Never send the local startup token through a configured HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=2) as response:
            value = json.loads(response.read(4096))
        return value.get("ok") is True and value.get("version") == state["new"]["version"]
    except (OSError, ValueError):
        return False


def apply_update(root, parent_pid, port=APP_SERVER_PORT):
    root = Path(root).resolve()
    work = workspace(root)
    state = transaction(work)
    state["port"] = port
    write_json(work / "transaction.json", state)
    write_json(work / "server-port.json", {"port": port})
    write_json(work / "helper-ready.json", {"id": state["id"], "pid": os.getpid()})
    wait_for_exit(parent_pid)
    with operation_lock(work):
        state = transaction(work)
        if state.get("phase") != "prepared":
            raise ValueError("This update needs recovery before another install attempt.")
        child = None
        try:
            staged = work / "staged"
            preserve_local_files(root, work, state)
            database_size = (root / "cards.db").stat().st_size if (root / "cards.db").exists() else 0
            check_space(root, database_size * 2 + 64 * CHUNK)
            snapshot_data(root, work, state)
            backup = work / "previous-app"
            backup.mkdir()
            roots = sorted(set(state["old"]["roots"]) | set(state["new"]["roots"]))
            state["existing_roots"] = [name for name in roots if (root / name).exists() or (root / name).is_symlink()]
            state["swap_started"] = True
            state["phase"] = "swapping"
            write_json(work / "transaction.json", state)
            for name in roots:
                if (root / name).exists():
                    if is_link(root / name):
                        raise ValueError("An application directory cannot be a symbolic link.")
                    os.replace(root / name, backup / name)
                if name in state["new"]["roots"]:
                    os.replace(staged / name, root / name)
            restore_local_files(root, work, state)
            state["phase"] = "testing"
            write_json(work / "transaction.json", state)
            child = launch_app(root, work, state)
            state["child_pid"] = child.pid
            write_json(work / "transaction.json", state)
            deadline = time.monotonic() + 120
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise ValueError("The new version exited during startup.")
                if healthy(state, port):
                    message = f"Updated successfully to Deckadence {state['new']['version']}."
                    if state.get("preserved_conflicts"):
                        message += f" Local files replaced by release files were preserved in {WORK_NAME}/preserved-files/{state['id']}."
                    write_json(work / "last-result.json", {"state": "complete", "version": state["new"]["version"],
                               "message": message, "preserved_conflicts": state.get("preserved_conflicts", [])})
                    # Removing the journal releases the new application's gate.
                    (work / "transaction.json").unlink()
                    record_update_event(root, "complete", f"Updated to {state['new']['version']}.")
                    return
                time.sleep(0.5)
            raise ValueError("The new version did not finish starting within two minutes.")
        except Exception as error:
            record_update_event(root, "install", error, error=True)
            if child is not None and child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=15)
            rollback(root, work, state, str(error))
            launch_app(root, work)


def recover_update(root):
    root = Path(root).resolve()
    work = workspace(root)
    with operation_lock(work):
        if not (work / "transaction.json").exists():
            return
        state = transaction(work)
        # A new version whose helper died will exit via guard_startup's lease.
        if state.get("child_pid"):
            wait_for_exit(state["child_pid"], timeout=30)
        time.sleep(1)
        rollback(root, work, state, "Recovered an interrupted update.")


def prepare_workspace(root):
    work = workspace(root)
    with operation_lock(work):
        if (work / "transaction.json").exists():
            raise ValueError("An earlier update needs recovery. Run the Start_Deckadence launcher first.")
        for name in ("staged", "previous-app", "saved-data", "download", "helper-ready.json", "helper-error.json"):
            remove_owned(work / name, work)
    return work


def stage_transaction(root, old, new):
    root = Path(root).resolve()
    work = workspace(root)
    state = {"schema": SCHEMA, "id": uuid.uuid4().hex, "token": uuid.uuid4().hex + uuid.uuid4().hex,
             "phase": "prepared", "old": old, "new": new}
    write_json(work / "transaction.json", state)
    return state


def main():
    parser = argparse.ArgumentParser(description="Deckadence release packager and update recovery helper")
    commands = parser.add_subparsers(dest="command", required=True)
    package = commands.add_parser("package")
    package.add_argument("--root", required=True)
    package.add_argument("--output", required=True)
    package.add_argument("--version", required=True)
    package.add_argument("--platform", required=True)
    apply = commands.add_parser("apply")
    apply.add_argument("--root", required=True)
    apply.add_argument("--parent", type=int, required=True)
    apply.add_argument("--port", type=int, default=APP_SERVER_PORT)
    recover = commands.add_parser("recover")
    recover.add_argument("--root", required=True)
    open_browser = commands.add_parser("open")
    open_browser.add_argument("--root", required=True)
    args = parser.parse_args()
    try:
        if args.command == "package":
            print(json.dumps(package_release(args.root, args.output, args.version, args.platform), indent=2))
        elif args.command == "apply":
            apply_update(args.root, args.parent, args.port)
        elif args.command == "open":
            import webbrowser
            webbrowser.open(f"http://127.0.0.1:{resolve_server_port(args.root)}")
        else:
            recover_update(args.root)
    except Exception as error:
        if args.command in {"apply", "recover"}:
            record_update_event(args.root, args.command, error, error=True)
            try:
                write_json(workspace(args.root) / "helper-error.json", {"message": str(error)})
            except OSError:
                pass
        print(f"Deckadence update: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

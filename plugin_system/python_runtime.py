"""Install Studio's private Python without depending on the user's PATH.

Pinned python-build-standalone install_only distributions, including their
license notices: https://github.com/astral-sh/python-build-standalone
Only explicit Studio setup calls this module; startup/status checks do not.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import subprocess
import sys
import tarfile
import tempfile
import threading
import time

import requests

from download_identity import get_download_user_agent


VERSION = '3.12.15'
RELEASE = '20261021'
ASSETS = {
    ('win32', 'x86_64'): ('x86_64-pc-windows-msvc', 46388793, 'be7f14464d1d66f84429ad27e01f6d1482963afff64a2fb5256b2a51c7b5d398'),
    ('linux', 'x86_64'): ('x86_64-unknown-linux-gnu', 67908973, '5ff9f0602ce964a529ed1e8555d3abab6341926d724402ba9a15e9e877191124'),
    ('darwin', 'arm64'): ('aarch64-apple-darwin', 25158763, 'a18cc33862b53bd54a148c710def5375c1b47470cccedf817a19c2d211764584'),
    ('darwin', 'x86_64'): ('x86_64-apple-darwin', 24858259, '869e0b30959beccc616ce14907439f4d0b3170c5830a2362dade07f07b0ed3b8'),
}
_lock = threading.Lock()


def architecture():
    machine = platform.machine().lower()
    return {'amd64': 'x86_64', 'aarch64': 'arm64'}.get(machine, machine)


def validate_python(command, environment=None, *, private_root=None, require_minor=None):
    """Require working 64-bit Python with SSL and venv, not just --version."""
    probe = (
        'import sys,struct,ssl,ensurepip,venv,json,platform;'
        'print(json.dumps(dict(version=list(sys.version_info[:2]),bits=struct.calcsize("P")*8,'
        'prefix=sys.prefix,base_prefix=sys.base_prefix,machine=platform.machine().lower())))'
    )
    result = subprocess.run([*map(str, command), '-I', '-B', '-c', probe],
                            capture_output=True, text=True, timeout=30, env=environment,
                            **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}))
    try:
        info = json.loads(result.stdout)
        minor = tuple(info['version'])
        valid = result.returncode == 0 and info['bits'] == 64 and (3, 10) <= minor < (3, 14)
        if require_minor is not None:
            valid = valid and minor == require_minor
        if private_root is not None:
            root = Path(private_root).resolve()
            actual_arch = {'amd64': 'x86_64', 'aarch64': 'arm64'}.get(info['machine'], info['machine'])
            valid = valid and actual_arch == architecture() and Path(info['prefix']).resolve() == root and Path(info['base_prefix']).resolve() == root
        if valid:
            return
    except (ValueError, KeyError, TypeError):
        pass
    required = '.'.join(map(str, require_minor)) if require_minor else '3.10–3.13'
    raise RuntimeError('Studio requires working 64-bit Python ' + required + ' with SSL and virtual-environment support.')


def _cancelled(cancel):
    if cancel is not None and cancel.is_set():
        raise RuntimeError('Python setup cancelled.')


def _extract(archive_path, destination, cancel):
    if not hasattr(tarfile, 'data_filter'):
        raise RuntimeError('Update Deckadence to safely install its private Python runtime.')
    with tarfile.open(archive_path, 'r:gz') as archive:
        total = count = 0
        for member in archive:
            _cancelled(cancel)
            parts = PurePosixPath(member.name).parts
            if not parts or parts[0] != 'python' or '..' in parts or '\\' in member.name:
                raise RuntimeError('The Python package contains an invalid path.')
            # Unneeded terminal database aliases can link outside the archive.
            if member.name.startswith('python/share/terminfo/'):
                continue
            total += max(0, member.size)
            count += 1
            if total > 2 * 1024**3 or count > 100000:
                raise RuntimeError('The Python package exceeds its extraction limit.')
            archive.extract(member, destination, filter='data')


def ensure_python(cache, *, environment=None, cancel=None, progress=None):
    """Return a verified shared interpreter; failed setup leaves no partial install."""
    _cancelled(cancel)
    key = (sys.platform, architecture())
    if key not in ASSETS:
        raise RuntimeError('Private Studio Python is available for Windows/Linux x86-64 and macOS Intel/Apple Silicon.')
    triple, expected_size, expected_digest = ASSETS[key]
    folder = Path(cache).resolve() / f'cpython-{VERSION}-{triple}'
    target = folder / 'python'
    relative = Path('python.exe') if sys.platform == 'win32' else Path('bin/python3.12')
    executable = target / relative
    report = progress or (lambda *_: None)
    while not _lock.acquire(timeout=.2):
        _cancelled(cancel)
    try:
        _cancelled(cancel)
        if target.is_symlink():
            raise RuntimeError('The private Python folder must not be a symbolic link.')
        if executable.is_file():
            try:
                validate_python([executable], environment, private_root=target, require_minor=(3, 12))
                return str(executable)
            except (RuntimeError, OSError, subprocess.SubprocessError):
                report('Preparing Python', 'Repairing the private Python runtime.')
        folder.mkdir(parents=True, exist_ok=True)
        url = (f'https://github.com/astral-sh/python-build-standalone/releases/download/{RELEASE}/'
               f'cpython-{VERSION}%2B{RELEASE}-{triple}-install_only.tar.gz')
        with tempfile.TemporaryDirectory(prefix='setup-', dir=folder) as temporary:
            staging = Path(temporary)
            archive_path = staging / 'python.tar.gz'
            report('Downloading Python', 'Downloading Studio’s private Python runtime; no separate Python installation is needed.')
            digest = hashlib.sha256()
            received = 0
            deadline = time.monotonic() + 600
            try:
                with requests.get(url, stream=True, timeout=(15, 15), headers={'User-Agent': get_download_user_agent()}) as response:
                    response.raise_for_status()
                    with archive_path.open('wb') as output:
                        for chunk in response.iter_content(1024 * 1024):
                            _cancelled(cancel)
                            if time.monotonic() > deadline:
                                raise RuntimeError('Python download took too long. Retry Studio setup.')
                            received += len(chunk)
                            if received > expected_size:
                                raise RuntimeError('The Python download is larger than expected.')
                            output.write(chunk)
                            digest.update(chunk)
            except requests.RequestException as exc:
                raise RuntimeError('Could not download Studio’s private Python. Check the connection and retry setup.') from exc
            if received != expected_size or digest.hexdigest() != expected_digest:
                raise RuntimeError('Python download verification failed. Retry Studio setup.')
            report('Preparing Python', 'Verifying and preparing Studio’s private Python runtime.')
            _extract(archive_path, staging, cancel)
            prepared = staging / 'python'
            validate_python([prepared / relative], environment, private_root=prepared, require_minor=(3, 12))
            _cancelled(cancel)
            # Preserve an invalid previous install until its replacement is usable.
            backup = staging / 'previous'
            if target.exists():
                target.rename(backup)
            try:
                prepared.rename(target)
            except OSError:
                if backup.exists():
                    backup.rename(target)
                raise
        return str(executable)
    finally:
        _lock.release()

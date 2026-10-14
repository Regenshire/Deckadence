"""Add a private, relocatable CPython runtime to a plugin release.

Build input: a python-build-standalone Windows or Linux x64 install_only directory,
not a virtual environment or Conda installation. Dependencies and models are
downloaded by Deckadence when the user installs this plugin.
"""
import argparse
import hashlib
import json
import platform
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request


def prepare_runtime(cache):
    """Fetch the small standalone interpreter once, using the build's Python."""
    cache = Path(cache).resolve()
    runtime = cache / "python"
    linux = sys.platform == "linux"
    if linux and platform.machine().lower() not in {"x86_64", "amd64"}:
        raise RuntimeError("Linux addon builds currently require x86-64.")
    executable = "bin/python3.12" if linux else "python.exe"
    if (runtime / executable).is_file():
        return runtime
    cache.mkdir(parents=True, exist_ok=True)
    print("Downloading Python for the addon packages (first build only)...", file=sys.stderr)
    request = urllib.request.Request(
        "https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest",
        headers={"User-Agent": "Deckadence-release-builder"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        release = json.load(response)
    candidates = [asset for asset in release["assets"]
                  if asset["name"].startswith("cpython-3.12.")
                  and asset["name"].endswith(
                      "-x86_64-unknown-linux-gnu-install_only.tar.gz" if linux
                      else "-x86_64-pc-windows-msvc-install_only.tar.gz")]
    if len(candidates) != 1:
        raise RuntimeError("Could not find the platform's Python 3.12 download in the upstream release.")
    asset = candidates[0]
    digest = asset.get("digest", "") or ""
    if not digest.startswith("sha256:"):
        raise RuntimeError("The Python download is missing its SHA-256 checksum.")
    with tempfile.TemporaryDirectory(prefix="download-", dir=cache) as staging:
        archive_path = Path(staging) / "python.tar.gz"
        checksum = hashlib.sha256()
        with urllib.request.urlopen(asset["browser_download_url"], timeout=120) as response, archive_path.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                checksum.update(chunk)
                output.write(chunk)
        if checksum.hexdigest() != digest.split(":", 1)[1]:
            raise RuntimeError("Python download was incomplete or damaged. Run the build again.")
        with tarfile.open(archive_path, "r:gz") as archive:
            # Terminal database aliases are unnecessary for this headless
            # runtime and can contain links rejected by the safe data filter.
            members = [member for member in archive.getmembers()
                       if not member.name.startswith("python/share/terminfo/")]
            archive.extractall(staging, members=members, filter="data")
        extracted = Path(staging) / "python"
        subprocess.run([str(extracted / executable), "-I", "-c",
                        "import ssl, ensurepip, venv"], check=True)
        extracted.rename(runtime)
    return runtime


def package_runtime(source, package):
    source = Path(source).resolve()
    package = Path(package).resolve()
    if source == package or source in package.parents or package in source.parents:
        raise ValueError("Python runtime and plugin package must be separate directories.")
    if (source / "pyvenv.cfg").exists() or (source / "conda-meta").exists():
        raise ValueError("Use a standalone Python runtime, not a venv or Conda environment.")
    linux = sys.platform == "linux"
    executable = "bin/python3.12" if linux else "python.exe"
    library = "lib/python3.12" if linux else "Lib"
    if not (source / library / "ensurepip").is_dir():
        raise ValueError("The standalone runtime must include ensurepip.")
    runtime = package / "runtime"
    shutil.copytree(source, runtime, ignore=shutil.ignore_patterns(
        "site-packages", "__pycache__", "*.pyc", "Scripts",
    ))
    # Verify the copied interpreter works independently of the build machine's
    # Python configuration before marking the package as self-contained.
    subprocess.run([
        str(runtime / executable), "-I", "-c",
        "import sys, struct, ssl, ensurepip, venv; from pathlib import Path; "
        "assert sys.version_info[:2] == (3, 12); "
        "assert struct.calcsize('P') == 8; "
        "assert sys.prefix == sys.base_prefix; "
        "assert Path(sys.prefix).resolve() == Path(sys.argv[1]).resolve()",
        str(runtime),
    ], check=True)
    manifest_path = package / "deckadence-plugin.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    manifest["bundled_runtime"] = True
    manifest["runtime_platform"] = "linux" if linux else "win32"
    manifest["runtime_arch"] = "x86_64"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", nargs="?")
    parser.add_argument("package", nargs="?")
    parser.add_argument("--prepare", metavar="CACHE")
    args = parser.parse_args()
    if args.prepare:
        print(prepare_runtime(args.prepare))
    elif args.source and args.package:
        package_runtime(args.source, args.package)
    else:
        parser.error("Provide source and package, or --prepare CACHE.")

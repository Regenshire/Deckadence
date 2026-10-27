"""Build the portable MPCFill Browser distribution using only Python 3.10+.

Like the Card Finishing Studio builder, this produces a verified ZIP and
checksum without installing anything. MPCFill's implementation ships in the
matching Deckadence application; Plugin Manager installs the bundled manifest.
"""
import argparse
import ast
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import platform
import re
import shutil
import sys
import tempfile
import zipfile


PLUGIN_ID = "mpcfill-browser"
ASSET_NAME = "deckadence-mpcfill-browser.zip"
REQUIRED = {"deckadence-plugin.json", "README.md", "LICENSE.txt"}
APPLICATION_FILES = (
    "settings.py", "app.py", "plugin_system/catalog.py", "plugin_system/manager.py",
    "plugin_system/mpcfill.py", "plugin_system/mpcfill_adapter.py",
    "plugin_system/mpcfill_batch.py", "plugin_system/mpcfill_selection.py",
    "static/js/mpcfill_browser.js", "static/js/mpcfill_batch.js",
    "static/css/mpcfill_browser.css", "static/css/mpcfill_batch.css",
    "templates/_mpcfill_browser.html", "templates/_mpcfill_batch.html",
)
VERSION_PATTERN = r"[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?"


def source_files(source):
    """An explicit allowlist keeps local environments, caches and artwork out."""
    source = Path(source).resolve()
    files = {}
    for name in sorted(REQUIRED):
        path = source / name
        if not path.is_file() or path.is_symlink() or path.resolve().parent != source:
            raise ValueError(f"Required plugin file must be a regular file inside the plugin: {path}")
        files[name] = path
    return files


def validate_package(source):
    files = source_files(source)
    manifest = json.loads(files["deckadence-plugin.json"].read_text(encoding="utf-8-sig"))
    expected = dict(schema_version=1, protocol_version=1, plugin_id=PLUGIN_ID,
                    plugin_type="image_browser", name="MPCFill Browser", runtime="application")
    if not isinstance(manifest, dict) or any(manifest.get(key) != value for key, value in expected.items()):
        raise ValueError("Invalid MPCFill Browser application-runtime manifest.")
    if not re.fullmatch(VERSION_PATTERN, str(manifest.get("version", ""))):
        raise ValueError("The plugin manifest needs a valid release version.")
    if any(manifest.get(key) for key in ("entrypoint", "requirements_file", "bundled_runtime")):
        raise ValueError("MPCFill uses Deckadence's runtime; do not package a separate entrypoint or dependencies.")
    for name in ("README.md", "LICENSE.txt"):
        if not files[name].read_text(encoding="utf-8-sig").strip():
            raise ValueError(f"The plugin's {name} is empty.")
    return manifest, files


def validate_application(root):
    """Check the companion app without importing it or accessing user data."""
    hashes = {}
    for name in APPLICATION_FILES:
        path = root / name
        if not path.is_file():
            raise ValueError(f"Required companion application file is missing: {name}")
        content = path.read_bytes()
        if path.suffix == ".py":
            compile(content, name, "exec")
        hashes[name] = hashlib.sha256(content).hexdigest()
    settings = ast.parse((root / "settings.py").read_bytes())
    for node in settings.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "APP_VERSION" for t in node.targets):
            version = ast.literal_eval(node.value)
            if isinstance(version, str) and re.fullmatch(VERSION_PATTERN, version):
                return version, hashes
    raise ValueError("settings.py must define a valid APP_VERSION.")


def build(root, output_dir, check_only=False):
    root = Path(root).resolve()
    print("[1/4] Validating MPCFill Browser and its companion application...", flush=True)
    manifest, files = validate_package(root / "plugin_src" / PLUGIN_ID)
    app_version, application_hashes = validate_application(root)
    version = manifest["version"]
    release_tag = f"plugin-mpcfill-browser-v{version}"
    release_title = f"Deckadence MPCFill Browser v{version}"
    print(f"      MPCFill Browser v{version} / Deckadence v{app_version}", flush=True)
    if check_only:
        print("Validation passed. No archive created or dependencies downloaded.")
        print(f"\nGitHub tag:\n  {release_tag}\n\nGitHub release title:\n  {release_title}", flush=True)
        return
    output_dir = Path(output_dir).resolve()
    for protected in (root / "plugin_src", root / "plugins", root / "data", root / "static", root / "templates"):
        if output_dir == protected.resolve() or protected.resolve() in output_dir.parents:
            raise ValueError(f"Output directory must be outside source and runtime data: {output_dir}")
    work = root / ".dev_prompts/ai_work/build/mpcfill-browser"
    work.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="release-", dir=work) as temporary:
        run = Path(temporary)
        package = run / PLUGIN_ID
        package.mkdir()
        print("[2/4] Staging the manifest, installation guide, and license...", flush=True)
        for name, path in files.items():
            shutil.copyfile(path, package / name)
        staged_manifest, staged_files = validate_package(package)
        if staged_manifest != manifest:
            raise ValueError("Plugin manifest changed during the build. Save changes and retry.")
        hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in staged_files.items()}
        info = dict(plugin_id=PLUGIN_ID, version=version, package_type="application-plugin",
                    application_version=app_version, requires_matching_application=True,
                    target_platforms=["win32", "linux", "darwin"], runtime="application",
                    bundled_runtime=False, bundled_models=False,
                    built_at=datetime.now(timezone.utc).isoformat(), build_platform=platform.platform(),
                    build_python=platform.python_version(), files=hashes,
                    companion_application_files=application_hashes)
        (package / "BUILD_INFO.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
        archive = run / ASSET_NAME
        print("[3/4] Creating and verifying the distribution ZIP...", flush=True)
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            for path in sorted(package.iterdir(), key=lambda item: item.name):
                entry = zipfile.ZipInfo(path.name, (2020, 1, 1, 0, 0, 0))
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                entry.compress_type = zipfile.ZIP_DEFLATED
                output.writestr(entry, path.read_bytes())
        with zipfile.ZipFile(archive) as output:
            if output.testzip() or set(output.namelist()) != set(hashes) | {"BUILD_INFO.json"}:
                raise ValueError("Archive verification failed.")
            for name, expected in hashes.items():
                if hashlib.sha256(output.read(name)).hexdigest() != expected:
                    raise ValueError(f"Archive content verification failed: {name}")
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        # Stage on the output filesystem; failed validation leaves the old ZIP intact.
        with tempfile.TemporaryDirectory(prefix=".mpcfill-release-", dir=output_dir) as publishing:
            pending = Path(publishing) / ASSET_NAME
            shutil.copyfile(archive, pending)
            checksum = pending.with_suffix(".zip.sha256")
            checksum.write_text(f"{digest}  {ASSET_NAME}\n", encoding="ascii")
            pending.replace(output_dir / ASSET_NAME)
            checksum.replace(output_dir / checksum.name)
    print("[4/4] Build complete.\n", flush=True)
    print(f"Plugin: MPCFill Browser\nVersion: {version}\nCompanion app: Deckadence v{app_version}")
    print(f"Release ZIP: {output_dir / ASSET_NAME}\nSHA-256: {digest}")
    print("\nShip the matching Deckadence app: MPCFill code and UI are bundled there.")
    print("Users install/update through Settings > Plugins. This ZIP does not update the app.")
    print("\n========================================\n       GITHUB RELEASE DETAILS\n========================================")
    print(f"\nGitHub tag:\n  {release_tag}\n\nGitHub release title:\n  {release_title}")
    print(f"\nRelease assets:\n  {ASSET_NAME}\n  {ASSET_NAME}.sha256\n", flush=True)
    print("Keep the Deckadence app release marked Latest; do not mark this plugin release Latest.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    root = Path(__file__).resolve().parent.parent
    parser.add_argument("--output-dir", type=Path, default=root / "dist")
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    if sys.version_info < (3, 10):
        parser.error("Python 3.10 or newer is required.")
    sys.dont_write_bytecode = True
    try:
        build(root, args.output_dir, args.check_only)
    except (OSError, ValueError, KeyError, TypeError, SyntaxError) as exc:
        parser.exit(1, f"MPCFill Browser build failed: {exc}\n")


if __name__ == "__main__":
    main()

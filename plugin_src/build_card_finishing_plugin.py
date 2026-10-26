"""Build the portable Card Finishing Studio source distribution (no model downloads).

Called by .dev_prompts/build_Deckadence_studio.ps1 on Windows,
Linux, macOS, or WSL. Can also be run directly with Python 3.10+ on these platforms.
The app owns installation of Python dependencies and optional model packages.
"""
import argparse
import hashlib
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path
import platform
import re
import shutil
import sys
import tempfile
import zipfile


PLUGIN_ID = "card-finishing-studio"
ASSET_NAME = "deckadence-card-finishing-studio.zip"
REQUIRED = {
    "deckadence-plugin.json", "plugin.py", "requirements.txt",
    "frame_detection.py", "text_detection.py", "text_repair.py",
    "generation_worker.py", "generation_runtime.py", "generation_dependencies.py", "generation_storage.py",
    "generation_models.json", "generation_packages.json", "generation_prompts.json",
    "generation_analyzer.json", "generation_outpaint.json",
    "NOTICE.txt", "LICENSE-IS-Net.txt", "LICENSE-rembg.txt", "LICENSE-SAM.txt",
    "prompter/__init__.py", "prompter/analysis.py", "prompter/contracts.py",
    "prompter/compiler.py", "prompter/dictionary.py", "prompter/preparation.py",
    "prompter/diagnostics.py", "prompter/mirror.py", "prompter/color_reference.py",
    "prompter/color_continuity.py", "prompter/targets.py",
    "prompter/hardware.py",
}
EXCLUDED = {"__pycache__", "models", "runtime", "runtimes", "venv", "tests"}


def source_files(source):
    """Include release sources, never local runtimes, weights, or user overrides."""
    files = {}
    for path in sorted(source.rglob("*"), key=lambda item: item.relative_to(source).as_posix()):
        relative = path.relative_to(source)
        if any(part.startswith(".") or part.lower() in EXCLUDED for part in relative.parts):
            continue
        if path.name in {"ai_prompt_dictionary.json", "BUILD_INFO.json"}:
            continue
        if path.suffix.lower() not in {".py", ".json", ".txt", ".md"} or not path.is_file():
            continue
        if path.is_symlink() or source.resolve() not in path.resolve().parents:
            raise ValueError(f"Release source must be a regular file inside the plugin: {path}")
        files[relative.as_posix()] = path
    missing = REQUIRED - files.keys()
    if missing:
        raise ValueError("Required plugin files are missing: " + ", ".join(sorted(missing)))
    return files


def validate_package(source):
    files = source_files(source)
    documents = {}
    for name, path in files.items():
        if path.suffix == ".py":
            compile(path.read_bytes(), name, "exec")  # No imports, model loading, or .pyc files.
        elif path.suffix == ".json":
            documents[name] = json.loads(path.read_text(encoding="utf-8-sig"))
    manifest = documents["deckadence-plugin.json"]
    if (manifest.get("plugin_id") != PLUGIN_ID or manifest.get("plugin_type") != "card_finishing"
            or manifest.get("schema_version") != 1 or manifest.get("protocol_version") != 1
            or manifest.get("entrypoint") != "plugin.py"
            or manifest.get("requirements_file") != "requirements.txt"
            or not {"text", "subject", "frame"}.issubset(manifest.get("capabilities", []))):
        raise ValueError("Invalid Card Finishing Studio plugin manifest.")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?", str(manifest.get("version", ""))):
        raise ValueError("The plugin manifest needs a valid release version.")
    if manifest.get("bundled_runtime"):
        raise ValueError("This portable source build must not declare a bundled native runtime.")
    models = documents["generation_models.json"]
    catalog = documents["generation_packages.json"]
    packages = catalog["packages"]
    if catalog["default_package"] not in packages:
        raise ValueError("The default generation package is missing.")
    for key, package in packages.items():
        if package["provider"] not in catalog["providers"]:
            raise ValueError(f"Unknown provider in package {key}.")
        if catalog["providers"][package["provider"]]["kind"] == "local":
            if (not package["models"] or set(package["models"]) - models.keys()
                    or package["default_model"] not in package["models"]):
                raise ValueError(f"Unknown or missing models in package {key}.")
    if set(documents["generation_prompts.json"]["models"]) != set(models):
        raise ValueError("Prompt dictionary and generation model catalog disagree.")
    # Reuse the plugin's dependency-free validation for recipes and placeholders.
    name = "_studio_release_prompter"
    spec = importlib.util.spec_from_file_location(
        name, source / "prompter/__init__.py", submodule_search_locations=[str(source / "prompter")])
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
        dictionary = importlib.import_module(name + ".dictionary")
        dictionary.validate(documents["generation_prompts.json"])
    finally:
        for key in list(sys.modules):
            if key == name or key.startswith(name + "."):
                del sys.modules[key]
    return manifest, files


def build(root, output_dir, check_only=False):
    source = root / "plugin_src" / PLUGIN_ID
    print("[1/4] Validating plugin sources, prompt recipes, and package definitions...", flush=True)
    manifest, files = validate_package(source)
    version = manifest["version"]
    print(f"      {manifest['name']} v{version}: {len(files)} release source files", flush=True)
    if check_only:
        print("Validation passed. No archive created and no dependencies downloaded.")
        return
    output_dir = output_dir.resolve()
    # Never allow publishing into source or user/runtime data by mistake.
    for protected in (root / "plugin_src", root / "plugins", root / "data", root / "static"):
        if output_dir == protected.resolve() or protected.resolve() in output_dir.parents:
            raise ValueError(f"Output directory must be outside source and runtime data: {output_dir}")
    work = root / ".dev_prompts/ai_work/build/card-finishing-studio"
    work.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="release-", dir=work) as temporary:
        run = Path(temporary)
        package = run / PLUGIN_ID
        package.mkdir()
        print("[2/4] Staging the complete plugin and shipped configuration...", flush=True)
        for name, path in files.items():
            target = package / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        # Revalidate the exact snapshot that will be archived.
        staged_manifest, staged_files = validate_package(package)
        if staged_manifest != manifest:
            raise ValueError("Plugin manifest changed during the build. Save changes and retry.")
        hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in staged_files.items()}
        info = dict(plugin_id=PLUGIN_ID, version=version, package_type="portable-source",
                    target_platforms=["win32", "linux", "darwin"],
                    target_architectures={"win32": ["x86_64"], "linux": ["x86_64"], "darwin": ["arm64"]},
                    minimum_macos_version="14.0", bundled_runtime=False, bundled_models=False,
                    built_at=datetime.now(timezone.utc).isoformat(), build_platform=platform.platform(),
                    build_python=platform.python_version(), files=hashes)
        (package / "BUILD_INFO.json").write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
        archive = run / ASSET_NAME
        print("[3/4] Creating and checking the distribution ZIP...", flush=True)
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            for path in sorted(package.rglob("*"), key=lambda item: item.relative_to(package).as_posix()):
                if path.is_file():
                    entry = zipfile.ZipInfo(path.relative_to(package).as_posix(), (2020, 1, 1, 0, 0, 0))
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
        # Stage on the output filesystem; a failed build leaves the old ZIP intact.
        with tempfile.TemporaryDirectory(prefix=".studio-release-", dir=output_dir) as publishing:
            pending = Path(publishing) / ASSET_NAME
            shutil.copyfile(archive, pending)
            checksum = pending.with_suffix(".zip.sha256")
            checksum.write_text(f"{digest}  {ASSET_NAME}\n", encoding="ascii")
            pending.replace(output_dir / ASSET_NAME)
            checksum.replace(output_dir / checksum.name)
    print("[4/4] Build complete.\n", flush=True)
    result = output_dir / ASSET_NAME
    print(f"Plugin: {manifest['name']}\nVersion: {version}\nPlatforms: Windows / Linux / macOS Apple Silicon (same source ZIP)")
    print(f"Release ZIP: {result}\nZIP size: {result.stat().st_size / 1048576:.2f} MB")
    print(f"SHA-256: {digest}\nChecksum file: {result}.sha256")
    print(f"Suggested release tag: plugin-card-finishing-studio-v{version}")
    print(f"Release title: Card Finishing Studio v{version}\nAsset name: {ASSET_NAME}")
    print("Model weights and Python dependencies are installed through Deckadence Settings.")
    print("The app currently bundles this source; its install catalog is unchanged.")


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
    except (OSError, ValueError, KeyError, TypeError, SyntaxError, ImportError) as exc:
        parser.exit(1, f"Card Finishing Studio build failed: {exc}\n")


if __name__ == "__main__":
    main()

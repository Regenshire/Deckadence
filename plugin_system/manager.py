# *** PLUGIN MANAGER - Install, Remove, and Run Plugins ***
import atexit
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import threading
import zipfile

import requests

from download_identity import get_download_user_agent

from paths import (
    BUNDLE_BASE_DIR,
    PLUGIN_DOWNLOAD_DIR,
    PLUGIN_ROOT_DIR,
)

from plugin_system.catalog import (
    PLUGIN_CATALOG,
)


PLUGIN_MANIFEST_FILENAME = (
    "deckadence-plugin.json"
)

PLUGIN_INSTALL_STATUS = {}
PLUGIN_INSTALL_STATUS_LOCK = (
    threading.Lock()
)

PERSISTENT_PLUGIN_COMMANDS = {
    "upscale",
    "upscale_batch",
}

PLUGIN_WORKERS = {}
PLUGIN_WORKERS_LOCK = threading.Lock()

# Only built-in, first-party handlers may run inside Deckadence. A downloaded
# manifest cannot opt an arbitrary Python entrypoint into the application.
APPLICATION_PLUGINS = frozenset({"mpcfill-browser"})


def _run_application_plugin_json(plugin_id, command, payload, timeout):
    if plugin_id == "mpcfill-browser":
        from .mpcfill_adapter import execute
        return execute(command, payload or {}, timeout=timeout)
    raise ValueError("This plugin cannot use the application runtime.")


def _application_plugin_context(plugin_id):
    installed = load_plugin_manifest(plugin_id)
    bundled = _load_plugin_manifest_from_directory(plugin_id, get_plugin_development_dir(plugin_id))
    if not installed or not bundled or bundled.get("runtime") != "application":
        return None
    # The installed manifest enables the plugin. Its implementation always
    # ships with the application, including when migrating a 1.0 installation.
    return {
        "plugin_id": plugin_id,
        "plugin_dir": get_plugin_install_dir(plugin_id),
        "plugin_python": None,
        "entrypoint_path": None,
        "manifest": bundled,
        "runtime": "application",
        "runtime_source": "application",
        "development": False,
        "update_available": installed.get("runtime") != "application"
                            or installed.get("version") != bundled.get("version"),
    }


# *** PLUGIN FILES - Locate Plugins and Read Their Details ***
def ensure_plugin_directories():
    os.makedirs(
        PLUGIN_ROOT_DIR,
        exist_ok=True,
    )

    os.makedirs(
        PLUGIN_DOWNLOAD_DIR,
        exist_ok=True,
    )


def get_plugin_catalog_entry(
    plugin_id,
):
    clean_plugin_id = str(
        plugin_id or ""
    ).strip()

    return PLUGIN_CATALOG.get(
        clean_plugin_id
    )


def get_plugin_install_dir(
    plugin_id,
):
    clean_plugin_id = str(
        plugin_id or ""
    ).strip()

    if not clean_plugin_id:
        return ""

    return os.path.join(
        PLUGIN_ROOT_DIR,
        clean_plugin_id,
    )


def get_plugin_manifest_path(
    plugin_id,
):
    plugin_dir = (
        get_plugin_install_dir(
            plugin_id
        )
    )

    if not plugin_dir:
        return ""

    return os.path.join(
        plugin_dir,
        PLUGIN_MANIFEST_FILENAME,
    )


def load_plugin_manifest(
    plugin_id,
):
    manifest_path = (
        get_plugin_manifest_path(
            plugin_id
        )
    )

    if (
        not manifest_path
        or not os.path.exists(
            manifest_path
        )
    ):
        return None

    try:
        with open(
            manifest_path,
            "r",
            encoding="utf-8",
        ) as manifest_file:
            manifest = json.load(
                manifest_file
            )
    except (
        OSError,
        ValueError,
        TypeError,
    ):
        return None

    if (
        manifest.get("plugin_id")
        != plugin_id
    ):
        return None

    return manifest


def get_plugin_venv_dir(
    plugin_id,
):
    return os.path.join(
        get_plugin_install_dir(
            plugin_id
        ),
        ".venv",
    )


def get_plugin_python_path(
    plugin_id,
):
    bundled_python = _bundled_python_path(get_plugin_install_dir(plugin_id))
    if os.path.isfile(bundled_python):
        return bundled_python

    venv_dir = get_plugin_venv_dir(
        plugin_id
    )

    if os.name == "nt":
        return os.path.join(
            venv_dir,
            "Scripts",
            "python.exe",
        )

    return os.path.join(
        venv_dir,
        "bin",
        "python",
    )

def get_plugin_development_dir(
    plugin_id,
):
    clean_plugin_id = str(
        plugin_id or ""
    ).strip()

    if not clean_plugin_id:
        return ""

    return os.path.join(
        BUNDLE_BASE_DIR,
        "plugin_src",
        clean_plugin_id,
    )


def _bundled_python_path(plugin_dir):
    relative = ("python.exe",) if os.name == "nt" else ("bin", "python3.12")
    return os.path.join(plugin_dir, "runtime", *relative)


def _plugin_environment():
    environment = {**os.environ, "DECKADENCE_DOWNLOAD_USER_AGENT": get_download_user_agent()}
    # Frozen Linux apps prepend their own libraries. External Python must use
    # its bundled libraries and the host driver, not the app's copies.
    if sys.platform == "linux" and getattr(sys, "frozen", False):
        original = environment.get("LD_LIBRARY_PATH_ORIG")
        if original:
            environment["LD_LIBRARY_PATH"] = original
        else:
            environment.pop("LD_LIBRARY_PATH", None)
    return environment


def _get_plugin_python_path_for_directory(
    plugin_dir,
):
    bundled_python = _bundled_python_path(plugin_dir)
    if os.path.isfile(bundled_python):
        return bundled_python

    venv_dir = os.path.join(
        plugin_dir,
        ".venv",
    )

    if os.name == "nt":
        return os.path.join(
            venv_dir,
            "Scripts",
            "python.exe",
        )

    return os.path.join(
        venv_dir,
        "bin",
        "python",
    )


def _load_plugin_manifest_from_directory(
    plugin_id,
    plugin_dir,
):
    if not plugin_dir:
        return None

    manifest_path = os.path.join(
        plugin_dir,
        PLUGIN_MANIFEST_FILENAME,
    )

    if not os.path.exists(
        manifest_path
    ):
        return None

    try:
        with open(
            manifest_path,
            "r",
            encoding="utf-8",
        ) as manifest_file:
            manifest = json.load(
                manifest_file
            )
    except Exception:
        return None

    if (
        manifest.get("plugin_id")
        != plugin_id
    ):
        return None

    return manifest


def get_plugin_runtime_context(
    plugin_id,
):
    if plugin_id in APPLICATION_PLUGINS:
        # No development-source fallback: installation must remain optional,
        # and uninstalling must disable the browser even in a source checkout.
        return _application_plugin_context(plugin_id)

    runtime_candidates = [
        (
            "installed",
            get_plugin_install_dir(
                plugin_id
            ),
        ),
    ]

    if not getattr(
        sys,
        "frozen",
        False,
    ):
        runtime_candidates.append(
            (
                "development",
                get_plugin_development_dir(
                    plugin_id
                ),
            )
        )

    for runtime_source, plugin_dir in runtime_candidates:
        manifest = (
            _load_plugin_manifest_from_directory(
                plugin_id,
                plugin_dir,
            )
        )

        if not manifest:
            continue

        entrypoint = str(
            manifest.get(
                "entrypoint",
                "",
            )
            or ""
        ).strip()

        if not entrypoint:
            continue

        entrypoint_path = os.path.join(
            plugin_dir,
            entrypoint,
        )

        plugin_python = (
            _get_plugin_python_path_for_directory(
                plugin_dir
            )
        )

        if (
            not os.path.exists(
                entrypoint_path
            )
            or not os.path.exists(
                plugin_python
            )
        ):
            continue

        return {
            "plugin_id": plugin_id,
            "plugin_dir": plugin_dir,
            "plugin_python": plugin_python,
            "entrypoint_path": (
                entrypoint_path
            ),
            "manifest": manifest,
            "runtime_source": (
                runtime_source
            ),
            "development": (
                runtime_source
                == "development"
            ),
        }

    return None

# *** PLUGIN STATUS - Check Installed Plugins ***
def get_plugin_status(
    plugin_id,
):
    catalog_entry = (
        get_plugin_catalog_entry(
            plugin_id
        )
    )

    if not catalog_entry:
        return {
            "plugin_id": plugin_id,
            "known": False,
            "installed": False,
            "ready": False,
            "status": "unknown",
            "message": (
                "Unknown plugin."
            ),
        }

    runtime_context = (
        get_plugin_runtime_context(
            plugin_id
        )
    )

    if runtime_context:
        manifest = runtime_context[
            "manifest"
        ]
        bundled_update = False
        if catalog_entry.get("bundled_source") and runtime_context["runtime_source"] == "installed":
            bundled = _load_plugin_manifest_from_directory(plugin_id, get_plugin_development_dir(plugin_id))
            bundled_update = bool(bundled and bundled.get("version")
                                  and manifest.get("version") != bundled["version"])
        update_available = runtime_context.get("update_available", False) or not set(catalog_entry.get("required_capabilities", [])).issubset(
            manifest.get("capabilities", [])
        ) or bundled_update

        return {
            **catalog_entry,

            "known": True,
            "installed": True,
            "ready": True,
            "status": "ready",
            "update_available": update_available,

            "development": (
                runtime_context[
                    "development"
                ]
            ),

            "runtime_source": (
                runtime_context[
                    "runtime_source"
                ]
            ),

            "version": str(
                manifest.get(
                    "version",
                    "",
                )
                or ""
            ),

            "manifest": manifest,

            "message": (
                ("Update this plugin to the version bundled with Deckadence. Older private environments are removed automatically."
                 if update_available else "Plugin is ready using Deckadence's existing runtime.")
                if runtime_context.get("runtime") == "application" else
                "Update this plugin to the version bundled with Deckadence."
                if bundled_update else
                "Update to include text, subject, and frame detection in one plugin."
                if update_available else
                "Development plugin is ready."
                if runtime_context[
                    "development"
                ]
                else "Plugin is ready."
            ),
        }


    manifest = load_plugin_manifest(
        plugin_id
    )

    if not manifest:
        return {
            **catalog_entry,
            "known": True,
            "installed": False,
            "ready": False,
            "status": "not_installed",
            "version": "",
            "message": (
                "Plugin is not installed."
            ),
        }

    plugin_dir = (
        get_plugin_install_dir(
            plugin_id
        )
    )

    entrypoint = str(
        manifest.get(
            "entrypoint",
            "",
        )
        or ""
    ).strip()

    entrypoint_path = os.path.join(
        plugin_dir,
        entrypoint,
    )

    plugin_python = (
        get_plugin_python_path(
            plugin_id
        )
    )

    ready = bool(
        entrypoint
        and os.path.exists(
            entrypoint_path
        )
        and os.path.exists(
            plugin_python
        )
    )

    return {
        **catalog_entry,
        "known": True,
        "installed": True,
        "ready": ready,
        "status": (
            "ready"
            if ready
            else "incomplete"
        ),
        "version": str(
            manifest.get(
                "version",
                "",
            )
            or ""
        ),
        "manifest": manifest,
        "message": (
            "Plugin is ready."
            if ready
            else (
                "Plugin files are present, "
                "but the runtime is incomplete."
            )
        ),
    }

def get_ready_plugins_by_type(
    plugin_type,
):
    clean_plugin_type = str(
        plugin_type or ""
    ).strip().lower()

    ready_plugins = []

    for plugin_id, catalog_entry in (
        PLUGIN_CATALOG.items()
    ):
        catalog_type = str(
            catalog_entry.get(
                "plugin_type",
                "",
            )
            or ""
        ).strip().lower()

        if (
            catalog_type
            != clean_plugin_type
        ):
            continue

        status = get_plugin_status(
            plugin_id
        )

        if status.get("ready"):
            ready_plugins.append(
                status
            )

    return ready_plugins




def _set_install_status(
    plugin_id,
    **values,
):
    with PLUGIN_INSTALL_STATUS_LOCK:
        current_status = dict(
            PLUGIN_INSTALL_STATUS.get(
                plugin_id,
                {},
            )
        )

        current_status.update(
            values
        )

        PLUGIN_INSTALL_STATUS[
            plugin_id
        ] = current_status


def get_plugin_install_status(
    plugin_id,
):
    with PLUGIN_INSTALL_STATUS_LOCK:
        current_status = dict(
            PLUGIN_INSTALL_STATUS.get(
                plugin_id,
                {},
            )
        )

    if not current_status:
        return {
            "plugin_id": plugin_id,
            "is_running": False,
            "stage": "Idle",
            "message": (
                "No installation is running."
            ),
            "error": "",
        }

    return current_status


# *** PLUGIN INSTALLATION - Unpack Files and Install Requirements ***
def _safe_extract_zip(
    zip_path,
    destination_dir,
):
    destination_real = os.path.realpath(
        destination_dir
    )

    with zipfile.ZipFile(
        zip_path,
        "r",
    ) as archive:
        for member in archive.infolist():
            member_path = os.path.realpath(
                os.path.join(
                    destination_dir,
                    member.filename,
                )
            )

            if (
                member_path
                != destination_real
                and not member_path.startswith(
                    destination_real
                    + os.sep
                )
            ):
                raise ValueError(
                    "Plugin ZIP contains an "
                    "unsafe path."
                )

        archive.extractall(
            destination_dir
        )


def _find_manifest_root(
    extracted_dir,
):
    manifest_paths = []

    for root, dirs, files in os.walk(
        extracted_dir
    ):
        dirs[:] = [
            directory
            for directory in dirs
            if directory != ".venv"
        ]

        if (
            PLUGIN_MANIFEST_FILENAME
            in files
        ):
            manifest_paths.append(
                os.path.join(
                    root,
                    PLUGIN_MANIFEST_FILENAME,
                )
            )

    if len(manifest_paths) != 1:
        raise ValueError(
            "Plugin package must contain "
            "exactly one deckadence-plugin.json."
        )

    return os.path.dirname(
        manifest_paths[0]
    )


def _validate_manifest(
    plugin_id,
    plugin_root,
):
    manifest_path = os.path.join(
        plugin_root,
        PLUGIN_MANIFEST_FILENAME,
    )

    with open(
        manifest_path,
        "r",
        encoding="utf-8",
    ) as manifest_file:
        manifest = json.load(
            manifest_file
        )

    if (
        int(
            manifest.get(
                "schema_version",
                0,
            )
            or 0
        )
        != 1
    ):
        raise ValueError(
            "Unsupported plugin manifest "
            "schema version."
        )

    if (
        manifest.get("plugin_id")
        != plugin_id
    ):
        raise ValueError(
            "Downloaded plugin ID does not "
            "match the requested plugin."
        )

    if manifest.get("runtime") == "application":
        if plugin_id not in APPLICATION_PLUGINS:
            raise ValueError("This plugin cannot use the application runtime.")
        if manifest.get("entrypoint") or manifest.get("requirements_file") or manifest.get("bundled_runtime"):
            raise ValueError("Application plugins use a built-in handler and the application's dependencies.")
        return manifest
    if plugin_id in APPLICATION_PLUGINS:
        raise ValueError("Update this plugin to use Deckadence's application runtime.")

    if manifest.get("bundled_runtime"):
        expected = manifest.get("runtime_platform", "win32")
        if expected != sys.platform:
            raise ValueError(f"This upscaler package requires {expected}, not {sys.platform}.")
        if manifest.get("runtime_arch", "x86_64") == "x86_64" and platform.machine().lower() not in {"amd64", "x86_64"}:
            raise ValueError("This upscaler package requires an x86-64 processor.")

    entrypoint = str(
        manifest.get(
            "entrypoint",
            "",
        )
        or ""
    ).strip()

    if not entrypoint:
        raise ValueError(
            "Plugin manifest does not "
            "define an entrypoint."
        )

    entrypoint_path = os.path.join(
        plugin_root,
        entrypoint,
    )

    if not os.path.exists(
        entrypoint_path
    ):
        raise ValueError(
            "Plugin entrypoint does not exist."
        )

    return manifest


def _command_exists(
    command,
):
    try:
        result = subprocess.run(
            command + ["--version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
            check=False,
        )

        return result.returncode == 0

    except (
        OSError,
        subprocess.SubprocessError,
    ):
        return False


def _resolve_python_command():
    configured_python = str(
        os.environ.get(
            "DECKADENCE_PLUGIN_PYTHON",
            "",
        )
        or ""
    ).strip()

    candidates = []

    if configured_python:
        candidates.append(
            [configured_python]
        )

    if not getattr(
        sys,
        "frozen",
        False,
    ):
        candidates.append(
            [sys.executable]
        )

    if os.name == "nt":
        candidates.extend(
            [
                ["py", "-3.12"],
                ["py", "-3.11"],
                ["python"],
            ]
        )

    else:
        candidates.extend(
            [
                ["python3.12"],
                ["python3.11"],
                ["python3"],
                ["python"],
            ]
        )

    for command in candidates:
        if _command_exists(
            command
        ):
            return command

    raise RuntimeError(
        "No compatible Python installation "
        "was found for plugin installation. "
        "Set DECKADENCE_PLUGIN_PYTHON to the "
        "Python executable to use."
    )


def _resolve_studio_python(cancel=None, progress=None):
    from .python_runtime import ensure_python, validate_python
    environment = _plugin_environment()
    configured = os.environ.get('DECKADENCE_PLUGIN_PYTHON', '').strip()
    if configured:
        validate_python([configured], environment, require_minor=(3, 12))
        return [configured]
    return [ensure_python(os.path.join(PLUGIN_ROOT_DIR, '.python'),
                          environment=environment, cancel=cancel, progress=progress)]


def _install_plugin_requirements(
    plugin_id,
    manifest,
):
    if manifest.get("runtime") == "application":
        _set_install_status(plugin_id, stage="Checking Plugin",
                            message="Using Deckadence's existing runtime. No additional downloads needed.")
        health = _run_application_plugin_json(plugin_id, "health", {}, timeout=30)
        if not health.get("ok"):
            raise RuntimeError("The built-in plugin could not be loaded. Update Deckadence and retry.")
        return

    plugin_dir = (
        get_plugin_install_dir(
            plugin_id
        )
    )

    if manifest.get("bundled_runtime"):
        plugin_python = _bundled_python_path(plugin_dir)
        if not os.path.isfile(plugin_python):
            raise RuntimeError("The downloaded upscaler is missing its Python runtime. Download it again.")
        if sys.platform == "linux":
            # ZIP extraction does not restore executable permissions.
            os.chmod(plugin_python, 0o755)
        _set_install_status(plugin_id, stage="Installing Requirements", message="Downloading upscaler libraries. This may take several minutes.")
        subprocess.run(
            [plugin_python, "-I", "-m", "ensurepip", "--upgrade"], check=True, env=_plugin_environment(),
        )
        subprocess.run(
            [plugin_python, "-I", "-m", "pip", "--isolated", "install", "--disable-pip-version-check",
             "--prefix", os.path.join(plugin_dir, "runtime"),
             "--no-cache-dir", "-r", os.path.join(plugin_dir, "requirements.txt")],
            check=True, env=_plugin_environment(),
        )
        _set_install_status(plugin_id, stage="Preparing Models", message="Downloading and checking upscaler models.")
        subprocess.run(
            [plugin_python, "-E", "-s", "-c",
             "import torch, torchvision, spandrel, safetensors, einops; "
             "from PIL import Image; from model_runtime import MODEL_SPECS, ensure_model_file; "
             "[ensure_model_file(model_id) for model_id in MODEL_SPECS]"],
            cwd=plugin_dir, check=True, env=_plugin_environment(),
        )
        return

    venv_dir = get_plugin_venv_dir(
        plugin_id
    )

    bootstrap_python = (
        _resolve_studio_python(progress=lambda stage, message: _set_install_status(
            plugin_id, stage=stage, message=message))
        if plugin_id == 'card-finishing-studio' else _resolve_python_command()
    )

    _set_install_status(
        plugin_id,
        stage="Creating Plugin Runtime",
        message=(
            "Creating isolated Python "
            "environment."
        ),
    )

    if os.path.exists(
        venv_dir
    ):
        shutil.rmtree(
            venv_dir
        )

    subprocess.run(
        bootstrap_python
        + [
            "-I",
            "-m",
            "venv",
            venv_dir,
        ],
        check=True,
        env=_plugin_environment(),
        **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}),
    )

    plugin_python = (
        get_plugin_python_path(
            plugin_id
        )
    )

    requirements_filename = str(
        manifest.get(
            "requirements_file",
            "requirements.txt",
        )
        or ""
    ).strip()

    if not requirements_filename:
        return

    requirements_path = os.path.join(
        plugin_dir,
        requirements_filename,
    )

    if not os.path.exists(
        requirements_path
    ):
        return

    _set_install_status(
        plugin_id,
        stage="Installing Requirements",
        message=(
            "Installing plugin Python "
            "requirements."
        ),
    )

    subprocess.run(
        [
            plugin_python,
            "-I",
            "-m",
            "pip",
            "--isolated",
            "install",
            "--disable-pip-version-check",
            "-r",
            requirements_path,
        ],
        check=True,
        env=_plugin_environment(),
        **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}),
    )


def _download_latest_release_asset(
    plugin_id,
    catalog_entry,
):
    owner = catalog_entry[
        "github_owner"
    ]

    repo = catalog_entry[
        "github_repo"
    ]

    tag_prefix = str(
        catalog_entry.get(
            "release_tag_prefix",
            "",
        )
        or ""
    ).strip()

    asset_name = catalog_entry[
        "release_asset_name"
    ]
    if sys.platform == "linux":
        if platform.machine().lower() not in {"x86_64", "amd64"}:
            raise RuntimeError("Linux upscaler packages currently require x86-64.")
        asset_name = asset_name.removesuffix(".zip") + "-linux-x86_64.zip"
    elif sys.platform != "win32":
        raise RuntimeError("Upscaler packages are available for Windows and Linux x86-64.")

    releases_url = (
        "https://api.github.com/repos/"
        f"{owner}/{repo}/releases"
    )

    _set_install_status(
        plugin_id,
        stage="Checking GitHub",
        message=(
            "Checking the latest plugin "
            "release."
        ),
    )

    releases_response = requests.get(
        releases_url,
        params={
            "per_page": 100,
        },
        headers={
            "Accept": (
                "application/vnd.github+json"
            ),
            "User-Agent": get_download_user_agent(),
        },
        timeout=30,
    )

    releases_response.raise_for_status()

    releases_data = (
        releases_response.json()
    )

    if not isinstance(
        releases_data,
        list,
    ):
        raise RuntimeError(
            "GitHub returned an invalid "
            "release list."
        )

    matching_release = None

    for release in releases_data:
        if release.get("draft"):
            continue

        tag_name = str(
            release.get(
                "tag_name",
                "",
            )
            or ""
        ).strip()

        if (
            tag_prefix
            and not tag_name.startswith(
                tag_prefix
            )
        ):
            continue

        if not any(asset.get("name") == asset_name for asset in release.get("assets", [])):
            continue

        matching_release = release
        break

    if not matching_release:
        raise RuntimeError(
            "The upscaler package with included Python is not available yet. "
            "Please try again after the plugin release is published."
        )

    matching_asset = None

    for asset in matching_release.get(
        "assets",
        [],
    ):
        if asset.get("name") == asset_name:
            matching_asset = asset
            break

    if not matching_asset:
        release_tag = str(
            matching_release.get(
                "tag_name",
                "",
            )
            or ""
        )

        raise RuntimeError(
            f"Plugin release {release_tag} "
            f"does not contain {asset_name}."
        )

    download_url = matching_asset.get(
        "browser_download_url"
    )

    if not download_url:
        raise RuntimeError(
            "GitHub release asset has no "
            "download URL."
        )

    destination_path = os.path.join(
        PLUGIN_DOWNLOAD_DIR,
        f"{plugin_id}.zip",
    )

    release_tag = str(
        matching_release.get(
            "tag_name",
            "",
        )
        or ""
    ).strip()

    _set_install_status(
        plugin_id,
        stage="Downloading",
        message=(
            "Downloading plugin package "
            f"{release_tag} from GitHub."
        ),
    )

    with requests.get(
        download_url,
        headers={"User-Agent": get_download_user_agent()},
        stream=True,
        timeout=(30, 300),
    ) as download_response:
        download_response.raise_for_status()

        with open(
            destination_path,
            "wb",
        ) as output_file:
            for chunk in (
                download_response.iter_content(
                    chunk_size=1024 * 1024
                )
            ):
                if chunk:
                    output_file.write(
                        chunk
                    )

    return destination_path


def install_plugin(
    plugin_id,
):
    ensure_plugin_directories()

    _stop_plugin_worker(
        plugin_id
    )

    catalog_entry = (
        get_plugin_catalog_entry(
            plugin_id
        )
    )

    if not catalog_entry:
        raise ValueError(
            "Unknown plugin."
        )

    bundled_source = bool(catalog_entry.get("bundled_source"))
    package_path = None if bundled_source else (
        _download_latest_release_asset(
            plugin_id,
            catalog_entry,
        )
    )

    _set_install_status(
        plugin_id,
        stage="Extracting",
        message=(
            "Extracting plugin package."
        ),
    )

    staging_dir = tempfile.mkdtemp(
        prefix=(
            f"deckadence-plugin-{plugin_id}-"
        )
    )

    plugin_dir = (
        get_plugin_install_dir(
            plugin_id
        )
    )

    backup_dir = (
        plugin_dir + ".backup"
    )

    replacement_started = False

    try:
        if bundled_source:
            # Bundled plugins ship their installation files with the app.
            # Application-runtime plugins do not install separate libraries.
            package_root = get_plugin_development_dir(plugin_id)
            if not os.path.isdir(package_root):
                raise RuntimeError("This plugin's source is missing. Update Deckadence and try again.")
        else:
            _safe_extract_zip(package_path, staging_dir)
            package_root = _find_manifest_root(staging_dir)

        manifest = (
            _validate_manifest(
                plugin_id,
                package_root,
            )
        )

        if os.path.exists(
            backup_dir
        ):
            shutil.rmtree(
                backup_dir
            )

        if os.path.exists(
            plugin_dir
        ):
            os.replace(
                plugin_dir,
                backup_dir,
            )

        replacement_started = True

        shutil.copytree(
            package_root,
            plugin_dir,
            ignore=shutil.ignore_patterns("__pycache__", ".venv", "models") if bundled_source else None,
        )

        # Studio keeps its existing plugin ID so installed models can be reused.
        # Copy before setup, retaining the backup intact for rollback on failure.
        cached_models = os.path.join(backup_dir, "models")
        if catalog_entry.get("preserve_models") and os.path.isdir(cached_models):
            shutil.copytree(cached_models, os.path.join(plugin_dir, "models"), dirs_exist_ok=True)

        _install_plugin_requirements(
            plugin_id,
            manifest,
        )

        if catalog_entry.get("required_capabilities"):
            health = run_plugin_json(plugin_id, "health", {}, timeout=60)
            expected = {"detect_" + name for name in catalog_entry["required_capabilities"]}
            if not health.get("ok") or not expected.issubset(health.get("commands", [])):
                raise RuntimeError("Card Finishing Studio setup is incomplete. Retry the update.")

        if os.path.exists(
            backup_dir
        ):
            shutil.rmtree(
                backup_dir
            )

    except Exception:
        if replacement_started and os.path.exists(
            plugin_dir
        ):
            shutil.rmtree(
                plugin_dir
            )

        if replacement_started and os.path.exists(
            backup_dir
        ):
            os.replace(
                backup_dir,
                plugin_dir,
            )

        raise

    finally:
        shutil.rmtree(
            staging_dir,
            ignore_errors=True,
        )

    return get_plugin_status(
        plugin_id
    )


def _install_plugin_worker(
    plugin_id,
):
    try:
        _set_install_status(
            plugin_id,
            is_running=True,
            stage="Starting",
            message=(
                "Starting plugin installation."
            ),
            error="",
        )

        plugin_status = install_plugin(
            plugin_id
        )

        _set_install_status(
            plugin_id,
            is_running=False,
            stage="Complete",
            message=(
                "Plugin installation complete."
            ),
            error="",
            plugin_status=plugin_status,
        )

    except Exception as exc:
        _set_install_status(
            plugin_id,
            is_running=False,
            stage="Failed",
            message=(
                "Plugin installation failed."
            ),
            error=str(exc),
        )


# *** INSTALL CONTROLS - Start Installation and Remove Plugins ***
def start_plugin_install(
    plugin_id,
):
    catalog_entry = (
        get_plugin_catalog_entry(
            plugin_id
        )
    )

    if not catalog_entry:
        raise ValueError(
            "Unknown plugin."
        )

    current_status = (
        get_plugin_install_status(
            plugin_id
        )
    )

    if current_status.get(
        "is_running"
    ):
        return current_status

    _set_install_status(
        plugin_id,
        is_running=True,
        stage="Starting",
        message=(
            "Starting plugin installation."
        ),
        error="",
    )

    worker = threading.Thread(
        target=_install_plugin_worker,
        args=(plugin_id,),
        daemon=True,
        name=(
            "deckadence-plugin-install-"
            f"{plugin_id}"
        ),
    )

    worker.start()

    return get_plugin_install_status(
        plugin_id
    )


def _stop_plugin_worker(plugin_id, expected=None):
    with PLUGIN_WORKERS_LOCK:
        if expected is not None and PLUGIN_WORKERS.get(plugin_id) is not expected:
            return
        worker = PLUGIN_WORKERS.pop(
            plugin_id,
            None,
        )

    if not worker:
        return
    if worker.get('idle_timer'):
        worker['idle_timer'].cancel()

    process = worker["process"]

    if process.poll() is None:
        process.terminate()

        try:
            process.wait(timeout=2)

        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=2)
    for stream in (process.stdin, process.stdout):
        if stream:
            stream.close()


def _expire_detection_worker(plugin_id, worker, epoch):
    if worker['lock'].acquire(blocking=False):
        try:
            if worker.get('idle_epoch') is epoch:
                _stop_plugin_worker(plugin_id, expected=worker)
        finally:
            worker['lock'].release()


def uninstall_plugin(
    plugin_id,
):
    if not get_plugin_catalog_entry(
        plugin_id
    ):
        raise ValueError(
            "Unknown plugin."
        )

    install_status = (
        get_plugin_install_status(
            plugin_id
        )
    )

    if install_status.get(
        "is_running"
    ):
        raise RuntimeError(
            "Plugin installation is still running."
        )

    _stop_plugin_worker(
        plugin_id
    )

    plugin_dir = (
        get_plugin_install_dir(
            plugin_id
        )
    )

    if os.path.exists(
        plugin_dir
    ):
        shutil.rmtree(
            plugin_dir
        )

    download_path = os.path.join(
        PLUGIN_DOWNLOAD_DIR,
        f"{plugin_id}.zip",
    )

    if os.path.exists(
        download_path
    ):
        os.remove(
            download_path
        )

    with PLUGIN_INSTALL_STATUS_LOCK:
        PLUGIN_INSTALL_STATUS.pop(
            plugin_id,
            None,
        )

    return get_plugin_status(
        plugin_id
    )


def _stop_all_plugin_workers():
    with PLUGIN_WORKERS_LOCK:
        plugin_ids = list(
            PLUGIN_WORKERS
        )

    for plugin_id in plugin_ids:
        _stop_plugin_worker(
            plugin_id
        )


# *** RUN PLUGINS - Send Commands and Read Results ***
def _get_plugin_worker(
    plugin_id,
    runtime_context,
):
    with PLUGIN_WORKERS_LOCK:
        worker = PLUGIN_WORKERS.get(
            plugin_id
        )

        if (
            worker
            and worker["process"].poll()
            is None
        ):
            return worker

        process = subprocess.Popen(
            [
                runtime_context[
                    "plugin_python"
                ],
                "-E",
                "-s",
                runtime_context[
                    "entrypoint_path"
                ],
                "worker",
            ],
            env=_plugin_environment(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
            **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}),
        )

        worker = {
            "process": process,
            "lock": threading.Lock(),
        }

        PLUGIN_WORKERS[plugin_id] = (
            worker
        )

        return worker


def _run_persistent_plugin_json(
    plugin_id,
    command,
    payload,
    timeout,
    runtime_context,
):
    worker = _get_plugin_worker(
        plugin_id,
        runtime_context,
    )

    with worker["lock"]:
        if worker['process'].poll() is not None or PLUGIN_WORKERS.get(plugin_id) is not worker:
            return _run_persistent_plugin_json(plugin_id, command, payload, timeout, runtime_context)
        if worker.get('idle_timer'):
            worker['idle_timer'].cancel()
        worker['idle_epoch'] = None
        process = worker["process"]

        try:
            process.stdin.write(
                json.dumps({
                    "command": command,
                    "payload": payload or {},
                })
                + "\n"
            )

            process.stdin.flush()

        except (
            BrokenPipeError,
            OSError,
        ):
            _stop_plugin_worker(
                plugin_id
            )

            raise RuntimeError(
                "Plugin worker stopped "
                "unexpectedly."
            )

        response = {}

        def read_response():
            response["text"] = (
                process.stdout.readline()
            )

        reader = threading.Thread(
            target=read_response,
            daemon=True,
        )

        reader.start()
        reader.join(timeout)

        if reader.is_alive():
            _stop_plugin_worker(
                plugin_id
            )

            raise RuntimeError(
                "Plugin worker timed out."
            )

        response_text = str(
            response.get("text")
            or ""
        ).strip()

        if not response_text:
            _stop_plugin_worker(
                plugin_id
            )

            raise RuntimeError(
                "Plugin worker exited "
                "without a response."
            )

        try:
            result = json.loads(response_text)
        except (ValueError, TypeError):
            _stop_plugin_worker(plugin_id, expected=worker)
            raise RuntimeError('Plugin worker returned an unreadable response.') from None

        if not result.get("ok"):
            _stop_plugin_worker(plugin_id, expected=worker)
            raise RuntimeError(
                result.get("error")
                or "Plugin worker failed."
            )

        if plugin_id == 'card-finishing-studio':
            epoch = object()
            worker['idle_epoch'] = epoch
            timer = threading.Timer(120, _expire_detection_worker, args=(plugin_id, worker, epoch))
            timer.daemon = True
            worker['idle_timer'] = timer
            timer.start()
        return result.get(
            "result",
            {},
        )


atexit.register(
    _stop_all_plugin_workers
)

def run_plugin_json(
    plugin_id,
    command,
    payload=None,
    timeout=300,
):
    runtime_context = (
        get_plugin_runtime_context(
            plugin_id
        )
    )

    if not runtime_context:
        raise RuntimeError(
            "Plugin is not ready."
        )

    if runtime_context.get("runtime") == "application":
        return _run_application_plugin_json(plugin_id, command, payload, timeout)

    if command in PERSISTENT_PLUGIN_COMMANDS or (
        plugin_id == 'card-finishing-studio' and command in ('detect_text', 'detect_subject', 'detect_frame')
        and command in runtime_context.get('manifest', {}).get('persistent_commands', [])
    ):
        return _run_persistent_plugin_json(
            plugin_id,
            command,
            payload,
            timeout,
            runtime_context,
        )

    process = subprocess.run(
        [
            runtime_context[
                "plugin_python"
            ],
            "-E",
            "-s",
            runtime_context[
                "entrypoint_path"
            ],
            command,
        ],
        env=_plugin_environment(),
        input=json.dumps(
            payload or {}
        ),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
        **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}),
    )

    if process.returncode != 0:
        raise RuntimeError(
            process.stderr.strip()
            or (
                "Plugin command failed "
                f"with exit code "
                f"{process.returncode}."
            )
        )

    output_text = (
        process.stdout.strip()
    )

    if not output_text:
        return {}

    return json.loads(
        output_text
    )

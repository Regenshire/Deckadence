"""Settings controls for portable application updates."""
from __future__ import annotations

import hmac
import copy
from datetime import datetime, timezone
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit

from flask import Blueprint, g, jsonify, request

import update_system as updates

PLUGIN_BUSY_STATES = {"waiting", "checking", "updating"}


class UpdateManager:
    def __init__(self, root, version, port, activity_check, packaged=None):
        self.root = Path(root).resolve()
        self.version, self.port = version, port
        self.activity_check = activity_check
        self.packaged = getattr(sys, "frozen", False) if packaged is None else packaged
        self.condition = threading.Condition(threading.RLock())
        self.active_requests = 0
        self.installing = False
        self.shutdown = None
        self.csrf = secrets.token_urlsafe(32)
        self.release = None
        self.staged = None
        self.plugin_updates = {}
        self.plugin_worker = None
        self.state = {"state": "idle", "message": "Check for a compatible update.", "current_version": version}
        self.unsupported = ""
        try:
            self.platform = updates.platform_key()
            if not self.packaged:
                raise ValueError("In-app installation is available in packaged releases. Update this source checkout using your normal development workflow.")
            self.installed = updates.validate_install(updates.read_json(self.root / updates.INSTALL_MANIFEST), self.platform, version)
            if not (self.root / updates.helper_name(self.platform)).is_file():
                raise ValueError("The update helper is missing. Download a complete release from GitHub.")
            result = self.root / updates.WORK_NAME / "last-result.json"
            if result.is_file():
                saved = updates.read_json(result)
                if saved.get("version") == version:
                    self.state.update(state=saved.get("state", "idle"), message=saved.get("message", ""))
        except (ValueError, OSError, KeyError) as error:
            self.unsupported = str(error) if not isinstance(error, FileNotFoundError) else "This folder predates in-app updates. Install an updater-enabled release manually once."
        if self.packaged:
            try:
                saved = updates.read_json(self.root / updates.WORK_NAME / "plugin-updates.json")
                if saved.get("app_version") == version:
                    self.plugin_updates = saved
            except (ValueError, OSError, AttributeError):
                pass

    def status(self):
        with self.condition:
            # The new process starts before the helper commits the update.
            # Pick up its completion receipt after the maintenance gate opens.
            if self.packaged and self.state["state"] == "idle" and not self.release and not updates.startup_pending(self.root):
                receipt = self.root / updates.WORK_NAME / "last-result.json"
                if receipt.is_file():
                    try:
                        saved = updates.read_json(receipt)
                        if saved.get("version") == self.version:
                            self.state.update(state=saved.get("state", "idle"), message=saved.get("message", ""))
                    except (ValueError, OSError):
                        pass
            value = dict(self.state)
            value["plugin_updates"] = copy.deepcopy(self.plugin_updates)
            for item in value["plugin_updates"].get("plugins", []):
                if item.get("state") == "updating":
                    from plugin_system.manager import get_plugin_install_status
                    progress = get_plugin_install_status(item["plugin_id"])
                    item["message"] = progress.get("message") or item.get("message", "")
                    item["stage"] = progress.get("stage", "")
            value.update(supported=not self.unsupported, reason=self.unsupported, csrf=self.csrf,
                         can_restart=bool(self.shutdown), current_version=self.version,
                         platform=getattr(self, "platform", ""))
            if self.release:
                value.update(available=self.release["available"], latest_version=self.release["version"],
                             newer_release=updates.version_tuple(self.release["version"]) > updates.version_tuple(self.version),
                             notes=self.release["notes"], release_url=self.release["release_url"],
                             download_bytes=self.release.get("metadata", {}).get("size", 0))
            if self.packaged and updates.startup_pending(self.root):
                value.update(state="installing", message="Checking the updated application. Please wait…")
            return value

    def update(self, **values):
        with self.condition:
            self.state.update(values)

    def start(self, operation):
        with self.condition:
            if self.unsupported:
                raise ValueError(self.unsupported)
            if updates.startup_pending(self.root):
                raise ValueError("An update is still being verified or needs recovery. Wait, or run the Start_Deckadence launcher.")
            if self.installing or self.state["state"] in {"checking", "downloading", "verifying", "installing"}:
                raise ValueError("An update operation is already running.")
            if operation == "plugins":
                self.start_plugin_updates()
                return
            if operation == "install" and self.plugin_updates.get("state") in PLUGIN_BUSY_STATES:
                raise ValueError("Installed plugins are updating. Let them finish before restarting Deckadence.")
            if operation == "download" and not (self.release and self.release["available"]):
                raise ValueError("Check for an available update first.")
            if operation == "install" and (self.state["state"] != "ready" or self.staged is None):
                raise ValueError("Download and verify the update first.")
            if operation == "install" and not self.shutdown:
                raise ValueError("Automatic restart is unavailable with this server. Use the packaged launcher.")
            if operation == "install":
                self.installing = True
            self.state.update(state={"check": "checking", "download": "downloading", "install": "installing"}[operation],
                              message={"check": "Checking GitHub…", "download": "Downloading update…", "install": "Waiting for current requests to finish…"}[operation],
                              completed_bytes=0, total_bytes=0)
            worker = threading.Thread(target=self.run, args=(operation,), daemon=True, name="deckadence-update")
            try:
                worker.start()
            except Exception:
                self.installing = False
                self.state.update(state="failed", message="Could not start the update worker.")
                raise

    def save_plugin_updates(self, **values):
        with self.condition:
            self.plugin_updates.update(copy.deepcopy(values), app_version=self.version)
            snapshot = copy.deepcopy(self.plugin_updates)
        try:
            updates.write_json(updates.workspace(self.root) / "plugin-updates.json", snapshot)
        except OSError as error:
            updates.record_update_event(self.root, "plugins", error, error=True)

    def resume_plugin_updates(self):
        if not self.packaged:
            return
        after_restart = bool(os.environ.get("DECKADENCE_UPDATE_TOKEN"))
        if after_restart or self.plugin_updates.get("state") in PLUGIN_BUSY_STATES:
            self.start_plugin_updates(after_restart=after_restart)

    def start_plugin_updates(self, *, after_restart=False):
        with self.condition:
            if self.plugin_worker and self.plugin_worker.is_alive():
                return
            interrupted = [item["plugin_id"] for item in self.plugin_updates.get("plugins", [])
                           if item.get("state") == "updating"]
            self.save_plugin_updates(state="waiting" if after_restart else "checking",
                                     message="Waiting for the app update to finish." if after_restart else "Checking installed plugins…", plugins=[])
            self.plugin_worker = threading.Thread(target=self.run_plugin_updates, args=(after_restart, interrupted),
                                                  daemon=True, name="installed-plugin-updates")
            self.plugin_worker.start()

    def run_plugin_updates(self, after_restart=False, interrupted=()):
        try:
            if after_restart:
                while updates.startup_pending(self.root):
                    time.sleep(.2)
                receipt = updates.read_json(self.root / updates.WORK_NAME / "last-result.json")
                if receipt.get("state") != "complete" or receipt.get("version") != self.version:
                    self.save_plugin_updates(state="complete", message="Plugin updates were not started because the app update did not complete.")
                    return
            from plugin_system import manager as plugins
            for plugin_id in interrupted:
                plugins.recover_interrupted_plugin_update(plugin_id)
            installed = [key for key in plugins.PLUGIN_CATALOG if plugins.load_plugin_manifest(key)]
            rows = [{"plugin_id": key, "name": plugins.PLUGIN_CATALOG[key]["name"], "state": "waiting", "message": "Waiting to check for updates."} for key in installed]
            self.save_plugin_updates(state="checking", message="Checking installed plugins…", plugins=rows)
            for item in rows:
                plugin_id = item["plugin_id"]
                try:
                    while plugins.any_plugin_install_running():
                        time.sleep(.25)
                    item.update(state="checking", message="Checking for updates…")
                    self.save_plugin_updates(plugins=rows)
                    candidate = plugins.check_installed_plugin_update(plugin_id)
                    if candidate is None:
                        item.update(state="skipped", message="Plugin is no longer installed.")
                    elif not candidate["available"]:
                        item.update(candidate, state="current", message="Up to date.")
                    elif not plugins.load_plugin_manifest(plugin_id):
                        item.update(state="skipped", message="Plugin is no longer installed.")
                    else:
                        item.update(candidate, state="updating", message="Starting plugin update…")
                        self.save_plugin_updates(state="updating", plugins=rows)
                        plugins.start_plugin_install(plugin_id, release=candidate.get("release"))
                        while plugins.get_plugin_install_status(plugin_id).get("is_running"):
                            time.sleep(.25)
                        result = plugins.get_plugin_install_status(plugin_id)
                        if result.get("error"):
                            raise RuntimeError(result["error"])
                        item.update(state="complete", message=f"Updated to {candidate['latest_version']}.")
                except Exception as error:
                    item.update(state="failed", message=str(error))
                    updates.record_update_event(self.root, "plugin:" + plugin_id, error, error=True)
                self.save_plugin_updates(plugins=rows)
            failed = any(item["state"] == "failed" for item in rows)
            self.save_plugin_updates(state="partial" if failed else "complete", plugins=rows,
                                     message="Some installed plugins need attention. You can retry their updates." if failed else "Installed plugins are up to date." if rows else "No installed plugins to update.")
        except Exception as error:
            updates.record_update_event(self.root, "plugins", error, error=True)
            self.save_plugin_updates(state="partial", message=str(error))

    def run(self, operation):
        try:
            updates.record_update_event(self.root, operation, "Started.")
            if operation == "check":
                self.staged = None
                self.release = updates.discover_update(self.version, self.platform)
                self.update(state="available" if self.release["available"] else "idle", message=self.release["message"],
                            last_checked_utc=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"))
            elif operation == "download":
                self.staged = None
                work = updates.prepare_workspace(self.root)
                metadata = self.release["metadata"]
                database = self.root / "cards.db"
                updates.check_space(self.root, metadata["size"] + 2 * metadata["unpacked_size"] +
                                    (2 * database.stat().st_size if database.exists() else 0) + 64 * updates.CHUNK)
                updates.download_update(self.release, work / "download", self.update)
                self.update(state="verifying", message="Verifying the application package…")
                self.staged = updates.extract_update(work / "download", work / "staged", metadata)
                self.update(state="ready", message="Download verified. Install and restart when you are ready.")
                updates.record_update_event(self.root, operation, "Package ready to install.")
            else:
                self.install()
        except Exception as error:
            updates.record_update_event(self.root, operation, error, error=True)
            retry_install = operation == "install" and self.staged is not None and not updates.startup_pending(self.root)
            self.update(state="ready" if retry_install else "failed", message=str(error))
            with self.condition:
                self.installing = False
                self.condition.notify_all()

    def install(self):
        with self.condition:
            if not self.condition.wait_for(lambda: self.active_requests == 0, timeout=60):
                raise ValueError("Other requests are still running. Finish them before installing the update.")
        if self.activity_check():
            raise ValueError("Finish exports, downloads, plugin installation, upscaling, and backup/restore jobs before installing.")
        work = updates.workspace(self.root)
        runner = work / ("runner.exe" if os.name == "nt" else "runner")
        if runner.exists() and updates.is_link(runner):
            raise ValueError("The update helper workspace is linked.")
        shutil.copy2(self.root / updates.helper_name(self.platform), runner)
        if os.name != "nt":
            runner.chmod(0o755)
        state = updates.stage_transaction(self.root, self.installed, self.staged)
        environment = os.environ.copy()
        environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
        helper = None
        try:
            with (work / "helper.log").open("ab") as log:
                helper = subprocess.Popen([str(runner), "apply", "--root", str(self.root), "--parent", str(os.getpid()),
                                           "--port", str(self.port)], cwd=work, env=environment,
                                          stdin=subprocess.DEVNULL, stdout=log, stderr=log, **updates.launch_options())
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if helper.poll() is not None:
                    raise ValueError("The update helper could not start. See .deckadence-update/helper-error.json or helper.log.")
                ready = work / "helper-ready.json"
                if ready.exists() and updates.read_json(ready).get("id") == state["id"]:
                    self.update(message="Restarting Deckadence. This page will reconnect automatically…")
                    self.shutdown()
                    return
                time.sleep(0.1)
            raise ValueError("The update helper did not become ready. The current version is still running.")
        except Exception:
            if helper is not None and helper.poll() is None:
                helper.terminate()
                helper.wait(timeout=15)
            (work / "transaction.json").unlink(missing_ok=True)
            raise


def register_update_routes(app, *, root, version, port, activity_check, packaged=None):
    def background_activity():
        if activity_check() or any(check() for check in app.extensions.get("update_activity_checks", [])):
            return True
        studio = app.extensions.get("local_mirror")
        if studio:
            with studio.lock:
                return bool(studio.setup.get("running"))
        return False
    manager = UpdateManager(root, version, port, background_activity, packaged)
    blueprint = Blueprint("application_updates", __name__, url_prefix="/maintenance/updates")

    @blueprint.before_request
    def protect_update_controls():
        if request.method == "POST":
            origin = request.headers.get("Origin")
            if origin and urlsplit(origin).netloc != request.host:
                return jsonify(ok=False, message="The update request came from another website."), 403
            if not hmac.compare_digest(request.headers.get("X-Deckadence-Update-CSRF", ""), manager.csrf):
                return jsonify(ok=False, message="Reload Settings before updating."), 403

    @app.before_request
    def update_maintenance_gate():
        if (request.endpoint or "").startswith("application_updates."):
            return
        with manager.condition:
            if manager.installing or (manager.packaged and updates.startup_pending(manager.root)):
                return jsonify(ok=False, message="Deckadence is installing an update. This page will reconnect shortly."), 503
            manager.active_requests += 1
            g._update_request_active = True

    @app.teardown_request
    def finish_update_request(error=None):
        if getattr(g, "_update_request_active", False):
            g._update_request_active = False
            with manager.condition:
                manager.active_requests -= 1
                manager.condition.notify_all()

    @blueprint.get("/status")
    def status():
        response = jsonify(ok=True, **manager.status())
        response.headers["Cache-Control"] = "no-store"
        return response

    @blueprint.get("/health")
    def health():
        token = os.environ.get("DECKADENCE_UPDATE_TOKEN", "")
        if not token or not hmac.compare_digest(request.headers.get("X-Deckadence-Update-Token", ""), token):
            return jsonify(ok=False), 403
        return jsonify(ok=True, version=version)

    @blueprint.post("/<operation>")
    def operate(operation):
        if operation not in {"check", "download", "install", "plugins"}:
            return jsonify(ok=False, message="Unknown update operation."), 404
        try:
            manager.start(operation)
        except ValueError as error:
            return jsonify(ok=False, message=str(error)), 409
        return jsonify(ok=True), 202

    app.register_blueprint(blueprint)
    return manager

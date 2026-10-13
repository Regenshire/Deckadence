"""Background backup jobs and their Flask endpoints."""
from contextlib import nullcontext
from pathlib import Path
import threading
from uuid import uuid4

from flask import Blueprint, g, jsonify, request, send_file, url_for

from backup_system import CHUNK_SIZE
from user_backup_system import UserBackupService as ApplicationBackupService
from export_selection import ExportSelection



class ExportCancelled(RuntimeError):
    """Cooperative cancellation, after the archive service cleans its work files."""


class BackupJobManager:
    def __init__(self, service, guard=None, activity_check=None):
        self.service = service
        self.guard = guard or nullcontext
        self.activity_check = activity_check or (lambda: False)
        self.condition = threading.Condition()
        self.active_requests = 0
        self.cancel_event = threading.Event()
        self.state = {"state": "idle", "stage": "Idle", "message": "", "error": ""}

    @property
    def busy(self):
        with self.condition:
            return self.state["state"] in {"running", "uploading"}

    def reserve(self, operation):
        with self.condition:
            if self.busy or self.service.pending.exists():
                raise ValueError("A backup or staged restore already exists. Wait for it to finish, or cancel the staged restore.")
            self.cancel_event = threading.Event()
            self.state = {"job_id": uuid4().hex, "operation": operation, "state": "running", "stage": "Starting",
                          "completed_bytes": 0, "total_bytes": 0, "completed_files": 0, "error": "", "message": ""}
            return self.state["job_id"]

    def update(self, **changes):
        with self.condition:
            self.state.update(changes)

    def cancel_export(self, job_id):
        with self.condition:
            if not self.busy or self.state.get("operation") != "backup" or self.state.get("job_id") != job_id:
                raise ValueError("There is no matching export to cancel.")
            self.cancel_event.set()
            self.state.update(cancelling=True, stage="Cancelling export", message="Removing unfinished export files.")
            self.condition.notify_all()

    def report_progress(self, **changes):
        if self.state.get("operation") == "backup" and self.cancel_event.is_set():
            raise ExportCancelled()
        self.update(**changes)

    def status(self):
        with self.condition:
            state = dict(self.state)
        state["pending_restore"] = self.service.pending_status()
        return state

    def enter_request(self):
        with self.condition:
            if self.busy and self.state.get("operation") != "backup":
                return False
            self.active_requests += 1
            return True

    def leave_request(self):
        with self.condition:
            self.active_requests -= 1
            self.condition.notify_all()

    def run(self, task, cleanup=None):
        def worker():
            try:
                importing = self.state.get("operation") != "backup"
                if importing:
                    with self.condition:
                        if not self.condition.wait_for(lambda: self.active_requests == 0, timeout=60):
                            raise ValueError("Other requests are still running. Wait for them to finish and try again.")
                self.report_progress()
                if importing and self.activity_check():
                    raise ValueError("Finish card refresh, image downloads, bleed processing, and upscaling jobs before backing up or restoring.")
                with self.guard() if importing else nullcontext():
                    result = task(self.report_progress)
                self.update(state="complete", stage="Complete", result=result,
                            message=result.get("message") or "Backup saved. You can download it or copy it from the backup folder.")
            except ExportCancelled:
                self.update(state="cancelled", stage="Export cancelled", cancelling=False, error="", current_file="",
                            message="Export cancelled. Unfinished ZIP and temporary files removed.")
            except Exception as error:
                self.update(state="failed", stage="Failed", error=str(error), message="The operation did not complete.")
            finally:
                if cleanup:
                    cleanup()
        thread = threading.Thread(target=worker, name="deckadence-backup", daemon=True)
        try:
            thread.start()
        except Exception:
            if cleanup:
                cleanup()
            self.update(state="failed", stage="Failed", error="Could not start the backup worker.")
            raise


def register_backup_routes(app, *, app_version="", guard=None, activity_check=None, service=None):
    service = service or ApplicationBackupService(app_version=app_version)
    jobs = BackupJobManager(service, guard, activity_check)
    blueprint = Blueprint("application_backups", __name__, url_prefix="/maintenance/backups")

    @app.before_request
    def backup_maintenance_gate():
        if request.endpoint in {"static", "runtime_set_icon"} or (request.endpoint or "").startswith("application_backups."):
            return
        if service.pending.exists() and request.method not in {"GET", "HEAD", "OPTIONS"}:
            return jsonify(ok=False, message="A restore is staged. Restart Deckadence or cancel the staged restore before making changes."), 503
        if not jobs.enter_request():
            document_request = (request.headers.get("Sec-Fetch-Dest") == "document"
                                or request.accept_mimetypes["text/html"] > request.accept_mimetypes["application/json"]
                                or request.endpoint == "config")
            if document_request and request.method == "GET":
                # Render without configuration context processors/database queries.
                return app.jinja_env.get_template("backup_in_progress.html").render(url_for=url_for)
            return jsonify(ok=False, message="A backup or restore is running. Other application requests are paused until it finishes."), 503
        g._backup_request_active = True

    @app.teardown_request
    def finish_backup_request(error=None):
        if getattr(g, "_backup_request_active", False):
            g._backup_request_active = False
            jobs.leave_request()

    @blueprint.get("/status")
    def status():
        state = jobs.status()
        result = state.get("result", {})
        if result.get("zip_path"):
            state["download_url"] = "/maintenance/backups/download/" + state["job_id"]
        return jsonify(ok=True, **state)

    @blueprint.post("/create")
    def create():
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return jsonify(ok=False, message="Invalid backup request."), 400
        try:
            directory = payload.get("output_directory") or None
            if directory is not None and not isinstance(directory, str):
                raise ValueError("Enter a valid backup folder path.")
            if "campaign_id" in payload:
                from campaign_export_selection import CampaignExportSelection
                selection = CampaignExportSelection(payload["campaign_id"], payload.get("selection"))
            else:
                selection = ExportSelection(payload.get("selection"), payload.get("entities"))
            if not any(selection.options.values()):
                raise ValueError("Select at least one category or setting to export.")
            job_id = jobs.reserve("backup")
            jobs.run(lambda progress: service.create_backup(directory, progress, selection=selection))
        except ValueError as error:
            return jsonify(ok=False, message=str(error)), 409
        return jsonify(ok=True, job_id=job_id), 202

    @blueprint.post("/cancel-export")
    def cancel_export():
        payload = request.get_json(silent=True)
        try:
            jobs.cancel_export(payload.get("job_id") if isinstance(payload, dict) else None)
        except ValueError as error:
            return jsonify(ok=False, message=str(error)), 409
        return jsonify(ok=True), 202

    @blueprint.post("/import")
    def restore():
        uploaded_path = None
        reserved = False
        try:
            if request.mimetype == "application/json":
                payload = request.get_json(silent=True)
                if not isinstance(payload, dict) or str(payload.get("confirmation") or "").strip().upper() != "IMPORT":
                    raise ValueError("Type IMPORT to confirm adding user content and applying its settings.")
                archive_path = payload.get("archive_path")
                if not isinstance(archive_path, str) or not archive_path.strip():
                    raise ValueError("Enter the path of a backup on the Deckadence computer.")
                jobs.reserve("restore")
                reserved = True
            elif request.mimetype == "application/zip":
                if request.headers.get("X-Backup-Confirmation", "").strip().upper() != "IMPORT":
                    raise ValueError("Type IMPORT to confirm adding user content and applying its settings.")
                jobs.reserve("restore")
                reserved = True
                service.work.mkdir(parents=True, exist_ok=True)
                uploaded_path = service.work / ("upload-" + uuid4().hex + ".zip")
                jobs.update(state="uploading", stage="Receiving backup", total_bytes=request.content_length or 0)
                completed = 0
                with uploaded_path.open("wb") as writer:
                    while chunk := request.stream.read(CHUNK_SIZE):
                        service._space(service.work, len(chunk) + CHUNK_SIZE)
                        writer.write(chunk)
                        completed += len(chunk)
                        jobs.update(completed_bytes=completed)
                if completed == 0:
                    raise ValueError("The backup upload was empty.")
                archive_path = uploaded_path
                jobs.update(state="running", stage="Starting restore", completed_bytes=0)
            else:
                raise ValueError("Choose a ZIP backup or enter its local file path.")
            cleanup = (lambda: uploaded_path.unlink(missing_ok=True)) if uploaded_path else None
            campaign_only = request.args.get("scope") == "campaign"
            jobs.run(lambda progress: service.import_backup(archive_path, progress, campaign_only=campaign_only), cleanup=cleanup)
            return jsonify(ok=True, job_id=jobs.status()["job_id"]), 202
        except Exception as error:
            if uploaded_path:
                uploaded_path.unlink(missing_ok=True)
            if reserved:
                jobs.update(state="failed", stage="Failed", error=str(error))
            return jsonify(ok=False, message=str(error)), 400

    @blueprint.post("/cancel-restore")
    def cancel_restore():
        if jobs.busy:
            return jsonify(ok=False, message="Wait for the current operation to finish."), 409
        try:
            service.cancel_restore()
            jobs.update(state="idle", stage="Idle", result={}, message="Staged restore cancelled.")
        except ValueError as error:
            return jsonify(ok=False, message=str(error)), 400
        return jsonify(ok=True)

    @blueprint.get("/download/<job_id>")
    def download(job_id):
        state = jobs.status()
        result = state.get("result", {})
        if state.get("job_id") != job_id or state.get("state") != "complete" or not result.get("zip_path"):
            return jsonify(ok=False, message="The completed backup was not found."), 404
        path = Path(result["zip_path"])
        if not path.is_file():
            return jsonify(ok=False, message="The backup file no longer exists."), 404
        return send_file(path, mimetype="application/zip", as_attachment=True, download_name=path.name, conditional=True, max_age=0)

    app.register_blueprint(blueprint)
    return jobs

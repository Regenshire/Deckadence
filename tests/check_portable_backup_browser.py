"""Browser checks with controlled jobs and real HTTP ZIP attachment downloads."""
import json
from pathlib import Path
import sys
import threading
from flask import Flask, Response, jsonify, request, send_file
from werkzeug.serving import make_server
from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    urls = {"status": "/maintenance/backups/status", "create": "/maintenance/backups/create", "restore": "/maintenance/backups/import", "cancel_restore": "/maintenance/backups/cancel-restore", "cancel_export": "/maintenance/backups/cancel-export"}
    panel = Environment(loader=FileSystemLoader(ROOT / "templates")).get_template("_application_backup_controls.html").render(url_for=lambda name: urls[name.split(".")[-1]])
    html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/css/style.css"><link rel="stylesheet" href="/static/css/config.css"><link rel="stylesheet" href="/static/css/print_export_modal.css"></head><body><main class="page-panel" style="margin:24px;padding:24px;">' + panel + '</main><script src="/static/js/application_backups.js"></script></body></html>'
    state = {"ok": True, "state": "idle", "stage": "Idle", "pending_restore": None}
    requests, errors = [], []
    with sync_playwright() as playwright:
        browser_type = getattr(playwright, sys.argv[1] if len(sys.argv) > 1 else "chromium")
        browser = browser_type.launch(headless=True)
        page = browser.new_page(accept_downloads=True, viewport={"width": 1100, "height": 850})
        page.on("pageerror", lambda error: errors.append(str(error)))

        app = Flask(__name__, static_folder=None)

        @app.route("/", defaults={"request_path": ""}, methods=["GET", "POST"])
        @app.route("/<path:request_path>", methods=["GET", "POST"])
        def route(request_path):
            path = "/" + request_path
            if path == "/":
                return Response(html, content_type="text/html")
            if path.startswith("/static/"):
                return send_file(ROOT / path.lstrip("/"))
            if path == urls["status"]:
                return jsonify(state)
            if path == "/maintenance/backups/download/job":
                return Response(b"PK-test-archive", content_type="application/zip", headers={"Content-Disposition": 'attachment; filename="Deckadence_Backup.zip"'})
            if path == urls["cancel_export"]:
                requests.append((path, request.get_json()))
                state.update(state="cancelled", stage="Export cancelled", cancelling=False, error="", message="Export cancelled. Unfinished ZIP and temporary files removed.")
                return jsonify(ok=True), 202
            if path in {urls["create"], urls["restore"]}:
                payload = request.get_json() if request.is_json else {key.lower(): value for key, value in request.headers.items()}
                requests.append((path, payload))
                state.pop("download_url", None)
                state.update(state="running", operation="backup" if path == urls["create"] else "restore", job_id="job", stage="Exporting user content" if path == urls["create"] else "Validating archive", total_bytes=1024**3, completed_bytes=1024**3 // 4, completed_files=12, current_file="Custom art.png", error="", message="")
                return jsonify(ok=True, job_id="job"), 202
            return "", 404

        server = make_server("127.0.0.1", 0, app, threaded=True)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        page.goto(f"http://127.0.0.1:{server.server_port}/")
        assert page.locator("#applicationRestorePath").count() == 0
        assert page.locator("#applicationBackupFolder").count() == 0
        assert page.locator("#applicationBackupFilename").count() == 0
        assert page.locator("#applicationBackupOpen").inner_text() == "Export"
        page.locator("#applicationBackupOpen").click()
        assert requests == [], "Opening settings must not start exporting"
        page.locator("#applicationBackupSettings summary").click()
        assert page.locator("[data-export-option]:checked").count() == 11
        settings_preview = ROOT / "Export/portable-backup-settings-preview.png"
        settings_preview.parent.mkdir(exist_ok=True)
        page.screenshot(path=str(settings_preview))
        page.locator('[data-export-all="categories"]').uncheck()
        assert page.locator('[data-export-group="categories"]:checked').count() == 0
        page.locator('[data-export-option="decks"]').check()
        assert page.locator('[data-export-all="categories"]').evaluate("element => element.indeterminate")
        page.locator('[data-export-all="assets"]').uncheck()
        page.locator('[data-export-all="settings"]').uncheck()
        page.locator('[data-export-option="decks"]').uncheck()
        assert page.locator("#applicationBackupCreate").is_disabled()
        page.locator('[data-export-option="decks"]').check()
        page.locator("#applicationBackupSettings summary").click()
        page.locator("#applicationBackupCreate").click()
        page.wait_for_function("document.getElementById('applicationBackupModal').open")
        page.wait_for_function("document.getElementById('applicationBackupProgress').value === 25")
        assert page.locator("#applicationBackupModalClose").is_disabled()
        assert requests[0][1]["selection"]["decks"] is True
        assert sum(requests[0][1]["selection"].values()) == 1
        assert page.locator("#applicationBackupCancelExport").is_enabled()
        with page.expect_download() as pending_download:
            state.update(state="complete", job_id="job", stage="Complete", completed_bytes=1024**3, download_url="/maintenance/backups/download/job", result={"zip_path": "E:\\UserBackups\\Deckadence_Backup.zip", "warning_count": 1, "warnings": [{"path": "missing-art.png", "reason": "File is missing"}], "message": "Export complete. 1 unavailable asset skipped."}, message="User content exported.")
        downloaded = pending_download.value
        assert downloaded.suggested_filename == "Deckadence_Backup.zip"
        assert Path(downloaded.path()).read_bytes() == b"PK-test-archive"
        assert "Deckadence_Backup.zip" in page.locator("#applicationBackupSavedPath").inner_text()
        assert page.locator("#applicationBackupDownload").get_attribute("href").endswith("/job")
        assert page.locator("#applicationBackupModalClose").is_enabled()
        assert "print-export-status-panel-complete" in page.locator("#applicationBackupStatusPanel").get_attribute("class")
        assert page.locator('[data-backup-step="complete"]').inner_text() == "Complete"
        assert "1 unavailable asset skipped" in page.locator("#applicationBackupMessage").inner_text()
        assert page.locator("#applicationBackupWarnings").is_visible()
        page.locator("#applicationBackupWarnings summary").click()
        assert "missing-art.png" in page.locator("#applicationBackupWarningList").inner_text()
        output = ROOT / "Export/portable-backup-status-preview.png"
        output.parent.mkdir(exist_ok=True)
        page.screenshot(path=str(output))
        page.locator("#applicationBackupCreate").click()
        page.wait_for_function("document.getElementById('applicationBackupProgress').value === 25")
        page.locator("#applicationBackupCancelExport").click()
        page.wait_for_function("document.getElementById('applicationBackupStage').textContent === 'Export cancelled'")
        assert page.locator("#applicationBackupModalClose").is_enabled()
        assert page.locator("#applicationBackupDownload").is_hidden()
        assert requests[-1][0] == urls["cancel_export"]
        page.locator("#applicationBackupModalClose").click()
        page.locator("#applicationRestoreFile").set_input_files({"name": "custom.zip", "mimeType": "application/zip", "buffer": b"mock backup payload"})
        page.locator("#applicationRestoreConfirmation").fill("IMPORT")
        page.locator("#applicationRestoreStart").click()
        page.wait_for_function("document.getElementById('applicationBackupStage').textContent === 'Validating archive'")
        assert requests[-1][1]["content-type"] == "application/zip"
        assert requests[-1][1]["x-backup-confirmation"] == "IMPORT"
        state.pop("download_url", None)
        state.update(state="complete", stage="Complete", progress_unit="records", total_bytes=42, completed_bytes=42, result={"imported_rows": 42}, message="User content imported into the existing database.")
        page.wait_for_function("document.getElementById('applicationBackupDetail').textContent.includes('42 / 42 records')")
        page.locator("#applicationBackupModalClose").click()
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator("#applicationBackupShowProgress").click()
        if not page.locator("#applicationBackupSettings").get_attribute("open"):
            page.locator("#applicationBackupSettings summary").click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile layout overflow"
        assert page.locator("#applicationBackupModal").bounding_box()["width"] <= 390
        page.screenshot(path=str(ROOT / "Export/portable-backup-mobile-preview.png"))
        assert not errors, errors
        browser.close()
        server.shutdown()
        server.server_close()
    print(json.dumps({"modal_export": "passed", "standard_download": "passed", "zip_import": "passed", "mobile": "passed", "page_errors": errors, "preview": str(output)}))


if __name__ == "__main__":
    main()

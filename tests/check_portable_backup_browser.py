"""Browser checks for the export/import progress modal using mocked jobs."""
import json
from pathlib import Path
import sys
from jinja2 import Environment, FileSystemLoader
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    urls = {"status": "/maintenance/backups/status", "create": "/maintenance/backups/create", "restore": "/maintenance/backups/import", "cancel_restore": "/maintenance/backups/cancel-restore"}
    panel = Environment(loader=FileSystemLoader(ROOT / "templates")).get_template("_application_backup_controls.html").render(url_for=lambda name: urls[name.split(".")[-1]])
    html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/static/css/style.css"><link rel="stylesheet" href="/static/css/config.css"></head><body><main class="page-panel" style="margin:24px;padding:24px;">' + panel + '</main><script src="/static/js/application_backups.js"></script></body></html>'
    state = {"ok": True, "state": "idle", "stage": "Idle", "pending_restore": None}
    requests, errors = [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1100, "height": 850})
        page.on("pageerror", lambda error: errors.append(str(error)))

        def route(request_route):
            request = request_route.request
            path = request.url.split("deckadence.test", 1)[1]
            if path == "/":
                request_route.fulfill(body=html, content_type="text/html")
            elif path.startswith("/static/"):
                file = ROOT / path.lstrip("/")
                request_route.fulfill(body=file.read_text(encoding="utf-8"), content_type="application/javascript" if file.suffix == ".js" else "text/css")
            elif path == urls["status"]:
                request_route.fulfill(json=state)
            elif path in {urls["create"], urls["restore"]}:
                requests.append((path, request.post_data_json if request.headers.get("content-type") == "application/json" else request.headers))
                state.update(state="running", stage="Exporting user content" if path == urls["create"] else "Validating archive", total_bytes=1024**3, completed_bytes=1024**3 // 4, completed_files=12, current_file="Custom art.png", error="", message="")
                request_route.fulfill(status=202, json={"ok": True, "job_id": "job"})
            else:
                request_route.fulfill(status=404, body="")

        page.route("http://deckadence.test/**", route)
        page.goto("http://deckadence.test/")
        page.locator("#applicationBackupFolder").fill("E:\\UserBackups")
        page.locator("#applicationBackupCreate").click()
        page.wait_for_function("document.getElementById('applicationBackupModal').open")
        page.wait_for_function("document.getElementById('applicationBackupProgress').value === 25")
        assert page.locator("#applicationBackupModalClose").is_disabled()
        assert requests[0][1]["output_directory"] == "E:\\UserBackups"
        state.update(state="complete", stage="Complete", completed_bytes=1024**3, download_url="/maintenance/backups/download/job", result={"zip_path": "E:\\UserBackups\\deckadence_user_content.zip"}, message="User content exported.")
        page.locator("#applicationBackupDownload").wait_for(state="visible")
        assert page.locator("#applicationBackupDownload").get_attribute("href").endswith("/job")
        assert "E:\\UserBackups" in page.locator("#applicationBackupSavedPath").inner_text()
        assert page.locator("#applicationBackupModalClose").is_enabled()
        output = ROOT / "Export/portable-backup-status-preview.png"
        output.parent.mkdir(exist_ok=True)
        page.screenshot(path=str(output))
        page.locator("#applicationBackupModalClose").click()
        page.locator("#applicationRestorePath").fill("F:\\Backups\\custom.zip")
        page.locator("#applicationRestoreConfirmation").fill("IMPORT")
        page.locator("#applicationRestoreStart").click()
        assert requests[-1][1] == {"archive_path": "F:\\Backups\\custom.zip", "confirmation": "IMPORT"}
        state.pop("download_url", None)
        state.update(state="complete", stage="Complete", progress_unit="records", total_bytes=42, completed_bytes=42, result={"imported_rows": 42}, message="User content imported into the existing database.")
        page.wait_for_function("document.getElementById('applicationBackupDetail').textContent.includes('42 / 42 records')")
        page.locator("#applicationBackupModalClose").click()
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator("#applicationBackupShowProgress").click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile layout overflow"
        assert page.locator("#applicationBackupModal").bounding_box()["width"] <= 390
        assert not errors, errors
        browser.close()
    print(json.dumps({"modal_export": "passed", "local_import": "passed", "mobile": "passed", "page_errors": errors, "preview": str(output)}))


if __name__ == "__main__":
    main()

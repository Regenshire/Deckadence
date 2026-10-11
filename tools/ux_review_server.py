r"""Run the real UI against a private database snapshot for release UX review.

Usage: python tools\ux_review_server.py
The production database is opened read-only for SQLite's snapshot backup.
Runtime writes go to Export/ux-review/runtime; HTTP mutations are blocked.
"""
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class UXReviewServer:
    def __init__(self, port=5011):
        self.port = port
        self.runtime = ROOT / "Export/ux-review/runtime"

    def prepare(self):
        import paths

        self.runtime.mkdir(parents=True, exist_ok=True)
        snapshot = self.runtime / "cards.db"
        if not snapshot.exists():
            with sqlite3.connect((ROOT / "cards.db").as_uri() + "?mode=ro", uri=True) as source:
                with sqlite3.connect(snapshot) as target:
                    source.backup(target)

        # Keep source templates and bundled assets, isolate every runtime path.
        for name, value in tuple(vars(paths).items()):
            if not name.isupper() or not isinstance(value, str):
                continue
            if name in {"BUNDLE_BASE_DIR", "BUNDLED_PRINT_TEMPLATE_DIR"}:
                continue
            try:
                relative = Path(value).relative_to(ROOT)
            except ValueError:
                continue
            setattr(paths, name, str(self.runtime / relative))
        paths.get_runtime_base_dir = lambda: str(self.runtime)

        import requests

        def offline_request(*args, **kwargs):
            raise requests.ConnectionError("External requests are disabled in the UX review sandbox.")

        requests.sessions.Session.request = offline_request

        import app as application
        from flask import request, send_from_directory

        application.initialize_database()
        application.ensure_draft_testing_schema()
        application.ensure_deck_schema()
        application.ensure_upscaling_schema()
        application.ensure_help_schema()

        @application.app.before_request
        def read_only_review():
            if request.method not in {"GET", "HEAD", "OPTIONS"}:
                return {"ok": False, "message": "Review sandbox: changes are disabled."}, 403

        @application.app.route("/ux-review/<path:filename>")
        def review_artifact(filename):
            return send_from_directory(ROOT / "docs/ux-review", filename)

        from ux_review_fixtures import UXReviewFixtures
        UXReviewFixtures(application).register()

        return application.app

    def run(self):
        self.prepare().run(host="127.0.0.1", port=self.port, debug=False, use_reloader=False)


if __name__ == "__main__":
    UXReviewServer().run()

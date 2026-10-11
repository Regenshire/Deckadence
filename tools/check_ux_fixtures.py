"""HTTP checks for isolated UX fixtures. Start ux_review_server.py first."""
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:5011"


def check():
    results = []
    for foil in (0, 1):
        for special in (0, 1):
            path = f"/ux-fixture/pack-fixed?foil={foil}&special={special}"
            with urlopen(BASE + path, timeout=15) as response:
                html = response.read().decode("utf-8")
                assert response.status == 200
            assert html.count('class="chaos-pack-view-badge"') == foil + special
            assert ('class="chaos-pack-view-badge">Foil</span>' in html) == bool(foil)
            assert ('class="chaos-pack-view-badge">Review special badge</span>' in html) == bool(special)
            assert html.count('class="chaos-pack-view-badges"') == int(bool(foil or special))
            results.append({"path": path, "status": "pass", "badges": foil + special})
    for scenario in ("chaos", "preprint", "first-run", "momir-empty", "momir-card", "momir-select", "tower-card", "backup-progress"):
        path = f"/ux-fixture/{scenario}"
        with urlopen(BASE + path, timeout=15) as response:
            assert response.status == 200
        results.append({"path": path, "status": "pass"})
    (ROOT / "docs/ux-review/fixture-check.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(f"{len(results)} isolated fixture checks passed. No production template was changed.")


if __name__ == "__main__":
    check()

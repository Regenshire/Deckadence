"""Record shipped template/back hashes so backups can identify user changes.

Run with --git-ref HEAD to use committed defaults, or without it during packaging
to describe the tracked files actually being shipped. Untracked uploads are never
registered as shipped defaults.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PREFIXES = ("print/templates/", "static/sil/", "static/img/card_backs/", "static/img/pack_art/")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--git-ref")
    args = parser.parse_args()
    listing = subprocess.check_output(["git", "ls-tree", "-r", "-z", "--name-only", args.git_ref or "HEAD"], cwd=ROOT).decode().split("\0")
    files, cutting = {}, {}
    for name in listing:
        if not name.startswith(PREFIXES) or Path(name).suffix.lower() not in {".ini", ".json", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".pdf", ".dxf", ".fcm", ".studio3"}:
            continue
        data = subprocess.check_output(["git", "show", f"{args.git_ref}:{name}"], cwd=ROOT) if args.git_ref else (ROOT / name).read_bytes()
        if Path(name).suffix.lower() in {".ini", ".json", ".svg"}:
            data = data.replace(b"\r\n", b"\n")
        files[name] = hashlib.sha256(data).hexdigest()
        if name == "static/sil/Studio3/templates.json":
            cutting = {item["filename"]: item for item in json.loads(data).get("templates", [])}
    (ROOT / "backup_defaults.json").write_text(json.dumps({"files": files, "cutting_templates": cutting}, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

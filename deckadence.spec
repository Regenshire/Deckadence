# -*- mode: python ; coding: utf-8 -*-
import os
import runpy
import shutil
import subprocess
import sys

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = ['paths', 'settings', 'image_export_templates', 'pack_label_templates']
# This installer is reached only when the user sets up Studio.
hiddenimports += ['plugin_system.python_runtime']
hiddenimports += collect_submodules('db')
hiddenimports += collect_submodules('modes')
hiddenimports += collect_submodules('ui')
hiddenimports += collect_submodules('plugin_system')

# Baseline only tracked shipped resources; portable backups exclude unchanged defaults.
import hashlib
import json
from pathlib import Path

ROOT = Path(SPECPATH)
# Bundle the same validated source payload as the standalone Studio ZIP.
# Local models, virtual environments and user prompt overrides are excluded.
studio_builder = runpy.run_path(str(ROOT / 'plugin_src/build_card_finishing_plugin.py'))
studio_manifest, studio_files = studio_builder['validate_package'](ROOT / 'plugin_src/card-finishing-studio')
studio_datas = [(str(path), str(Path('plugin_src/card-finishing-studio') / Path(name).parent))
                for name, path in studio_files.items()]
mpcfill_builder = runpy.run_path(str(ROOT / 'plugin_src/build_mpcfill_plugin.py'))
mpcfill_manifest, mpcfill_files = mpcfill_builder['validate_package'](ROOT / 'plugin_src/mpcfill-browser')
mpcfill_builder['validate_application'](ROOT)
mpcfill_datas = [(str(path), 'plugin_src/mpcfill-browser') for path in mpcfill_files.values()]
compile((ROOT / 'plugin_system/python_runtime.py').read_bytes(), 'plugin_system/python_runtime.py', 'exec')
PREFIXES = ("print/templates/", "static/sil/", "static/img/card_backs/", "static/img/pack_art/")
listing = subprocess.check_output(["git", "ls-tree", "-r", "-z", "--name-only", "HEAD"], cwd=ROOT).decode().split("\0")
files, cutting = {}, {}
for name in listing:
    if not name.startswith(PREFIXES) or Path(name).suffix.lower() not in {".ini", ".json", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".pdf", ".dxf", ".fcm", ".studio3"}:
        continue
    data = (ROOT / name).read_bytes()
    if Path(name).suffix.lower() in {".ini", ".json", ".svg"}:
        data = data.replace(b"\r\n", b"\n")
    files[name] = hashlib.sha256(data).hexdigest()
    if name == "static/sil/Studio3/templates.json":
        cutting = {item["filename"]: item for item in json.loads(data).get("templates", [])}
(ROOT / "backup_defaults.json").write_text(json.dumps({"files": files, "cutting_templates": cutting}, indent=2, sort_keys=True) + "\n", encoding="utf-8")


a = Analysis(
    ['app.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('backup_defaults.json', '.'),
        ('templates', 'templates'),
        ('static', 'static'),
        ('print', 'print'),
        ('db', 'db'),
        ('modes', 'modes'),
    ] + studio_datas + mpcfill_datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

a.datas = [
    data_item
    for data_item in a.datas
    if not data_item[0].lower().endswith(".psd")
]

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Deckadence',
    icon=str(ROOT / 'static' / 'img' / 'Logos' / 'deckadence_d.ico'),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='Deckadence',
)

distribution_dir = os.path.join(DISTPATH, 'Deckadence')

for distribution_filename in (
    'README.md',
    'LICENSE.txt',
):
    source_path = os.path.join(SPECPATH, distribution_filename)
    destination_path = os.path.join(
        distribution_dir,
        distribution_filename,
    )

    shutil.copy2(
        source_path,
        destination_path,
    )

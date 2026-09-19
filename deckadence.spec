# -*- mode: python ; coding: utf-8 -*-
import os
import shutil

from PyInstaller.utils.hooks import collect_submodules

hiddenimports = ['paths', 'settings', 'image_export_templates', 'pack_label_templates']
hiddenimports += collect_submodules('db')
hiddenimports += collect_submodules('modes')
hiddenimports += collect_submodules('ui')
hiddenimports += collect_submodules('plugin_system')


a = Analysis(
    ['app.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('templates', 'templates'),
        ('static', 'static'),
        ('print', 'print'),
        ('db', 'db'),
        ('modes', 'modes'),
    ],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='Deckadence',
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
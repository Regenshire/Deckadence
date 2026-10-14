"""Build Linux x86-64 upscaler ZIPs in WSL, with relocatable Python included."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tempfile
import zipfile

from package_runtime import package_runtime, prepare_runtime


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plugin', choices=['all', 'cpu', 'nvidia-rtx50', 'amd-rocm'], default='all')
    args = parser.parse_args()
    if sys.platform != 'linux' or platform.machine() != 'x86_64':
        parser.error('Run this builder inside x86-64 Linux/WSL.')
    root = Path(__file__).resolve().parent.parent
    work = root / '.dev_prompts/ai_work/linux-plugins'
    work.mkdir(parents=True, exist_ok=True)
    runtime = prepare_runtime(work / 'python-runtime')
    run = Path(tempfile.mkdtemp(prefix='release-', dir=work))
    dist = root / 'dist'
    dist.mkdir(exist_ok=True)
    for name in ['cpu', 'nvidia-rtx50', 'amd-rocm']:
        if args.plugin not in {'all', name}:
            continue
        source = root / 'plugin_src' / f'upscaler-{name}'
        package = run / f'upscaler-{name}'
        package.mkdir()
        for filename in ['plugin.py', 'model_runtime.py', 'deckadence-plugin.json', 'requirements.txt']:
            shutil.copyfile(source / filename, package / filename)
        shutil.copytree(source / 'processors', package / 'processors',
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
        if name == 'amd-rocm':
            shutil.copyfile(source / 'requirements-linux.txt', package / 'requirements.txt')
        package_runtime(runtime, package)
        manifest = json.loads((package / 'deckadence-plugin.json').read_text())
        # Keep the protocol's reported version aligned with the release manifest.
        plugin = package / 'plugin.py'
        import re
        plugin.write_text(re.sub(r'^PLUGIN_VERSION = .+$',
                                f'PLUGIN_VERSION = "{manifest["version"]}"',
                                plugin.read_text(), flags=re.MULTILINE))
        (package / 'README.md').write_text(
            f'# {manifest["name"]} for Linux x86-64\n\n'
            'Python 3.12 is included. Deckadence downloads libraries and models during installation.\n'
            'GPU plugins require compatible hardware and host GPU drivers.\n'
            'AMD uses ROCm 7.2; NVIDIA uses CUDA 12.8. CPU requires no GPU.\n')
        asset_name = name.replace('nvidia-rtx50', 'nvidia')
        archive = run / f'deckadence-upscaler-{asset_name}-runtime-linux-x86_64.zip'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
            for path in sorted(package.rglob('*')):
                if path.is_file():
                    output.write(path, path.relative_to(package).as_posix())
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        archive.with_suffix('.zip.sha256').write_text(f'{digest}  {archive.name}\n')
        checksum = archive.with_suffix('.zip.sha256')
        checksum.replace(dist / checksum.name)
        archive = archive.replace(dist / archive.name)
        display_path = str(archive)
        if shutil.which('wslpath'):
            display_path = subprocess.check_output(['wslpath', '-w', str(archive)], text=True).strip()
        print('\n========================================\nLINUX UPSCALER BUILD COMPLETE\n========================================')
        print(f'Plugin: {manifest["name"]}\nPlugin ID: {manifest["plugin_id"]}\nVersion: {manifest["version"]}')
        print(f'Platform: Linux x86-64\nBundled Python: 3.12\nRelease ZIP: {display_path}')
        print(f'ZIP size: {archive.stat().st_size / 1048576:.2f} MB\nSHA-256: {digest}')
        print(f'Checksum file: {display_path}.sha256')
        print(f'GitHub tag: plugin-upscaler-{asset_name}-v{manifest["version"]}')
        print(f'GitHub release title: {manifest["name"]} v{manifest["version"]}')
        print(f'GitHub asset name: {archive.name}', flush=True)
    print('Packages built. Dependencies, model inference, and GPU compatibility still require runtime testing.')


if __name__ == '__main__':
    main()

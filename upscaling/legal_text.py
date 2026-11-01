"""Settings and host-side legal footer processing, shared by every upscaler."""
import json
import os
from pathlib import Path
import subprocess
import time
import unicodedata

from paths import BUNDLE_BASE_DIR

DEFAULT_TEXT = 'PROXY • NOT FOR SALE'
MODES = ('none', 'remove', 'custom')


def resolve_legal_options(config, replacement=None, custom_text=None):
    mode = config.get('upscaling_legal_replacement', 'none') if replacement is None else replacement
    text = config.get('upscaling_legal_custom_text', DEFAULT_TEXT) if custom_text is None else custom_text
    if mode not in MODES:
        raise ValueError('Choose a valid legal text replacement.')
    if not isinstance(text, str):
        raise ValueError('Enter custom proxy text.')
    text = text.replace('\r\n', '\n').replace('\r', '\n').strip()
    text = '\n'.join(' '.join(line.split()) for line in text.split('\n'))
    if len(text) > 100 or len(text.split('\n')) > 2 or any(not row for row in text.split('\n')):
        raise ValueError('Use one or two lines of proxy text, up to 100 characters total.')
    if any(unicodedata.category(c).startswith('C') for c in text if c != '\n'):
        raise ValueError('Proxy text contains unsupported control characters.')
    if mode == 'custom' and not text:
        raise ValueError('Enter the proxy text to use for replacement.')
    return dict(replacement=mode, custom_text=text)


def legal_runtime():
    from plugin_system.card_spot_foil import text_detection_plugin
    from plugin_system.manager import get_plugin_runtime_context
    return get_plugin_runtime_context('card-finishing-studio') if text_detection_plugin() else None


def legal_settings(config):
    return dict(**resolve_legal_options(config), available=bool(legal_runtime()))


def require_legal_runtime(options):
    if options['replacement'] == 'none':
        return None
    runtime = legal_runtime()
    if not runtime:
        raise ValueError('Install Card Finishing Studio AI detection in Plugin Manager to replace legal text.')
    return runtime


def apply_legal_text(path, options, source_path=None):
    if options['replacement'] == 'none':
        return dict(replacement='none', detected=False, applied=False, reason='kept')
    from plugin_system.card_spot_foil import _text_detection_lock
    from plugin_system.manager import _plugin_environment
    runtime = require_legal_runtime(options)
    started = time.perf_counter()
    payload = dict(**options, path=os.path.abspath(path),
                   source_path=os.path.abspath(source_path) if source_path else None,
                   font_path=str(Path(BUNDLE_BASE_DIR, 'static', 'fonts', 'Matrix-Bold.ttf')))
    # Like Studio text repair, use shipped source with the installed libraries.
    # This makes the feature available without changing three upscaler packages.
    with _text_detection_lock:
        result = subprocess.run(
            [runtime['plugin_python'], '-B', '-E', '-s',
             str(Path(BUNDLE_BASE_DIR, 'plugin_src', 'card-finishing-studio', 'legal_text.py'))],
            input=json.dumps(payload), capture_output=True, text=True, encoding='utf-8',
            env=_plugin_environment(), timeout=180, check=False,
            **({'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}))
    if result.returncode:
        raise RuntimeError('Legal text processing failed. ' + result.stderr.strip()[-500:])
    info = json.loads(result.stdout)
    if not info.get('ok'):
        raise RuntimeError('Legal text processing did not complete.')
    info['processing_ms'] = round((time.perf_counter()-started)*1000)
    return info


def register_legal_text_routes(app, get_config, update_config):
    from flask import jsonify, request

    @app.route('/config/upscaling/legal-text', methods=['GET', 'POST'])
    def config_upscaling_legal_text():
        if request.method == 'POST':
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                return jsonify(ok=False, message='Provide legal text settings.'), 400
            try:
                options = resolve_legal_options(get_config(), payload.get('replacement'), payload.get('custom_text'))
            except ValueError as exc:
                return jsonify(ok=False, message=str(exc)), 400
            update_config({'upscaling_legal_replacement': options['replacement'],
                           'upscaling_legal_custom_text': options['custom_text']})
        return jsonify(ok=True, **legal_settings(get_config()))

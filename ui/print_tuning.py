"""Print Tuning preferences and previews; source selection stays with the app."""
import base64
from io import BytesIO
import json
import threading
from pathlib import Path

from flask import jsonify, request
from PIL import Image
from print_tuning import (ADJUSTMENTS, CONFIG_KEY, PAPERS, PROFILES, file_analysis, apply_tuning,
                          needs_analysis, parameters, preferences, validate_output, validate_settings)

_preferences_lock = threading.Lock()


def register_print_tuning_routes(app, get_config, update_config, select_cards, resolve_source, prepare_image, guard):
    @app.route('/print-tuning/settings', methods=['GET', 'POST'])
    def print_tuning_settings():
        from plugin_system.print_color import list_profiles
        try:
            with _preferences_lock:
                saved = preferences(get_config())
                if request.method == 'POST':
                    if request.content_length and request.content_length > 32768:
                        return jsonify(ok=False, message='Print Tuning settings are too large.'), 413
                    payload = request.get_json(silent=True)
                    if not isinstance(payload, dict):
                        raise ValueError('Provide Print Tuning settings.')
                    action = payload.get('action')
                    if action in ('save', 'default'):
                        settings = validate_settings(payload.get('settings'))
                        validate_output(settings)
                        if action == 'default':
                            saved['default'] = settings
                        else:
                            name = payload.get('name')
                            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 60:
                                raise ValueError('Enter a settings name of 1 to 60 characters.')
                            name = name.strip()
                            existing = next((p for p in saved['presets'] if p['name'].casefold() == name.casefold()), None)
                            if existing and payload.get('replace') is not True:
                                return jsonify(ok=False, message='That name is already saved.'), 409
                            if existing:
                                existing.update(name=name, settings=settings)
                            elif len(saved['presets']) < 50:
                                saved['presets'].append({'name': name, 'settings': settings})
                            else:
                                raise ValueError('Remove a saved setting before adding another (limit: 50).')
                    elif action == 'delete':
                        name = payload.get('name')
                        saved['presets'] = [p for p in saved['presets'] if p['name'] != name]
                    else:
                        raise ValueError('Choose Save, Delete, or Set as default.')
                    update_config({CONFIG_KEY: json.dumps(saved, allow_nan=False)})
            return jsonify(ok=True, preferences=saved, profiles=PROFILES, papers=PAPERS, adjustments=ADJUSTMENTS, icc_profiles=list_profiles())
        except (ValueError, OSError) as exc:
            return jsonify(ok=False, message=str(exc)), 400

    @app.post('/print-tuning/selection')
    def print_tuning_selection():
        try:
            with guard():
                return jsonify(ok=True, cards=select_cards())
        except (ValueError, LookupError, RuntimeError) as exc:
            return jsonify(ok=False, message=str(exc)), 400

    @app.post('/print-tuning/preview')
    def print_tuning_preview():
        try:
            if request.content_length and request.content_length > 32768:
                return jsonify(ok=False, message='Preview request is too large.'), 413
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                raise ValueError('Choose a card to preview.')
            settings = validate_settings(payload.get('settings'))
            validate_output(settings)
            preview_size = payload.get('preview_size', 640)
            if preview_size not in (640, 1280):
                raise ValueError('Choose a supported preview size.')
            with guard():
                path = resolve_source(payload.get('card'))
                stat = Path(path).stat()
                stats = file_analysis(str(path), stat.st_mtime_ns, stat.st_size) if needs_analysis(settings) else None
                with Image.open(path) as source:
                    source.draft('RGB', (preview_size * 2, preview_size * 2))
                    image = source.convert('RGB')
                    image.thumbnail((preview_size, preview_size), Image.Resampling.LANCZOS)
                    image = prepare_image(image, settings)
                tuned = apply_tuning(image, settings, stats)
            def encode(pixels):
                out = BytesIO()
                pixels.save(out, 'JPEG', quality=93, subsampling=0)
                return 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode('ascii')
            description = ''
            if stats is not None:
                description = ('Deep shadows' if stats['dark'] > .28 else
                               'Compressed tonal range' if stats['spread'] < .5 else
                               'Mostly muted colors' if stats['saturation'] < .23 else 'Broad tonal range')
            return jsonify(ok=True, original=encode(image), tuned=encode(tuned), analysis=description,
                           adjustments={k: round(v, 1) for k, v in parameters(settings, stats).items()})
        except (ValueError, LookupError, OSError, RuntimeError) as exc:
            return jsonify(ok=False, message=str(exc)), 400

"""Printer workflow preferences for the spot-foiling editor and PDF exporter.

The canonical selection describes where foil should show. White-underbase
export inverts that selection within the card; foil and varnish use it directly.
Preferences never create masks or enable exports automatically.
"""
from copy import deepcopy
import json
import re

from flask import jsonify, render_template, request
from .print_color import PROFILE_DIR, MAX_PROFILE_BYTES, list_profiles, profile_bytes, upload_profile

CONFIG_KEY = "spot_foil_workflows"
DEFAULT_WORKFLOW = "roland_uv"
OUTPUTS = {
    "spot_pdf": "PDF with named spot separation",
    "mask_pdf": "Separate black-only mask PDF",
    "grayscale_png": "Grayscale mask PNG (export planned)",
    "alpha_png": "Alpha mask PNG (export planned)",
}
LAYER_TYPES = {
    "white_underbase": "White underbase (hide foil)",
    "foil_application": "Foil / adhesive (apply foil)",
    "varnish": "Varnish / gloss",
}
BASE_OPTIONS = {
    "layer_type": "white_underbase", "output_format": "spot_pdf",
    "spot_name": "White", "spot_display_color": "#FF00FF", "mask_tone": "binary", "coverage_percent": 100,
    "edge_adjustment_mm": 0, "safe_margin_mm": 0, "resolution_ppi": 600,
    "selection": "highlights", "protect_text": True, "protect_frame": True,
    "selection_amount": 35, "foil_coverage_percent": 100, "generation_action": "foil", "selection_cleanup": "balanced",
    "text_treatment": "original", "border_treatment": "original", "border_width_percent": 2,
    "review_mask": True, "overprint": True, "raster_polarity": "white_coverage",
}


def _preset(identifier, label, description, *, layer="white_underbase",
            spot="White", output="spot_pdf", solid_only=False, custom=False):
    return {
        "id": identifier, "label": label, "description": description,
        "layer_types": list(LAYER_TYPES) if custom else [layer],
        "output_formats": ["spot_pdf", "mask_pdf"] if solid_only else list(OUTPUTS),
        "mask_tones": ["binary"] if solid_only else ["binary", "grayscale"],
        "defaults": {**BASE_OPTIONS, "layer_type": layer, "spot_name": spot,
                     "output_format": output},
    }


WORKFLOWS = [
    _preset("roland_uv", "Roland UV / VersaWorks",
            "White ink over holographic or metallic stock. Uses RDG_WHITE.", spot="RDG_WHITE"),
    _preset("mimaki_uv", "Mimaki UV / RasterLink",
            "Separate white-ink mask for mapping black to white in RasterLink. "
            "A named spot PDF is also available if your RIP is configured for it.",
            output="mask_pdf"),
    _preset("cadlink_uv", "CADlink / Digital Factory UV",
            "Independent white-ink coverage. Map the spot name in your queue, "
            "or choose an alpha mask for a separately configured white layer."),
    _preset("uv_foil_transfer", "UV foil transfer / adhesive",
            "A solid mask for the material that bonds foil to the selected areas. "
            "Use your printer's supported adhesive and finishing process.",
            layer="foil_application", spot="Foil", output="mask_pdf", solid_only=True),
    _preset("spot_varnish", "Spot UV / varnish",
            "Coat the selected areas with gloss or varnish. Set the spot name "
            "to your RIP's swatch; this finish does not add metallic foil.",
            layer="varnish", spot="Varnish"),
    _preset("commercial_foil", "Commercial hot / cold foil",
            "Solid foil coverage supplied as a black-only mask or named spot PDF. "
            "Set margins and the spot name to your print provider's requirements.",
            layer="foil_application", spot="Foil", output="mask_pdf", solid_only=True),
    _preset("toner_foil", "Toner-reactive foil",
            "Solid coverage for the separate toner pass. Keep color artwork "
            "and the foil mask in separate print jobs.",
            layer="foil_application", spot="Foil", output="mask_pdf", solid_only=True),
    _preset("custom", "Custom workflow",
            "Choose the layer purpose, format, and channel name for another RIP "
            "or finishing process.", custom=True),
]
PRESETS = {workflow["id"]: workflow for workflow in WORKFLOWS}
BOOL_FIELDS = {"protect_text", "protect_frame", "review_mask", "overprint"}
NUMBER_LIMITS = {
    "coverage_percent": (0, 100), "edge_adjustment_mm": (-2, 2),
    "safe_margin_mm": (0, 10),
    "selection_amount": (5, 100), "foil_coverage_percent": (1, 100), "border_width_percent": (0, 12),
}


def normalize_display_color(value):
    if not isinstance(value, str) or not re.fullmatch(r"#?[0-9a-fA-F]{6}", value.strip()):
        raise ValueError("Use a six-digit display color, such as 838588 or #838588.")
    return "#" + value.strip().lstrip("#").upper()


def validate_options(workflow_id, options):
    """Reject invalid user input rather than silently changing print intent."""
    preset = PRESETS[workflow_id]
    if not isinstance(options, dict) or set(options) - set(BASE_OPTIONS):
        raise ValueError("Unrecognized workflow settings.")
    result = {**preset["defaults"], **options}
    enums = {
        "layer_type": preset["layer_types"], "output_format": preset["output_formats"],
        "mask_tone": preset["mask_tones"],
        "selection": ["artwork", "subject", "background", "highlights", "colors", "details", "shadows", "manual"],
        "text_treatment": ["original", "opaque", "foil"], "border_treatment": ["original", "opaque", "foil"],
        "generation_action": ["foil", "opaque"],
        "selection_cleanup": ["off", "balanced", "strong"],
        "raster_polarity": ["white_coverage", "black_coverage"],
    }
    for key, choices in enums.items():
        if result[key] not in choices:
            raise ValueError(f"Invalid {key.replace('_', ' ')} for this workflow.")
    if type(result["resolution_ppi"]) is not int or result["resolution_ppi"] not in (300, 600, 1200):
        raise ValueError("Mask resolution must be 300, 600, or 1200 PPI.")
    for key in BOOL_FIELDS:
        if type(result[key]) is not bool:
            raise ValueError(f"{key.replace('_', ' ').capitalize()} must be on or off.")
    for key, (minimum, maximum) in NUMBER_LIMITS.items():
        value = result[key]
        if type(value) not in (int, float) or not minimum <= value <= maximum:
            raise ValueError(f"{key.replace('_', ' ').capitalize()} must be between {minimum} and {maximum}.")
    if preset["mask_tones"] == ["binary"] and result["coverage_percent"] != 100:
        raise ValueError("This workflow requires solid 100% coverage.")
    name = result["spot_name"]
    if (not isinstance(name, str) or not name.strip() or len(name) > 80
            or any(ord(char) < 32 or ord(char) > 126 for char in name)
            or name.strip().lower() in {"all", "none"}):
        raise ValueError("Use a spot name of 1-80 printable ASCII characters, other than All or None.")
    result["spot_name"] = name.strip()
    result["spot_display_color"] = normalize_display_color(result["spot_display_color"])
    return result


PDF_VERSIONS = ("1.5", "1.6", "1.7")

def validate_pdf_version(value):
    if value not in PDF_VERSIONS:
        raise ValueError("Choose PDF version 1.5, 1.6, or 1.7.")
    return value

def load_preferences(config):
    defaults = {"pdf_version": "1.5", "active_workflow": DEFAULT_WORKFLOW, "cmyk_profile": "", "disable_gloss_on_view": False, "include_effect1_default": True, "include_effect2_default": True,
                "text_border_defaults_version": 1,
                "profiles": {key: deepcopy(value["defaults"]) for key, value in PRESETS.items()}}
    try:
        saved = json.loads(config.get(CONFIG_KEY) or "{}")
    except (TypeError, ValueError):
        return defaults
    if not isinstance(saved, dict):
        return defaults
    if isinstance(saved.get("active_workflow"), str) and saved["active_workflow"] in PRESETS:
        defaults["active_workflow"] = saved["active_workflow"]
    defaults["disable_gloss_on_view"] = saved.get("disable_gloss_on_view") is True
    for key in ("include_effect1_default", "include_effect2_default"):
        if type(saved.get(key)) is bool: defaults[key] = saved[key]
    if isinstance(saved.get("cmyk_profile"),str): defaults["cmyk_profile"]=saved["cmyk_profile"]
    if saved.get("pdf_version") in PDF_VERSIONS: defaults["pdf_version"] = saved["pdf_version"]
    profiles = saved.get("profiles", {})
    if isinstance(profiles, dict):
        for key, options in profiles.items():
            if key in PRESETS:
                try:
                    defaults["profiles"][key] = validate_options(key, options)
                    # Older profiles stored the former opaque defaults. Adopt
                    # Follow automatic selection without changing card masks.
                    # A later explicit preference save keeps its chosen values.
                    if saved.get("text_border_defaults_version") != 1:
                        defaults["profiles"][key].update(text_treatment="original", border_treatment="original")
                except (ValueError, TypeError):
                    pass
    return defaults


def resolve_workflow(config):
    """Return an independent, validated settings object for a future print job."""
    preferences = load_preferences(config)
    key = preferences["active_workflow"]
    return {"workflow_id": key, **preferences["profiles"][key]}


def resolve_export_workflow(config, workflow_id=None, overrides=None):
    """Choose one print workflow for the entire job, independently of cards."""
    preferences = load_preferences(config)
    key = workflow_id or preferences["active_workflow"]
    if not isinstance(key, str) or key not in PRESETS:
        raise ValueError("Choose a supported print workflow.")
    options = validate_options(key, {**preferences["profiles"][key], **(overrides or {})})
    # The reviewed card mask is final; printing must not run design selections.
    options.update(selection="manual", protect_text=False, protect_frame=False)
    return {"workflow_id": key, **options}


def register_foil_workflow_routes(app, get_config, update_config):
    @app.route("/config/plugins/spot-foil/icc-profiles", methods=["POST"])
    def spot_foil_icc_upload():
        if request.content_length and request.content_length > MAX_PROFILE_BYTES + 65536:
            return jsonify(ok=False,message="Choose an ICC profile smaller than 16 MB."),413
        upload=request.files.get("profile")
        if not upload: return jsonify(ok=False,message="Choose an ICC profile to upload."),400
        try:
            name=upload_profile(upload.filename or "profile.icc",upload.read(MAX_PROFILE_BYTES+1))
            return jsonify(ok=True,selected=name,icc_profiles=list_profiles())
        except (ValueError,OSError) as exc: return jsonify(ok=False,message=str(exc)),400

    @app.route("/help/spot-foiling")
    def spot_foil_help():
        return render_template("spot_foil_guide.html", workflows=WORKFLOWS,
                               output_formats=OUTPUTS)

    @app.route("/config/plugins/spot-foil/workflows", methods=["GET", "POST"])
    def spot_foil_workflows():
        preferences = load_preferences(get_config())
        if request.method == "POST":
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict) or set(payload) - {"active_workflow", "profiles", "disable_gloss_on_view", "include_effect1_default", "include_effect2_default", "cmyk_profile", "pdf_version"}:
                return jsonify(ok=False, message="Provide workflow settings as a JSON object."), 400
            disabled = payload.get("disable_gloss_on_view", preferences["disable_gloss_on_view"])
            if type(disabled) is not bool:
                return jsonify(ok=False, message="Disable Gloss Layer on View must be a checkbox value."), 400
            effect_defaults = {key:payload.get(key,preferences[key]) for key in ("include_effect1_default", "include_effect2_default")}
            if any(type(value) is not bool for value in effect_defaults.values()):
                return jsonify(ok=False, message="Effect defaults must be checkbox values."), 400
            active = payload.get("active_workflow", preferences["active_workflow"])
            profiles = payload.get("profiles", {})
            if not isinstance(active, str) or active not in PRESETS or not isinstance(profiles, dict):
                return jsonify(ok=False, message="Choose a supported workflow."), 400
            try:
                pdf_version = validate_pdf_version(payload.get("pdf_version", preferences["pdf_version"]))
                profile = payload.get("cmyk_profile", preferences["cmyk_profile"])
                if profile: profile_bytes(profile)
                elif not isinstance(profile,str): raise ValueError("Choose a CMYK profile.")
                updates = {}
                for key, options in profiles.items():
                    if key not in PRESETS:
                        raise ValueError("Unrecognized workflow.")
                    if not isinstance(options, dict):
                        raise ValueError("Workflow options must be an object.")
                    updates[key] = validate_options(key, {**preferences["profiles"][key], **options})
            except (ValueError, TypeError) as exc:
                return jsonify(ok=False, message=str(exc)), 400
            preferences["pdf_version"] = pdf_version
            preferences["cmyk_profile"] = profile
            preferences.update(effect_defaults)
            preferences["disable_gloss_on_view"] = disabled
            preferences["active_workflow"] = active
            preferences["profiles"].update(updates)
            update_config({CONFIG_KEY: json.dumps(preferences, allow_nan=False)})
        return jsonify(ok=True, schema_version=1, preferences=preferences,
                       workflows=WORKFLOWS, output_formats=OUTPUTS, layer_types=LAYER_TYPES,
                       icc_profiles=list_profiles(), icc_profile_folder=str(PROFILE_DIR.resolve()))

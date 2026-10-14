# *** EMBLEMS - Set Colors, Positions, and Custom Artwork ***
import base64

import io

import json

import math

import re

from defusedxml import ElementTree

from PIL import Image



FOIL_COLORS = ("silver", "gold", "white", "blue", "rainbow", "red", "green", "purple", "custom")





def web_color(value):

    value = str(value).strip()

    if not re.fullmatch(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?", value):

        raise ValueError("Enter a web color as #RGB or #RRGGBB.")

    if len(value) == 4:

        value = "#" + "".join(c * 2 for c in value[1:])

    return value.lower()





def slider_value(value):

    try:

        number = float(value)

    except (TypeError, ValueError):

        raise ValueError("Emblem position must be a number.")

    if not math.isfinite(number) or not -100 <= number <= 100:

        raise ValueError("Emblem position must be between -100 and 100.")

    return number





def render_custom_svg(source):

    if not isinstance(source, str) or not source.strip():

        raise ValueError("Choose an SVG file.")

    if len(source.encode("utf-8")) > 262144:

        raise ValueError("SVG files must be 256 KB or smaller.")

    try:

        root = ElementTree.fromstring(source)

    except Exception as exc:

        raise ValueError("Invalid SVG file.") from exc

    allowed = {"svg", "g", "path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "pattern", "use", "style", "title", "desc"}

    nodes = list(root.iter())

    if root.tag.split("}")[-1] != "svg" or len(nodes) > 5000:

        raise ValueError("SVG is invalid or too complex.")

    for node in nodes:

        if node.tag.split("}")[-1] not in allowed:

            raise ValueError("Use an SVG containing vector shapes only (no images, scripts, or text).")

        for key, value in node.attrib.items():

            name = key.split("}")[-1].lower()

            if name.startswith("on") or name == "base" or (name == "href" and not value.startswith("#")):

                raise ValueError("SVG external resources and scripts are not supported.")

    if re.search(r"<!DOCTYPE|<!ENTITY|@import|@font-face", source, re.I):

        raise ValueError("SVG external resources are not supported.")

    for reference in re.findall(r"url\s*\((.*?)\)", source, re.I):

        if not reference.strip().strip("\"'").startswith("#"):

            raise ValueError("SVG external resources are not supported.")

    # Reject CSS escapes that could disguise external URL references.

    if "\\" in source:

        raise ValueError("Escaped SVG styles are not supported.")

    import cairosvg

    try:

        data = cairosvg.svg2png(bytestring=source.encode("utf-8"), output_width=1024, output_height=1024)

        image = Image.open(io.BytesIO(data)).convert("RGBA")

        bounds = image.getchannel("A").getbbox()

        if not bounds:

            raise ValueError("SVG contains no visible artwork.")

        image = image.crop(bounds)

        canvas = Image.new("RGBA", (max(image.size),) * 2)

        canvas.alpha_composite(image, ((canvas.width-image.width)//2, (canvas.height-image.height)//2))

        output = io.BytesIO()

        canvas.save(output, format="PNG")

        return base64.b64encode(output.getvalue()).decode("ascii")

    except ValueError:

        raise

    except Exception as exc:

        raise ValueError("Could not render this SVG.") from exc





def emblem_options(config):

    color = config.get("upscaling_emblem_color", "silver")

    return {

        "color": color if color in FOIL_COLORS else "silver",

        "custom_color": web_color(config.get("upscaling_emblem_custom_color", "#3a8dff")),

        "custom_png": config.get("upscaling_custom_emblem_png", ""),

        "center_mode": config.get("upscaling_custom_emblem_center_mode", "card"),
        "custom_x": slider_value(config.get("upscaling_custom_emblem_x", "0")),

        "custom_y": slider_value(config.get("upscaling_custom_emblem_y", "0")),

    }





def catalog(config):

    try:

        entries = json.loads(config.get("upscaling_custom_emblems", "[]"))

        return entries if isinstance(entries, list) else []

    except (TypeError, ValueError):

        return []





def emblem_position(entry, config):
    position = entry.get("position") or {}
    mode = position.get("center_mode", config.get("upscaling_custom_emblem_center_mode", "card"))
    if mode not in ("card", "holofoil"):
        raise ValueError("Invalid emblem centering mode.")
    return {
        "center_mode": mode,
        "custom_x": slider_value(position.get("custom_x", config.get("upscaling_custom_emblem_x", "0"))),
        "custom_y": slider_value(position.get("custom_y", config.get("upscaling_custom_emblem_y", "0"))),
    }


def deckadance_position(config):
    try:
        position = json.loads(config.get("upscaling_deckadance_position", "{}"))
    except (TypeError, ValueError):
        position = {}
    # Migrate the previous built-in compensation to the actual SVG baseline.
    if not position.get("baseline_version") and position.get("center_mode", "card") == "card" and position.get("custom_x") == 45 and position.get("custom_y") == -50:
        position = {}
    # Zero offsets use X 50.9%, Y 94%, defined by the Deckadance renderer.
    return emblem_position({"position": {
        "center_mode": position.get("center_mode", "card"),
        "custom_x": position.get("custom_x", 0),
        "custom_y": position.get("custom_y", 0),
    }}, {})


def resolve_options(config, requested=None, replacement="deckadance"):

    values = emblem_options(config)

    values["custom_id"] = config.get("upscaling_custom_emblem_id", "")

    selected_id = requested.get("custom_id", values["custom_id"]) if isinstance(requested, dict) else values["custom_id"]
    entry = next((item for item in catalog(config) if item["id"] == selected_id), None)
    if replacement == "custom" and entry:
        values.update(emblem_position(entry, config))
    elif replacement == "deckadance":
        values.update(deckadance_position(config))

    if requested is not None:

        if not isinstance(requested, dict):

            raise ValueError("Invalid emblem options.")

        for key in ("color", "custom_color", "custom_x", "custom_y", "custom_id", "center_mode"):

            if key in requested:

                values[key] = requested[key]

    if values["color"] not in FOIL_COLORS:

        raise ValueError("Invalid foil color.")

    values["custom_color"] = web_color(values["custom_color"])

    if values["center_mode"] not in ("card", "holofoil"):
        raise ValueError("Invalid emblem centering mode.")
    values["custom_x"] = slider_value(values["custom_x"])

    values["custom_y"] = slider_value(values["custom_y"])

    values.pop("custom_png", None)

    if replacement == "custom":

        entry = next((item for item in catalog(config) if item["id"] == values["custom_id"]), None)

        if not entry:

            raise ValueError("Choose a saved custom emblem using the gear button.")

        values["custom_png"] = entry["png"]

    return values


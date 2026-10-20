"""Portable cutter profiles, physical cut paths, and registration backgrounds."""
import hashlib
import io
import json
import math
import re
import threading
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image
from pypdf import PdfReader, PdfWriter, Transformation
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

REGISTRATION_FORMATS = {"png", "svg", "pdf", "jpg", "jpeg", "webp"}
MAX_ASSET_BYTES = 20 * 1024 * 1024
_install_lock = threading.Lock()


def cut_geometry(template):
    """Use the same centered finished-card footprint as the print compositor."""
    cuts = []
    for slot in template.slot_defs:
        width = float(slot["finished_card_width_mm"])
        height = float(slot["finished_card_height_mm"])
        if slot["rotation_degrees"] in {90, 270}:
            width, height = height, width
        x = slot["x_mm"] + (slot["width_mm"] - width) / 2
        y = slot["y_mm"] + (slot["height_mm"] - height) / 2
        radius = min(template.rendering.get("corner_radius_mm", 0), width / 2, height / 2)
        values = (x, y, width, height, radius, template.page_width_mm, template.page_height_mm)
        if not all(math.isfinite(v) for v in values):
            raise ValueError("The paper layout contains non-finite dimensions.")
        if width > slot["width_mm"] + 0.001 or height > slot["height_mm"] + 0.001:
            raise ValueError("A finished card is larger than its paper slot.")
        if min(x, y) < -0.001 or x + width > template.page_width_mm + 0.001 or y + height > template.page_height_mm + 0.001:
            raise ValueError("A cut path extends outside the selected paper.")
        cuts.append(dict(x_mm=x, y_mm=y, width_mm=width, height_mm=height, radius_mm=radius))
    return cuts


def layout_signature(template):
    # Preserve order, bleed footprint and rotation as well as the cut boundary.
    payload = [template.page_width_mm, template.page_height_mm, template.slot_defs,
               template.rendering.get("corner_radius_mm", 0)]
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def registration_path(template):
    value = template.silhouette.get("registration_background", "")
    if not value:
        return None
    root = Path(template.source_path).resolve().parent
    path = (root / value).resolve()
    if not path.is_relative_to(root) or path.suffix.lower().lstrip(".") not in REGISTRATION_FORMATS:
        return None
    return path if path.is_file() else None


def _compatible_profile_entries(registry, paper):
    signature = layout_signature(paper)
    profiles, seen, ids = [], set(), set()
    # Cutter records reference a paper; they never contain a copy of its layout.
    for template_dir in reversed(registry.template_dirs):
        root = Path(template_dir) / "cutters"
        for source in sorted(root.glob("*.json")):
            try:
                if source.stat().st_size > 64 * 1024:
                    continue
                record = json.loads(source.read_text(encoding="utf-8"))
                if not isinstance(record, dict) or record.get("schema_version") != 1:
                    continue
                if record.get("paper_template_id") != paper.template_id or record.get("layout_sha256") != signature:
                    continue
                profile_id = record.get("id", "")
                asset = record.get("registration_asset", "")
                if not isinstance(profile_id, str) or not re.fullmatch(r"cutter-[a-z0-9_-]{1,80}", profile_id):
                    continue
                if not isinstance(asset, str) or not re.fullmatch(r"assets/[a-zA-Z0-9._-]+\.(png|svg|pdf|jpg|jpeg|webp)", asset):
                    continue
                path = (root / asset).resolve()
                if profile_id in ids or not path.is_relative_to(root.resolve()) or not _available_artwork(path):
                    continue
                profile = {
                    "id": profile_id, "name": _text(record.get("friendly_name"), "Friendly name"),
                    "brand": _text(record.get("brand"), "Brand"), "model": _text(record.get("model"), "Model"),
                    "format": path.suffix[1:], "legacy": False,
                }
                profiles.append((profile, path))
                ids.add(profile_id)
            except (OSError, ValueError):
                continue

    # Read existing INI-based profiles without rewriting or duplicating them.
    candidates = sorted(registry.list_templates(), key=lambda t: t.template_id != paper.template_id)
    for candidate in candidates:
        if not candidate.is_silhouette_layout or layout_signature(candidate) != signature:
            continue
        if candidate.cutter and candidate.cutter.get("base_template_id") not in {paper.template_id, None, ""}:
            continue
        path = registration_path(candidate)
        if not path or not _available_artwork(path) or candidate.template_id in ids:
            continue
        if not candidate.cutter and str(path) in seen:
            continue
        seen.add(str(path))
        profiles.append(({
            "id": candidate.template_id,
            "name": candidate.cutter.get("friendly_name") or "Silhouette registration marks",
            "brand": candidate.cutter.get("brand") or "Silhouette",
            "model": candidate.cutter.get("model") or candidate.metadata.get("silhouette_model") or "Any",
            "format": path.suffix.lower().lstrip("."),
            "legacy": not bool(candidate.cutter),
        }, path))
        ids.add(candidate.template_id)
    return profiles


def _available_artwork(path):
    if not path.is_file():
        return False
    if path.suffix.lower() == ".svg":
        try:
            from cairosvg.surface import PDFSurface  # noqa: F401
        except (ImportError, OSError):
            return False
    return True


def compatible_profiles(registry, paper):
    return [profile for profile, _ in _compatible_profile_entries(registry, paper)]


def cutter_registration_path(registry, paper, profile_id):
    return next((path for profile, path in _compatible_profile_entries(registry, paper)
                 if profile["id"] == profile_id), None)


def _download_name(value):
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", str(value))
    value = re.sub(r"\s+", " ", value).strip()[:120].rstrip(" .") or "Paper Layout"
    if re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])", value.split(".")[0]):
        value += " Layout"
    return value


def _text(value, label):
    value = str(value or "").strip()
    if not value or len(value) > 80 or any(ord(c) < 32 for c in value):
        raise ValueError(f"{label} must be 1-80 characters without control characters.")
    return value


def _svg_pdf(data):
    try:
        from cairosvg.surface import PDFSurface
    except (ImportError, OSError) as exc:
        raise ValueError("SVG rendering is unavailable on this installation. Use PNG or PDF registration artwork, or install CairoSVG and Cairo.") from exc

    def reject_external(url, resource_type):
        raise ValueError("Registration SVGs must be self-contained vector paths; external resources are not supported.")

    return PDFSurface.convert(bytestring=data, url_fetcher=reject_external)


def _pdf_page(data):
    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted or len(reader.pages) != 1:
        raise ValueError("Registration PDF must be an unencrypted, single-page document.")
    owner = PdfWriter()
    page = owner.add_page(reader.pages[0])
    if page.rotation:
        page.transfer_rotation_to_content()
    # Do not carry interactive content into printed files.
    for key in ("/Annots", "/AA"):
        page.pop(key, None)
    return page


def validate_registration(data, extension, width_mm, height_mm):
    if extension not in REGISTRATION_FORMATS or not data or len(data) > MAX_ASSET_BYTES:
        raise ValueError("Provide a PNG, SVG, PDF, JPG, JPEG, or WebP registration file up to 20 MB.")
    try:
        if extension in {"svg", "pdf"}:
            page = _pdf_page(_svg_pdf(data) if extension == "svg" else data)
            w, h = float(page.mediabox.width) / mm, float(page.mediabox.height) / mm
            if abs(w - width_mm) > 0.2 or abs(h - height_mm) > 0.2:
                raise ValueError(f"Registration page is {w:.2f} x {h:.2f} mm; expected {width_mm:g} x {height_mm:g} mm. Export the full page at actual size.")
        else:
            with Image.open(io.BytesIO(data)) as image:
                expected = {"png": "PNG", "jpg": "JPEG", "jpeg": "JPEG", "webp": "WEBP"}[extension]
                if image.format != expected:
                    raise ValueError("Registration file contents do not match its extension.")
                w, h = image.size
                image.verify()
            if abs(w / h / (width_mm / height_mm) - 1) > 0.005:
                raise ValueError("Registration image must have the same full-page proportions and orientation as the selected paper.")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("The registration artwork could not be read. Check its format and export it again.") from exc


class CutterCanvas(Canvas):
    """Keep PDF/SVG marks as vectors, merging only pages with a background."""
    def __init__(self, filename, *args, **kwargs):
        self._cutter_output = filename
        self._cutter_buffer = io.BytesIO()
        self._cutter_backgrounds = {}
        self._cutter_documents = {}
        super().__init__(self._cutter_buffer, *args, **kwargs)

    def registration_background(self, path, width_mm, height_mm):
        path = Path(path)
        if path.suffix.lower() not in {".svg", ".pdf"}:
            self.drawImage(ImageReader(str(path)), 0, 0, width=width_mm * mm,
                           height=height_mm * mm, preserveAspectRatio=False, mask="auto")
            return
        key = str(path)
        if key not in self._cutter_documents:
            data = path.read_bytes()
            validate_registration(data, path.suffix[1:].lower(), width_mm, height_mm)
            self._cutter_documents[key] = _pdf_page(_svg_pdf(data) if path.suffix.lower() == ".svg" else data)
        self._cutter_backgrounds[self.getPageNumber() - 1] = (key, width_mm * mm, height_mm * mm)
        # Ensure an otherwise blank registration page is emitted by Canvas.save.
        self._code.append("% Cutter registration background")

    def save(self):
        super().save()
        data = self._cutter_buffer.getvalue()
        if self._cutter_backgrounds:
            reader = PdfReader(io.BytesIO(data))
            writer = PdfWriter()
            for index, source_page in enumerate(reader.pages):
                page = writer.add_page(source_page)
                if index in self._cutter_backgrounds:
                    key, width, height = self._cutter_backgrounds[index]
                    background = self._cutter_documents[key]
                    box = background.mediabox
                    transform = Transformation().translate(-float(box.left), -float(box.bottom)).scale(
                        width / float(box.width), height / float(box.height))
                    page.merge_transformed_page(background, transform, over=False)
            if reader.metadata:
                writer.add_metadata(dict(reader.metadata))
            output = io.BytesIO()
            writer.write(output)
            data = output.getvalue()
        if hasattr(self._cutter_output, "write"):
            self._cutter_output.write(data)
        else:
            Path(self._cutter_output).write_bytes(data)


def _rounded_path(cut):
    x, y, w, h, r = (cut[k] for k in ("x_mm", "y_mm", "width_mm", "height_mm", "radius_mm"))
    k = 0.5522847498307936
    return [
        ("M", x+r, y), ("L", x+w-r, y),
        ("C", x+w-r+k*r, y, x+w, y+r-k*r, x+w, y+r),
        ("L", x+w, y+h-r), ("C", x+w, y+h-r+k*r, x+w-r+k*r, y+h, x+w-r, y+h),
        ("L", x+r, y+h), ("C", x+r-k*r, y+h, x, y+h-r+k*r, x, y+h-r),
        ("L", x, y+r), ("C", x, y+r-k*r, x+r-k*r, y, x+r, y), ("Z",),
    ]


def _eps_document(paths, width, height):
    # Illustrator's editable EPS operators preserve one object per stroked path.
    # Plain PostScript import can coalesce adjacent strokes into a compound path.
    # The small procset also makes the file printable by ordinary PS interpreters.
    return f'''%!PS-Adobe-3.0 EPSF-3.0
%%Creator: Deckadence
%%BoundingBox: 0 0 {math.ceil(width * mm)} {math.ceil(height * mm)}
%%HiResBoundingBox: 0 0 {width * mm:.6f} {height * mm:.6f}
%%DocumentNeededResources: procset Adobe_Illustrator_AI3 1.0 0
%%DocumentSuppliedResources: procset Adobe_Illustrator_AI3 1.0 0
%%Pages: 1
%AI3_ColorUsage: Black&White
%AI3_DocumentPreview: None
%%EndComments
%%BeginProlog
%%BeginResource: procset Adobe_Illustrator_AI3 1.0 0
/Adobe_Illustrator_AI3 16 dict dup begin
/initialize {{ Adobe_Illustrator_AI3 begin }} bind def
/terminate {{ end }} bind def
/m {{ moveto }} bind def
/L {{ lineto }} bind def
/C {{ curveto }} bind def
/s {{ closepath stroke }} bind def
/G {{ setgray }} bind def
/w {{ setlinewidth }} bind def
/j {{ setlinejoin }} bind def
/J {{ setlinecap }} bind def
/d {{ setdash }} bind def
end def
%%EndResource
%%EndProlog
%%BeginSetup
Adobe_Illustrator_AI3 /initialize get exec
%%EndSetup
0 G
{0.1 * mm:.6f} w
0 j
0 J
[] 0 d
{chr(10).join(paths)}
%%Trailer
Adobe_Illustrator_AI3 /terminate get exec
showpage
%%EOF
'''


def build_cutter_bundle(template):
    cuts = cut_geometry(template)
    width, height = template.page_width_mm, template.page_height_mm
    signature = layout_signature(template)
    stem = _download_name(template.display_name)

    pdf_buffer = io.BytesIO()
    pdf = Canvas(pdf_buffer, pagesize=(width * mm, height * mm), pageCompression=1)
    pdf.setTitle(f"{template.display_name} - cut paths - {width:g} x {height:g} mm")
    pdf.setLineWidth(0.1 * mm)
    pdf.setStrokeColorRGB(0, 0, 0)
    svg_paths, eps_paths = [], []
    for index, cut in enumerate(cuts, 1):
        path = pdf.beginPath()
        svg_commands, eps_commands = [], []
        for command in _rounded_path(cut):
            op, *coords = command
            if op == "M": path.moveTo(*(v * mm for v in coords))
            elif op == "L": path.lineTo(*(v * mm for v in coords))
            elif op == "C": path.curveTo(*(v * mm for v in coords))
            else: path.close()
            svg_commands.append(op + " ".join(f"{v:.6f}" for v in coords))
            eps_commands.append(" ".join([*(f"{v * mm:.6f}" for v in coords), {"M": "m", "L": "L", "C": "C", "Z": "s"}[op]]))
        pdf.drawPath(path, stroke=1, fill=0)
        svg_paths.append(f'<path id="card-{index}" d="{" ".join(svg_commands)}"/>')
        eps_paths.append(f"%AI3_Note: Card {index}\n" + "\n".join(eps_commands))
    pdf.showPage()
    pdf.save()
    svg = f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{width:g}mm" height="{height:g}mm" viewBox="0 0 {width:g} {height:g}">
<title>{escape(template.display_name)} - finished card cut paths</title>
<g id="cut-lines" fill="none" stroke="black" stroke-width="0.1" transform="translate(0 {height:g}) scale(1 -1)">
{chr(10).join(svg_paths)}
</g></svg>
'''
    eps = _eps_document(eps_paths, width, height)
    manifest = {
        "schema_version": 2, "paper_template_id": template.template_id,
        "layout_sha256": signature, "units": "mm", "origin": "bottom-left",
        "page": {"width_mm": width, "height_mm": height}, "cuts": cuts,
    }
    instructions = f'''# Cut paths for {template.display_name}

Paper: {template.display_name}. Page: {width:g} x {height:g} mm.

## Quick start
1. Open the SVG, PDF, or EPS cut file in your cutter software. Set the page to **{width:g} x {height:g} mm** and import at **100% scale**. Keep the path positions unchanged.
2. Create your cutting template in that software and add its registration marks.
3. Export a **full-page file containing only registration marks** — no card outlines or artwork. Use PNG, SVG, PDF, JPG, JPEG, or WebP.
4. In Deckadence, open **Settings → Card Cutting Machine Templates → Cutter Template Setup → Upload Registration Marks**. Select **{template.display_name}**, give the cutter template a friendly name, enter its brand and model, and browse for the file. Deckadence detects its format and saves it for use with this existing paper layout.
5. In **Print / Export**, enable **Cutter Registration Marks** and select your cutter template. Print a plain-paper test at actual size and check alignment before cutting cardstock.

## What's in this ZIP
- `{stem} - Cut Lines.pdf`, `.svg`, `.eps`: {len(cuts)} closed finished-card cut paths, including the paper's corner radius. These are vector outlines, with no card art, bleed cuts, crop marks, page-border cut, or registration marks.
- `{stem} - Geometry.json`: exact millimeter coordinates, bottom-left origin, page size, and layout fingerprint for scripts.
- `Instructions.md`: these instructions.

Files are named after the selected paper layout. This download works with any cutter software that supports one of the included vector formats.

You can upload multiple cutter templates for the same paper layout. Each is a separate choice in Print / Export; the paper layout is not copied or changed. Registration artwork is created in your cutter software and is not included in this ZIP. Keep its original filename when uploading; Deckadence handles storage.

## Import and artwork details
- Disable fit-to-page, automatic centering and resizing. If your importer crops to the outline bounds, restore the full page and use the coordinates in the JSON file.
- SVG/PDF registration pages must be {width:g} x {height:g} mm; raster files must have those proportions. Use self-contained SVG paths or a single unencrypted PDF page. Keep card paths clear of your cutter's registration exclusion areas.
- PDF/SVG can be opened in Illustrator and saved as a native AI document if needed.
- Deckadence offers cutter templates saved for the selected paper whose artwork is available and whose page and card geometry still match. To save a new version, use a new friendly name. The uploader does not overwrite existing cutter templates.
- To download or remove saved registration marks, open Settings → Card Cutting Machine Templates → Registration Marks. Removing a template keeps the paper layout and other templates.

The cut files use nominal finished-card dimensions, centered inside each bleed slot. They do not apply image-export settings, printer scaling, or machine kerf compensation. A cutter project or job file remains specific to the machine's software.
'''
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("Instructions.md", instructions)
        archive.writestr(f"{stem} - Cut Lines.pdf", pdf_buffer.getvalue())
        archive.writestr(f"{stem} - Cut Lines.svg", svg)
        archive.writestr(f"{stem} - Cut Lines.eps", eps)
        archive.writestr(f"{stem} - Geometry.json", json.dumps(manifest, indent=2))
    buffer.seek(0)
    return buffer, f"{stem}.zip"


def save_cutter_profile(registry, paper, friendly_name, brand, model, asset_data, asset_filename, destination):
    friendly_name = _text(friendly_name, "Friendly name")
    brand, model = _text(brand, "Brand"), _text(model, "Model")
    extension = Path(asset_filename).suffix.lower().lstrip(".")
    validate_registration(asset_data, extension, paper.page_width_mm, paper.page_height_mm)
    signature = layout_signature(paper)
    identity = hashlib.sha256(json.dumps([paper.template_id, signature, friendly_name, brand, model]).encode()).hexdigest()[:16]
    profile_id = f"cutter-{identity}"
    record = {
        "schema_version": 1, "id": profile_id, "paper_template_id": paper.template_id,
        "layout_sha256": signature, "friendly_name": friendly_name, "brand": brand, "model": model,
        "registration_asset": f"assets/{profile_id}-registration.{extension}",
    }
    root = Path(destination).resolve() / "cutters"
    profile_path = root / f"{profile_id}.json"
    asset_path = root / record["registration_asset"]
    with _install_lock:
        existing = compatible_profiles(registry, paper)
        if profile_path.exists() or asset_path.exists() or any(
            (p["name"], p["brand"], p["model"]) == (friendly_name, brand, model) for p in existing
        ):
            raise ValueError("That cutter template already exists for this paper. Use a new friendly name to save another version.")
        asset_path.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation and rollback avoid overwriting user files.
        with asset_path.open("xb") as output:
            output.write(asset_data)
        profile_created = False
        try:
            with profile_path.open("x", encoding="utf-8") as output:
                profile_created = True
                json.dump(record, output, indent=2)
        except Exception:
            if profile_created:
                profile_path.unlink(missing_ok=True)
            asset_path.unlink()
            raise
    return record


def remembered_profiles(config):
    try:
        value = json.loads(config.get("cutter_profile_selections") or "{}")
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        return {}


def _saved_cutter_files(destination, profile_id):
    """Resolve only files owned by an uploaded registration profile."""
    if not re.fullmatch(r"cutter-[a-z0-9_-]{1,80}", profile_id):
        raise ValueError("That registration template was not found.")
    destination = Path(destination).resolve()
    root = destination / "cutters"
    source = root / f"{profile_id}.json"
    if not root.resolve().is_relative_to(destination) or source.is_symlink():
        raise ValueError("That registration template cannot be managed here.")
    try:
        if source.stat().st_size > 64 * 1024:
            raise ValueError("The registration template record is invalid.")
        record = json.loads(source.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ValueError("That registration template could not be read.") from exc
    if not isinstance(record, dict) or record.get("id") != profile_id:
        raise ValueError("The registration template record is invalid.")
    asset_name = record.get("registration_asset", "")
    if not isinstance(asset_name, str) or not re.fullmatch(
        rf"assets/{re.escape(profile_id)}-registration\.(png|svg|pdf|jpg|jpeg|webp)", asset_name
    ):
        raise ValueError("The registration artwork path is invalid.")
    asset = root / asset_name
    if asset.is_symlink() or not asset.resolve().is_relative_to(root.resolve()):
        raise ValueError("The registration artwork path is invalid.")
    return record, source, asset


def list_saved_cutter_profiles(registry, destination):
    """Include unavailable uploads so a broken template can still be removed."""
    entries = []
    for source in sorted((Path(destination) / "cutters").glob("*.json")):
        try:
            record, _, asset = _saved_cutter_files(destination, source.stem)
        except ValueError:
            continue
        paper_id = str(record.get("paper_template_id") or "")
        paper = registry.get(paper_id)
        issue = ""
        if not paper:
            issue = "The linked paper layout is no longer available."
        elif record.get("layout_sha256") != layout_signature(paper):
            issue = "The paper layout has changed. Upload new registration marks for this layout."
        elif not asset.is_file():
            issue = "The registration file is missing."
        elif not _available_artwork(asset):
            issue = "This system cannot render the registration file."
        entries.append({
            "id": record["id"], "name": str(record.get("friendly_name") or "Registration marks"),
            "machine_brand": str(record.get("brand") or "Other"), "model": str(record.get("model") or ""),
            "print_template": paper_id, "print_template_label": paper.display_name if paper else paper_id,
            "file_format": asset.suffix[1:].upper(), "removable": True,
            "available": asset.is_file(), "issue": issue,
            "filename": f"{_download_name(record.get('friendly_name') or 'Registration Marks')} - Registration Marks{asset.suffix}",
        })
    return entries


def remove_cutter_profile(destination, profile_id):
    with _install_lock:
        record, source, asset = _saved_cutter_files(destination, profile_id)
        original = source.read_bytes()
        source.unlink()
        try:
            asset.unlink(missing_ok=True)
        except OSError:
            source.write_bytes(original)
            raise
    return record


def register_cutter_routes(app, get_config, update_config):
    from flask import jsonify, request, send_file, url_for
    from paths import get_runtime_print_template_dir
    from print_template_registry import get_print_template_registry

    def paper_from_request(data):
        registry = get_print_template_registry()
        paper = registry.get(data.get("print_template", ""))
        if not paper or paper.cutter.get("base_template_id"):
            raise ValueError("Select an available paper layout.")
        return registry, paper

    @app.get("/cutter-profiles/library")
    def cutter_profile_library():
        entries = list_saved_cutter_profiles(get_print_template_registry(), get_runtime_print_template_dir())
        for entry in entries:
            entry["download_url"] = url_for("cutter_profile_download", profile_id=entry["id"]) if entry["available"] else ""
            entry["remove_url"] = url_for("cutter_profile_remove", profile_id=entry["id"])
        return jsonify(ok=True, templates=entries)

    @app.get("/cutter-profiles/<profile_id>/download")
    def cutter_profile_download(profile_id):
        try:
            record, _, asset = _saved_cutter_files(get_runtime_print_template_dir(), profile_id)
            if not asset.is_file():
                raise ValueError("The registration file is missing.")
            filename = f"{_download_name(record.get('friendly_name') or 'Registration Marks')} - Registration Marks{asset.suffix}"
            return send_file(asset, as_attachment=True, download_name=filename)
        except ValueError as exc:
            return jsonify(ok=False, error=str(exc)), 404

    @app.post("/cutter-profiles/<profile_id>/remove")
    def cutter_profile_remove(profile_id):
        try:
            record = remove_cutter_profile(get_runtime_print_template_dir(), profile_id)
            selections = remembered_profiles(get_config())
            selections = {paper: selected for paper, selected in selections.items() if selected != profile_id}
            update_config({"cutter_profile_selections": json.dumps(selections)})
            return jsonify(ok=True, message=f"{record.get('friendly_name', 'Registration template')} removed.")
        except ValueError as exc:
            return jsonify(ok=False, error=str(exc)), 400
        except OSError:
            return jsonify(ok=False, error="The registration template could not be removed. Check that its files are not open in another program."), 500

    @app.get("/cutter-profiles/options")
    def cutter_profile_options():
        try:
            registry, paper = paper_from_request(request.args)
            profiles = compatible_profiles(registry, paper)
            selected = remembered_profiles(get_config()).get(paper.template_id, "")
            if selected not in {p["id"] for p in profiles}:
                selected = profiles[0]["id"] if profiles else ""
            return jsonify(ok=True, profiles=profiles, selected=selected,
                           paper={"name": paper.display_name, "width_mm": paper.page_width_mm,
                                  "height_mm": paper.page_height_mm, "cards": paper.cards_per_page})
        except ValueError as exc:
            return jsonify(ok=False, error=str(exc)), 400

    @app.post("/cutter-profiles/select")
    def cutter_profile_select():
        try:
            registry, paper = paper_from_request(request.form)
            selected = request.form.get("cutter_profile", "")
            if selected not in {p["id"] for p in compatible_profiles(registry, paper)}:
                raise ValueError("That cutter profile is no longer available for this paper layout.")
            selections = remembered_profiles(get_config())
            selections[paper.template_id] = selected
            update_config({"cutter_profile_selections": json.dumps(selections)})
            return jsonify(ok=True)
        except ValueError as exc:
            return jsonify(ok=False, error=str(exc)), 400

    @app.post("/cutter-profiles/export")
    def cutter_profile_export():
        try:
            _, paper = paper_from_request(request.form)
            buffer, filename = build_cutter_bundle(paper)
            return send_file(buffer, mimetype="application/zip", as_attachment=True, download_name=filename)
        except ValueError as exc:
            return jsonify(ok=False, error=str(exc)), 400

    @app.post("/cutter-profiles/registration")
    def cutter_profile_registration():
        try:
            registry, paper = paper_from_request(request.form)
            upload = request.files.get("registration_file")
            if not upload or not upload.filename:
                raise ValueError("Choose the registration artwork exported by your cutter software.")
            data = upload.read(MAX_ASSET_BYTES + 1)
            profile = save_cutter_profile(registry, paper, request.form.get("friendly_name"),
                                         request.form.get("brand"), request.form.get("model"),
                                         data, upload.filename, get_runtime_print_template_dir())
            selections = remembered_profiles(get_config())
            selections[paper.template_id] = profile["id"]
            update_config({"cutter_profile_selections": json.dumps(selections)})
            return jsonify(ok=True, profile_id=profile["id"],
                           message=f"{profile['friendly_name']} saved for {paper.display_name}. It is selected for this paper in Print / Export.")
        except ValueError as exc:
            return jsonify(ok=False, error=str(exc)), 400

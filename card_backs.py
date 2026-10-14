# *** CARD BACKS - Select, Upload, and Draw Card Backs ***
import os
from collections import Counter

from PIL import Image, ImageDraw, ImageFont, ImageOps

from settings import (
    DEFAULT_CARD_BACK_FILENAME,
    DEFAULT_CARD_BACK_KEY,
    CUSTOM_CARD_BACK_FULLBLEED_MM,
    STANDARD_CARD_WIDTH_MM as CARD_BACK_FINISHED_WIDTH_MM,
    STANDARD_CARD_HEIGHT_MM as CARD_BACK_FINISHED_HEIGHT_MM,
)

BUILTIN_CARD_BACK_PREFIX = "builtin:"
CUSTOM_CARD_BACK_PREFIX = "custom:"

CUSTOM_CARD_BACK_FULLBLEED_DIRNAME = "fullbleed"

LABEL_CARD_BACKS = {
    "10 - Deckadence Label Back - White.png": ("Deckadence - White", "#51452f"),
    "11 - Deckadence Label Back - Gold.png": ("Deckadence - Gold", "#514526"),
    "12 - Deckadence Label Back - Black.png": ("Deckadence - Black", "#302b38"),
}
DEFAULT_LABEL_CARD_BACK_KEY = f"builtin:{next(iter(LABEL_CARD_BACKS))}"
# Match the insert's lower panel: 84 of its 600 units, or 12.32 mm at trim size.
CARD_BACK_LABEL_BAR_HEIGHT_MM = CARD_BACK_FINISHED_HEIGHT_MM * 84 / 600


def normalize_label_location(value):
    return "custom_card_back" if str(value or "").strip().lower() == "custom_card_back" else "lower_left"


def resolve_label_card_back_option(raw_key, static_dir, runtime_card_back_dir):
    options = [option for option in list_card_back_options(static_dir, runtime_card_back_dir)
               if option.get("supports_labels")]
    if not options:
        raise ValueError("No label-compatible card backs are available.")
    fallback = next((option for option in options if option["key"] == DEFAULT_LABEL_CARD_BACK_KEY), options[0])
    return next((option for option in options if option["key"] == raw_key), fallback)


def sample_card_back_border_color(image):
    """Find the dominant edge color, avoiding rounded corners and central art."""
    sample = image.convert("RGB").resize((252, 352), Image.Resampling.BOX)
    pixels = []
    for bounds in ((25, 2, 227, 8), (25, 344, 227, 350),
                   (2, 35, 8, 317), (244, 35, 250, 317)):
        pixels.extend(sample.crop(bounds).getdata())
    # Group nearby colors so JPEG noise/texture does not outweigh a solid border.
    counts = Counter(tuple(channel // 32 for channel in rgb) for rgb in pixels)
    dominant = counts.most_common(1)[0][0]
    colors = [rgb for rgb in pixels if tuple(channel // 32 for channel in rgb) == dominant]
    return tuple(round(sum(rgb[channel] for rgb in colors) / len(colors)) for channel in range(3))


def card_back_label_text_color(background):
    channels = [channel / 255 for channel in background]
    linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4
              for value in channels]
    luminance = sum(value * weight for value, weight in zip(linear, (.2126, .7152, .0722)))
    return "#000000" if luminance > .179 else "#ffffff"


# *** CARD BACK LABELS - Draw Labels on Card Backs ***
def render_label_card_back(option, label_text="", full_bleed=False,
                           bleed_mm=CUSTOM_CARD_BACK_FULLBLEED_MM, label_title="PACK CODE"):
    """Use a designed label panel or add a border-colored bar inside the trim."""
    fullbleed_path = option.get("fullbleed_absolute_path")
    has_real_bleed = bool(full_bleed and fullbleed_path and os.path.isfile(fullbleed_path))
    path = fullbleed_path if has_real_bleed else option["absolute_path"]
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
    bleed = (float(option.get("source_bleed_mm") or CUSTOM_CARD_BACK_FULLBLEED_MM)
             if has_real_bleed else max(0.0, float(bleed_mm)) if full_bleed else 0.0)
    trim = _remove_known_card_back_bleed(image, bleed) if has_real_bleed else image
    border_color = sample_card_back_border_color(trim)
    if full_bleed and not has_real_bleed:
        image = ImageOps.expand(image, border=(round(image.width * bleed / CARD_BACK_FINISHED_WIDTH_MM),
                                              round(image.height * bleed / CARD_BACK_FINISHED_HEIGHT_MM)), fill=border_color)
    label_text = " ".join(str(label_text or "").split())
    if not label_text or not option.get("supports_labels"):
        return image

    sx = image.width / (CARD_BACK_FINISHED_WIDTH_MM + 2 * bleed)
    sy = image.height / (CARD_BACK_FINISHED_HEIGHT_MM + 2 * bleed)
    # Coordinates are measured in the original insert's 431 x 600 trim viewBox.
    x = lambda value: (bleed + value * CARD_BACK_FINISHED_WIDTH_MM / 431) * sx
    y = lambda value: (bleed + value * CARD_BACK_FINISHED_HEIGHT_MM / 600) * sy
    draw = ImageDraw.Draw(image)
    color = option.get("label_color")
    font_path = option["label_font_path"]
    # The designed insert panel keeps its original heading and code position.
    # Only added border bars use the raised, heading-free layout below.
    center_x, text_top, text_bottom = 243, 455, 490
    text_left, text_right = 130, 352
    if option.get("label_style") == "border_bar":
        top_mm = CARD_BACK_FINISHED_HEIGHT_MM - CARD_BACK_LABEL_BAR_HEIGHT_MM
        # The solid bar continues through the side and bottom bleed; text stays
        # at least 6 mm above the bottom cut, including when a long name wraps.
        draw.rectangle((0, round((bleed + top_mm) * sy), image.width, image.height), fill=border_color)
        color = card_back_label_text_color(border_color)
        center_x, text_top, text_bottom = 215.5, 530, 558
        text_left, text_right = 24, 407

    def fitted_font(value, max_size, max_width, max_height):
        for size in range(max(1, int(max_size)), 0, -1):
            font = ImageFont.truetype(font_path, size)
            box = draw.textbbox((0, 0), value, font=font)
            if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
                return font, box
        return font, box

    def centered(value, center_x, center_y, font, box):
        draw.text((center_x - (box[2] + box[0]) / 2,
                   center_y - (box[3] + box[1]) / 2), value, fill=color, font=font)

    if option.get("label_style") == "insert_panel" and label_title:
        title_font, title_box = fitted_font(str(label_title), y(8) - y(0),
                                            x(text_right) - x(text_left), y(14) - y(0))
        centered(str(label_title), x(center_x), y(444), title_font, title_box)

    # Prefer one line for pack codes; wrap longer deck names into two balanced lines.
    max_width, max_height = x(text_right) - x(text_left), y(text_bottom) - y(text_top)
    lines = [label_text]
    nominal = ImageFont.truetype(font_path, max(1, round(y(25) - y(0))))
    if draw.textlength(label_text, font=nominal) > max_width and len(label_text.split()) > 1:
        words = label_text.split()
        split = min(range(1, len(words)), key=lambda i: max(
            draw.textlength(" ".join(words[:i]), font=nominal),
            draw.textlength(" ".join(words[i:]), font=nominal)))
        lines = [" ".join(words[:split]), " ".join(words[split:])]
    fonts = [fitted_font(line, y(25) - y(0), max_width, max_height / len(lines)) for line in lines]
    font_size = min(font.size for font, _ in fonts)
    font = ImageFont.truetype(font_path, font_size)
    for index, line in enumerate(lines):
        box = draw.textbbox((0, 0), line, font=font)
        center_y = y(text_top) + max_height * (index + .5) / len(lines)
        centered(line, x(center_x), center_y, font, box)
    return image

Image.init()
SUPPORTED_IMAGE_EXTENSIONS = frozenset(
    extension.lower()
    for extension in Image.registered_extensions().keys()
)


def get_builtin_card_back_dir(static_dir):
    return os.path.join(static_dir, "img", "card_backs")


def get_custom_card_back_fullbleed_dir(runtime_card_back_dir):
    return os.path.join(
        runtime_card_back_dir,
        CUSTOM_CARD_BACK_FULLBLEED_DIRNAME,
    )


def _is_supported_image_filename(filename):
    extension = os.path.splitext(str(filename or ""))[1].lower()
    return bool(extension) and extension in SUPPORTED_IMAGE_EXTENSIONS


def _safe_upload_stem(filename):
    stem = os.path.splitext(os.path.basename(str(filename or "")))[0].strip()
    safe_chars = []

    for character in stem:
        if character.isalnum() or character in {"-", "_"}:
            safe_chars.append(character)
        elif character.isspace():
            safe_chars.append("_")
        else:
            safe_chars.append("_")

    safe_stem = "".join(safe_chars).strip("_-")

    while "__" in safe_stem:
        safe_stem = safe_stem.replace("__", "_")

    return safe_stem or "custom_card_back"


def _remove_known_card_back_bleed(
    image,
    bleed_mm=CUSTOM_CARD_BACK_FULLBLEED_MM,
):
    source_image = ImageOps.exif_transpose(image).convert("RGB")

    bleed_mm = max(0.0, float(bleed_mm or 0.0))

    if bleed_mm <= 0:
        return source_image

    full_width_mm = (
        CARD_BACK_FINISHED_WIDTH_MM
        + (bleed_mm * 2.0)
    )

    full_height_mm = (
        CARD_BACK_FINISHED_HEIGHT_MM
        + (bleed_mm * 2.0)
    )

    crop_x = int(round(
        source_image.width
        * (bleed_mm / full_width_mm)
    ))

    crop_y = int(round(
        source_image.height
        * (bleed_mm / full_height_mm)
    ))

    crop_x = max(
        0,
        min(crop_x, (source_image.width - 1) // 2),
    )

    crop_y = max(
        0,
        min(crop_y, (source_image.height - 1) // 2),
    )

    return source_image.crop((
        crop_x,
        crop_y,
        source_image.width - crop_x,
        source_image.height - crop_y,
    ))


# *** CARD BACK CHOICES - List and Select Card Backs ***
def list_card_back_options(static_dir, runtime_card_back_dir):
    options = []
    builtin_dir = get_builtin_card_back_dir(static_dir)

    if os.path.isdir(builtin_dir):
        for filename in sorted(os.listdir(builtin_dir), key=str.casefold):
            absolute_path = os.path.join(builtin_dir, filename)

            if not os.path.isfile(absolute_path):
                continue

            if not _is_supported_image_filename(filename):
                continue

            label_info = LABEL_CARD_BACKS.get(filename)
            fullbleed_path = os.path.join(builtin_dir, "fullbleed", filename)
            has_bleed = bool(label_info and os.path.isfile(fullbleed_path))
            options.append({
                "key": f"{BUILTIN_CARD_BACK_PREFIX}{filename}",
                "filename": filename,
                "label": label_info[0] if label_info else os.path.splitext(filename)[0],
                "source": "builtin",
                "absolute_path": absolute_path,
                "fullbleed_absolute_path": fullbleed_path if has_bleed else "",
                "print_master_absolute_path": fullbleed_path if has_bleed else absolute_path,
                "source_has_real_bleed": has_bleed,
                "source_bleed_mm": 3.0 if has_bleed else 0.0,
                "supports_labels": True,
                "label_style": "insert_panel" if label_info else "border_bar",
                "label_color": label_info[1] if label_info else "",
                "label_font_path": os.path.join(static_dir, "fonts", "Gotham-Medium.otf"),
            })

    if os.path.isdir(runtime_card_back_dir):
        for filename in sorted(os.listdir(runtime_card_back_dir), key=str.casefold):
            absolute_path = os.path.join(runtime_card_back_dir, filename)

            if not os.path.isfile(absolute_path):
                continue

            if not _is_supported_image_filename(filename):
                continue

            fullbleed_absolute_path = os.path.join(
                get_custom_card_back_fullbleed_dir(
                    runtime_card_back_dir
                ),
                filename,
            )

            source_has_real_bleed = os.path.isfile(
                fullbleed_absolute_path
            )

            options.append({
                "key": f"{CUSTOM_CARD_BACK_PREFIX}{filename}",
                "filename": filename,
                "label": os.path.splitext(filename)[0].replace("_", " "),
                "source": "custom",
                "absolute_path": absolute_path,
                "fullbleed_absolute_path": (
                    fullbleed_absolute_path
                    if source_has_real_bleed
                    else ""
                ),
                "print_master_absolute_path": (
                    fullbleed_absolute_path
                    if source_has_real_bleed
                    else absolute_path
                ),
                "source_has_real_bleed": source_has_real_bleed,
                "source_bleed_mm": (
                    CUSTOM_CARD_BACK_FULLBLEED_MM
                    if source_has_real_bleed
                    else 0.0
                ),
                "supports_labels": True,
                "label_style": "border_bar",
                "label_font_path": os.path.join(static_dir, "fonts", "Gotham-Medium.otf"),
            })

    return options


def _find_card_back_option(raw_key, static_dir, runtime_card_back_dir):
    clean_key = str(raw_key or "").strip()

    if not clean_key:
        return None

    options = list_card_back_options(static_dir, runtime_card_back_dir)
    option_by_key = {
        option["key"]: option
        for option in options
    }

    if clean_key in option_by_key:
        return option_by_key[clean_key]

    # Compatibility for a plain filename value if one was saved manually or
    # by an older development build before source prefixes were introduced.
    basename = os.path.basename(clean_key)

    for prefix in (BUILTIN_CARD_BACK_PREFIX, CUSTOM_CARD_BACK_PREFIX):
        legacy_key = f"{prefix}{basename}"

        if legacy_key in option_by_key:
            return option_by_key[legacy_key]

    return None


def normalize_card_back_key(
    raw_key,
    static_dir,
    runtime_card_back_dir,
    allow_empty=False,
    fallback_key=None,
):
    clean_key = str(raw_key or "").strip()

    if not clean_key and allow_empty:
        return ""

    option = _find_card_back_option(
        clean_key,
        static_dir,
        runtime_card_back_dir,
    )

    if option:
        return option["key"]

    if fallback_key:
        fallback_option = _find_card_back_option(
            fallback_key,
            static_dir,
            runtime_card_back_dir,
        )

        if fallback_option:
            return fallback_option["key"]

    default_option = _find_card_back_option(
        DEFAULT_CARD_BACK_KEY,
        static_dir,
        runtime_card_back_dir,
    )

    if default_option:
        return default_option["key"]

    options = list_card_back_options(
        static_dir,
        runtime_card_back_dir,
    )

    if options:
        return options[0]["key"]

    return ""


def resolve_card_back_option(
    raw_key,
    static_dir,
    runtime_card_back_dir,
):
    normalized_key = normalize_card_back_key(
        raw_key,
        static_dir,
        runtime_card_back_dir,
    )

    if not normalized_key:
        return None

    return _find_card_back_option(
        normalized_key,
        static_dir,
        runtime_card_back_dir,
    )


# *** CUSTOM CARD BACKS - Save and Delete Uploaded Images ***
def save_custom_card_back_upload(
    file_storage,
    runtime_card_back_dir,
    max_file_size_bytes=None,
    full_bleed_3mm=False,
):
    if not file_storage or not getattr(file_storage, "filename", ""):
        raise ValueError("Choose an image file to upload.")

    if max_file_size_bytes is not None:
        max_file_size_bytes = max(
            0,
            int(max_file_size_bytes),
        )

        if max_file_size_bytes > 0:
            try:
                upload_stream = file_storage.stream

                upload_stream.seek(
                    0,
                    os.SEEK_END,
                )

                upload_size_bytes = (
                    upload_stream.tell()
                )

                upload_stream.seek(0)

            except (
                AttributeError,
                OSError,
                ValueError,
            ):
                upload_size_bytes = int(
                    getattr(
                        file_storage,
                        "content_length",
                        0,
                    )
                    or 0
                )

            if upload_size_bytes > max_file_size_bytes:
                max_size_mb = (
                    max_file_size_bytes
                    / (1024 * 1024)
                )

                raise ValueError(
                    f"The uploaded card back image exceeds the "
                    f"{max_size_mb:g} MB size limit."
                )

    try:
        source_image = Image.open(
            file_storage.stream
        )

        image = ImageOps.exif_transpose(
            source_image
        )

        image.load()

    except Exception as exc:
        raise ValueError(
            "The uploaded file is not a valid image."
        ) from exc

    if image.width < 1 or image.height < 1:
        raise ValueError(
            "The uploaded card back image has invalid dimensions."
        )

    if image.width * image.height > 100_000_000:
        raise ValueError(
            "The uploaded card back image is too large."
        )

    os.makedirs(
        runtime_card_back_dir,
        exist_ok=True,
    )

    safe_stem = _safe_upload_stem(
        file_storage.filename
    )

    candidate_filename = f"{safe_stem}.png"
    candidate_path = os.path.join(
        runtime_card_back_dir,
        candidate_filename,
    )

    duplicate_index = 2

    while os.path.exists(candidate_path):
        candidate_filename = (
            f"{safe_stem}_{duplicate_index}.png"
        )

        candidate_path = os.path.join(
            runtime_card_back_dir,
            candidate_filename,
        )

        duplicate_index += 1

    full_bleed_3mm = bool(full_bleed_3mm)

    clean_image = (
        _remove_known_card_back_bleed(
            image,
            CUSTOM_CARD_BACK_FULLBLEED_MM,
        )
        if full_bleed_3mm
        else image.convert("RGB")
    )

    fullbleed_path = ""

    if full_bleed_3mm:
        fullbleed_dir = get_custom_card_back_fullbleed_dir(
            runtime_card_back_dir
        )

        os.makedirs(
            fullbleed_dir,
            exist_ok=True,
        )

        fullbleed_path = os.path.join(
            fullbleed_dir,
            candidate_filename,
        )

    try:
        clean_image.save(
            candidate_path,
            format="PNG",
            optimize=True,
        )

        if fullbleed_path:
            image.convert("RGB").save(
                fullbleed_path,
                format="PNG",
                optimize=True,
            )

    except Exception:
        for saved_path in (
            candidate_path,
            fullbleed_path,
        ):
            if saved_path and os.path.isfile(saved_path):
                try:
                    os.remove(saved_path)
                except OSError:
                    pass

        raise

    return (
        f"{CUSTOM_CARD_BACK_PREFIX}"
        f"{candidate_filename}"
    )

def delete_custom_card_back(
    raw_key,
    static_dir,
    runtime_card_back_dir,
):
    clean_key = str(raw_key or "").strip()

    if not clean_key.startswith(CUSTOM_CARD_BACK_PREFIX):
        raise ValueError(
            "Only custom uploaded card backs can be deleted."
        )

    custom_filename = clean_key[
        len(CUSTOM_CARD_BACK_PREFIX):
    ].strip()

    if (
        not custom_filename
        or custom_filename
        != os.path.basename(custom_filename)
    ):
        raise ValueError(
            "The custom card back filename is invalid."
        )

    option = next(
        (
            item
            for item in list_card_back_options(
                static_dir,
                runtime_card_back_dir,
            )
            if (
                item["key"] == clean_key
                and item["source"] == "custom"
            )
        ),
        None,
    )

    if not option:
        raise FileNotFoundError(
            "The custom card back was not found."
        )

    runtime_root = os.path.realpath(
        runtime_card_back_dir
    )

    target_path = os.path.realpath(
        option["absolute_path"]
    )

    try:
        common_path = os.path.commonpath(
            [
                runtime_root,
                target_path,
            ]
        )
    except ValueError as exc:
        raise ValueError(
            "The custom card back path is invalid."
        ) from exc

    if common_path != runtime_root:
        raise ValueError(
            "The custom card back path is outside "
            "the permitted upload directory."
        )

    if not os.path.isfile(target_path):
        raise FileNotFoundError(
            "The custom card back image no longer exists."
        )

    fullbleed_path = (
        option.get("fullbleed_absolute_path")
        or ""
    )

    os.remove(target_path)

    if fullbleed_path and os.path.isfile(fullbleed_path):
        os.remove(fullbleed_path)

    return option

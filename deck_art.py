from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import hashlib
import json
import logging
import os
import re
import threading

import requests

from PIL import (
    Image,
    ImageDraw,
    ImageFont,
    ImageOps,
)

LOGGER = logging.getLogger(
    __name__
)


@dataclass(
    frozen=True,
    slots=True,
)
class DeckArtSpec:
    deck_name: str
    author: str = ""
    format_label: str = ""
    color_identity: tuple[str, ...] = ()
    scryfall_id: str = ""

class DeckArtRenderer:
    CACHE_VERSION = 2

    CANVAS_SIZE = (
        477,
        721,
    )

    ART_BOX = (
        44,
        55,
        446,
        386,
    )

    COLOR_ORDER = (
        "W",
        "U",
        "B",
        "R",
        "G",
        "C",
    )

    OVERLAY_BY_KEY = {
        "black": "deckbox_black.png",
        "blue": "deckbox_blue.png",
        "gold": "deckbox_gold.png",
        "green": "deckbox_green.png",
        "red": "deckbox_red.png",
        "silver": "deckbox_silver.png",
        "white": "deckbox_white.png",
    }

    SINGLE_COLOR_OVERLAY = {
        "W": "white",
        "U": "blue",
        "B": "black",
        "R": "red",
        "G": "green",
    }

    MANA_FALLBACK_COLORS = {
        "W": (
            (248, 246, 216),
            (32, 32, 28),
        ),

        "U": (
            (67, 158, 210),
            (255, 255, 255),
        ),

        "B": (
            (73, 70, 69),
            (255, 255, 255),
        ),

        "R": (
            (220, 76, 62),
            (255, 255, 255),
        ),

        "G": (
            (85, 164, 102),
            (255, 255, 255),
        ),

        "C": (
            (174, 174, 174),
            (24, 24, 24),
        ),
    }


    def __init__(
        self,
        static_root,
        cache_root,
    ):
        self.static_root = os.path.abspath(
            static_root
        )

        self.cache_root = os.path.abspath(
            cache_root
        )

        self.overlay_root = os.path.join(
            self.static_root,
            "img",
        )

        self.symbol_root = os.path.join(
            self.static_root,
            "img",
            "symbols",
        )

        self.mana_cache_root = os.path.join(
            self.cache_root,
            "symbols",
        )

        os.makedirs(
            self.cache_root,
            exist_ok=True,
        )

        os.makedirs(
            self.mana_cache_root,
            exist_ok=True,
        )

    def render_cached(
        self,
        spec: DeckArtSpec,
    ):
        clean_spec = self._normalize_spec(
            spec
        )

        overlay_key = (
            self._resolve_overlay_key(
                clean_spec.color_identity
            )
        )

        overlay_path = (
            self._overlay_path(
                overlay_key
            )
        )

        overlay_stat = os.stat(
            overlay_path
        )

        cache_payload = {
            "version": self.CACHE_VERSION,

            "deck_name": (
                clean_spec.deck_name
            ),

            "author": (
                clean_spec.author
            ),

            "format_label": (
                clean_spec.format_label
            ),

            "color_identity": list(
                clean_spec.color_identity
            ),

            "scryfall_id": (
                clean_spec.scryfall_id
            ),

            "overlay_key": (
                overlay_key
            ),

            "overlay_size": (
                overlay_stat.st_size
            ),

            "overlay_mtime_ns": (
                overlay_stat.st_mtime_ns
            ),
        }

        cache_key = hashlib.sha256(
            json.dumps(
                cache_payload,
                sort_keys=True,
                separators=(
                    ",",
                    ":",
                ),
            ).encode(
                "utf-8"
            )
        ).hexdigest()

        output_path = os.path.join(
            self.cache_root,
            (
                f"deck_art_"
                f"{cache_key}.png"
            ),
        )

        if os.path.isfile(
            output_path
        ):
            return output_path

        rendered_image = self.render(
            clean_spec
        )

        temp_path = (
            f"{output_path}."
            f"{threading.get_ident()}."
            f"tmp"
        )

        try:
            rendered_image.save(
                temp_path,
                format="PNG",
                optimize=True,
            )

            os.replace(
                temp_path,
                output_path,
            )

        finally:
            if os.path.exists(
                temp_path
            ):
                try:
                    os.remove(
                        temp_path
                    )

                except OSError:
                    pass

        return output_path


    def render(
        self,
        spec: DeckArtSpec,
    ):
        clean_spec = self._normalize_spec(
            spec
        )

        overlay_key = (
            self._resolve_overlay_key(
                clean_spec.color_identity
            )
        )

        overlay_path = (
            self._overlay_path(
                overlay_key
            )
        )

        with Image.open(
            overlay_path
        ) as overlay_source:
            overlay = (
                overlay_source
                .convert("RGBA")
            )

        if overlay.size != self.CANVAS_SIZE:
            overlay = overlay.resize(
                self.CANVAS_SIZE,
                Image.LANCZOS,
            )

        image = Image.new(
            "RGBA",
            self.CANVAS_SIZE,
            (
                0,
                0,
                0,
                0,
            ),
        )

        art_width = (
            self.ART_BOX[2]
            - self.ART_BOX[0]
        )

        art_height = (
            self.ART_BOX[3]
            - self.ART_BOX[1]
        )

        artwork = self._load_artwork(
            clean_spec.scryfall_id,
            (
                art_width,
                art_height,
            ),
        )

        image.paste(
            artwork,
            (
                self.ART_BOX[0],
                self.ART_BOX[1],
            ),
        )

        image.alpha_composite(
            overlay
        )

        draw = ImageDraw.Draw(
            image
        )

        self._draw_mana_identity(
            image,
            clean_spec.color_identity,
        )

        self._draw_deck_name(
            draw,
            clean_spec.deck_name,
        )

        self._draw_author(
            draw,
            clean_spec.author,
        )

        self._draw_format(
            draw,
            overlay,
            clean_spec.format_label,
        )

        return image

    def _normalize_spec(
        self,
        spec,
    ):
        if not isinstance(
            spec,
            DeckArtSpec,
        ):
            raise TypeError(
                "spec must be a "
                "DeckArtSpec."
            )

        deck_name = (
            str(
                spec.deck_name
                or ""
            ).strip()
            or "Untitled Deck"
        )

        author = str(
            spec.author
            or ""
        ).strip()

        format_label = (
            str(
                spec.format_label
                or ""
            ).strip()
            or "Deck"
        )

        scryfall_id = str(
            spec.scryfall_id
            or ""
        ).strip().lower()

        requested_colors = {
            str(
                value
                or ""
            ).strip().upper()

            for value
            in (
                spec.color_identity
                or ()
            )
        }

        normalized_colors = tuple(
            color
            for color
            in self.COLOR_ORDER
            if color
            in requested_colors
        )

        if any(
            color
            in normalized_colors
            for color
            in "WUBRG"
        ):
            normalized_colors = tuple(
                color
                for color
                in normalized_colors
                if color != "C"
            )

        return DeckArtSpec(
            deck_name=deck_name,
            author=author,
            format_label=format_label,
            color_identity=(
                normalized_colors
            ),
            scryfall_id=scryfall_id,
        )


    def _resolve_overlay_key(
        self,
        color_identity,
    ):
        colored = [
            color
            for color
            in color_identity
            if color
            in self.SINGLE_COLOR_OVERLAY
        ]

        if len(colored) == 1:
            return (
                self.SINGLE_COLOR_OVERLAY[
                    colored[0]
                ]
            )

        if len(colored) >= 2:
            return "gold"

        return "silver"


    def _overlay_path(
        self,
        overlay_key,
    ):
        filename = (
            self.OVERLAY_BY_KEY.get(
                overlay_key,
                self.OVERLAY_BY_KEY[
                    "silver"
                ],
            )
        )

        path = os.path.join(
            self.overlay_root,
            filename,
        )

        if not os.path.isfile(
            path
        ):
            raise FileNotFoundError(
                "Deck art overlay "
                f"not found: {path}"
            )

        return path

    def _load_artwork(
        self,
        scryfall_id,
        target_size,
    ):
        clean_scryfall_id = str(
            scryfall_id
            or ""
        ).strip().lower()

        valid_scryfall_id = bool(
            re.fullmatch(
                (
                    r"[0-9a-f]{8}-"
                    r"[0-9a-f]{4}-"
                    r"[0-9a-f]{4}-"
                    r"[0-9a-f]{4}-"
                    r"[0-9a-f]{12}"
                ),
                clean_scryfall_id,
                flags=re.IGNORECASE,
            )
        )

        if not valid_scryfall_id:
            LOGGER.warning(
                "DECK ART | Missing or invalid "
                "Scryfall ID: %r",
                clean_scryfall_id,
            )

            return self._build_artwork_fallback(
                target_size
            )

        headers = {
            "User-Agent": "Deckadence/1.0",

            "Accept": (
                "image/avif,"
                "image/webp,"
                "image/png,"
                "image/jpeg,"
                "image/*,"
                "*/*;q=0.8"
            ),
        }

        image_candidates = (
            (
                "art_crop",
                (
                    0.5,
                    0.45,
                ),
            ),
            (
                "large",
                (
                    0.5,
                    0.27,
                ),
            ),
            (
                "normal",
                (
                    0.5,
                    0.27,
                ),
            ),
        )

        last_error = None

        for (
            image_kind,
            centering,
        ) in image_candidates:

            artwork_url = (
                "https://cards.scryfall.io/"
                f"{image_kind}/front/"
                f"{clean_scryfall_id[0]}/"
                f"{clean_scryfall_id[1]}/"
                f"{clean_scryfall_id}.jpg"
            )

            try:
                with requests.get(
                    artwork_url,
                    headers=headers,
                    timeout=(
                        8,
                        30,
                    ),
                ) as response:

                    response.raise_for_status()

                    content_type = str(
                        response.headers.get(
                            "Content-Type"
                        )
                        or ""
                    ).strip().lower()

                    if (
                        content_type
                        and not content_type.startswith(
                            "image/"
                        )
                    ):
                        raise ValueError(
                            "Scryfall returned "
                            "non-image content: "
                            f"{content_type}"
                        )

                    with Image.open(
                        BytesIO(
                            response.content
                        )
                    ) as source_image:

                        source_image = (
                            ImageOps.exif_transpose(
                                source_image
                            )
                            .convert("RGB")
                        )

                        return ImageOps.fit(
                            source_image,
                            target_size,
                            method=Image.LANCZOS,
                            centering=centering,
                        )

            except Exception as exc:
                last_error = exc

        LOGGER.warning(
            "DECK ART | Artwork download failed "
            "| scryfall_id=%s | error=%s",
            clean_scryfall_id,
            str(last_error),
        )

        return self._build_artwork_fallback(
            target_size
        )


    @staticmethod
    def _build_artwork_fallback(
        target_size,
    ):
        fallback = Image.new(
            "RGB",
            target_size,
            (
                28,
                31,
                39,
            ),
        )

        fallback_draw = (
            ImageDraw.Draw(
                fallback
            )
        )

        for y in range(
            target_size[1]
        ):
            shade = int(
                28
                + (
                    18
                    * (
                        y
                        / max(
                            1,
                            target_size[1]
                            - 1,
                        )
                    )
                )
            )

            fallback_draw.line(
                (
                    0,
                    y,
                    target_size[0],
                    y,
                ),
                fill=(
                    shade,
                    shade + 3,
                    shade + 9,
                ),
            )

        return fallback

    def _draw_mana_identity(
        self,
        image,
        color_identity,
    ):
        symbols = [
            color
            for color
            in color_identity
            if color
            in self.COLOR_ORDER
        ]

        if not symbols:
            symbols = [
                "C"
            ]

        symbol_size = 34
        gap = 8

        total_width = (
            (
                len(symbols)
                * symbol_size
            )
            + (
                max(
                    0,
                    len(symbols) - 1,
                )
                * gap
            )
        )

        x = int(
            (
                self.CANVAS_SIZE[0]
                - total_width
            )
            / 2
        )

        y = 421

        for symbol in symbols:
            symbol_image = (
                self._load_mana_symbol(
                    symbol,
                    symbol_size,
                )
            )

            image.alpha_composite(
                symbol_image,
                (
                    x,
                    y,
                ),
            )

            x += (
                symbol_size
                + gap
            )

    def _load_mana_symbol(
        self,
        symbol,
        size,
    ):
        clean_symbol = str(
            symbol
            or ""
        ).strip().upper()

        if clean_symbol not in self.COLOR_ORDER:
            clean_symbol = "C"

        symbol_path = os.path.join(
            self.symbol_root,
            f"{clean_symbol}.svg",
        )

        if not os.path.isfile(
            symbol_path
        ):
            LOGGER.warning(
                "DECK ART | Local mana symbol "
                "was not found: %s",
                symbol_path,
            )

            return (
                self._build_fallback_mana_symbol(
                    clean_symbol,
                    size,
                )
            )

        symbol_stat = os.stat(
            symbol_path
        )

        cache_path = os.path.join(
            self.mana_cache_root,
            (
                f"{clean_symbol}_"
                f"{int(size)}_"
                f"{symbol_stat.st_mtime_ns}"
                ".png"
            ),
        )

        if os.path.isfile(
            cache_path
        ):
            try:
                with Image.open(
                    cache_path
                ) as source:
                    return (
                        source
                        .convert("RGBA")
                        .copy()
                    )

            except Exception:
                try:
                    os.remove(
                        cache_path
                    )

                except OSError:
                    pass

        try:
            import cairosvg

        except Exception:
            LOGGER.warning(
                "DECK ART | CairoSVG is "
                "unavailable; using fallback "
                "mana symbol for %s.",
                clean_symbol,
            )

            return (
                self._build_fallback_mana_symbol(
                    clean_symbol,
                    size,
                )
            )

        temp_path = (
            f"{cache_path}."
            f"{threading.get_ident()}."
            "tmp"
        )

        try:
            png_bytes = cairosvg.svg2png(
                url=symbol_path,
                output_width=int(
                    size
                ),
                output_height=int(
                    size
                ),
            )

            with Image.open(
                BytesIO(
                    png_bytes
                )
            ) as source:

                symbol_image = (
                    source
                    .convert("RGBA")
                    .copy()
                )

            with open(
                temp_path,
                "wb",
            ) as output_file:
                output_file.write(
                    png_bytes
                )

            os.replace(
                temp_path,
                cache_path,
            )

            return symbol_image

        except Exception as exc:
            LOGGER.warning(
                "DECK ART | Local mana "
                "symbol render failed "
                "| symbol=%s | error=%s",
                clean_symbol,
                str(exc),
            )

            return (
                self._build_fallback_mana_symbol(
                    clean_symbol,
                    size,
                )
            )

        finally:
            if os.path.exists(
                temp_path
            ):
                try:
                    os.remove(
                        temp_path
                    )

                except OSError:
                    pass

    def _build_fallback_mana_symbol(
        self,
        symbol,
        size,
    ):
        (
            fill_rgb,
            text_rgb,
        ) = (
            self.MANA_FALLBACK_COLORS.get(
                symbol,
                self.MANA_FALLBACK_COLORS[
                    "C"
                ],
            )
        )

        image = Image.new(
            "RGBA",
            (
                size,
                size,
            ),
            (
                0,
                0,
                0,
                0,
            ),
        )

        draw = ImageDraw.Draw(
            image
        )

        draw.ellipse(
            (
                1,
                1,
                size - 2,
                size - 2,
            ),

            fill=(
                fill_rgb
                + (255,)
            ),

            outline=(
                245,
                245,
                245,
                255,
            ),

            width=max(
                1,
                int(
                    size
                    * 0.06
                ),
            ),
        )

        font = self._load_font(
            int(
                size
                * 0.52
            ),
            bold=True,
        )

        bbox = draw.textbbox(
            (
                0,
                0,
            ),
            symbol,
            font=font,
        )

        text_width = (
            bbox[2]
            - bbox[0]
        )

        text_height = (
            bbox[3]
            - bbox[1]
        )

        draw.text(
            (
                (
                    size
                    - text_width
                )
                / 2,

                (
                    (
                        size
                        - text_height
                    )
                    / 2
                )
                - 2,
            ),

            symbol,
            font=font,

            fill=(
                text_rgb
                + (255,)
            ),
        )

        return image

    def _draw_deck_name(
        self,
        draw,
        deck_name,
    ):
        max_width = 360
        max_lines = 2

        selected_font = None
        lines = []

        for size in range(
            34,
            21,
            -2,
        ):
            candidate_font = (
                self._load_font(
                    size,
                    bold=True,
                )
            )

            candidate_lines = (
                self._wrap_text(
                    draw,
                    deck_name,
                    candidate_font,
                    max_width,
                )
            )

            if (
                len(candidate_lines)
                <= max_lines
            ):
                selected_font = (
                    candidate_font
                )

                lines = (
                    candidate_lines
                )

                break

        if selected_font is None:
            selected_font = (
                self._load_font(
                    22,
                    bold=True,
                )
            )

            lines = self._wrap_text(
                draw,
                deck_name,
                selected_font,
                max_width,
            )[:max_lines]

            if lines:
                lines[-1] = (
                    self._truncate_text(
                        draw,
                        lines[-1],
                        selected_font,
                        max_width,
                    )
                )

        line_spacing = 7

        line_heights = []

        for line in lines:
            bbox = draw.textbbox(
                (
                    0,
                    0,
                ),
                line,
                font=selected_font,
            )

            line_heights.append(
                bbox[3]
                - bbox[1]
            )

        total_height = sum(
            line_heights
        )

        if len(lines) > 1:
            total_height += (
                line_spacing
                * (
                    len(lines)
                    - 1
                )
            )

        y = int(
            514
            - (
                total_height
                / 2
            )
        )

        for (
            line,
            line_height,
        ) in zip(
            lines,
            line_heights,
        ):
            bbox = draw.textbbox(
                (
                    0,
                    0,
                ),
                line,
                font=selected_font,
            )

            line_width = (
                bbox[2]
                - bbox[0]
            )

            draw.text(
                (
                    (
                        self.CANVAS_SIZE[0]
                        - line_width
                    )
                    / 2,
                    y,
                ),

                line,
                font=selected_font,

                fill=(
                    248,
                    248,
                    250,
                    255,
                ),
            )

            y += (
                line_height
                + line_spacing
            )


    def _draw_author(
        self,
        draw,
        author,
    ):
        if not author:
            return

        text = (
            f"by {author}"
        )

        font = self._load_font(
            18,
            bold=False,
        )

        text = self._truncate_text(
            draw,
            text,
            font,
            345,
        )

        bbox = draw.textbbox(
            (
                0,
                0,
            ),
            text,
            font=font,
        )

        text_width = (
            bbox[2]
            - bbox[0]
        )

        draw.text(
            (
                (
                    self.CANVAS_SIZE[0]
                    - text_width
                )
                / 2,
                584,
            ),

            text,
            font=font,

            fill=(
                235,
                235,
                240,
                255,
            ),
        )


    def _draw_format(
        self,
        draw,
        overlay,
        format_label,
    ):
        clean_label = re.sub(
            r"\s*\([^)]*\)\s*$",
            "",
            format_label
            or "Deck",
        ).strip().upper()

        if not clean_label:
            clean_label = "DECK"

        font = (
            self._fit_single_line_font(
                draw,
                clean_label,
                max_width=380,
                start_size=27,
                minimum_size=18,
                bold=True,
            )
        )

        bbox = draw.textbbox(
            (
                0,
                0,
            ),
            clean_label,
            font=font,
        )

        text_width = (
            bbox[2]
            - bbox[0]
        )

        text_height = (
            bbox[3]
            - bbox[1]
        )

        sample_rgb = (
            overlay
            .convert("RGB")
            .getpixel(
                (
                    self.CANVAS_SIZE[0]
                    // 2,
                    675,
                )
            )
        )

        luminance = (
            (
                0.2126
                * sample_rgb[0]
            )
            + (
                0.7152
                * sample_rgb[1]
            )
            + (
                0.0722
                * sample_rgb[2]
            )
        )

        text_rgb = (
            (
                16,
                19,
                24,
            )

            if luminance
            >= 145

            else (
                248,
                248,
                250,
            )
        )

        draw.text(
            (
                (
                    self.CANVAS_SIZE[0]
                    - text_width
                )
                / 2,

                675
                - (
                    text_height
                    / 2
                )
                - 2,
            ),

            clean_label,
            font=font,

            fill=(
                text_rgb
                + (255,)
            ),
        )


    def _fit_single_line_font(
        self,
        draw,
        text,
        max_width,
        start_size,
        minimum_size,
        bold,
    ):
        for size in range(
            start_size,
            minimum_size - 1,
            -1,
        ):
            font = self._load_font(
                size,
                bold=bold,
            )

            bbox = draw.textbbox(
                (
                    0,
                    0,
                ),
                text,
                font=font,
            )

            if (
                bbox[2]
                - bbox[0]
            ) <= max_width:
                return font

        return self._load_font(
            minimum_size,
            bold=bold,
        )


    def _truncate_text(
        self,
        draw,
        text,
        font,
        max_width,
    ):
        clean_text = str(
            text
            or ""
        ).strip()

        if not clean_text:
            return ""

        bbox = draw.textbbox(
            (
                0,
                0,
            ),
            clean_text,
            font=font,
        )

        if (
            bbox[2]
            - bbox[0]
        ) <= max_width:
            return clean_text

        suffix = "…"

        while clean_text:
            clean_text = (
                clean_text[:-1]
                .rstrip()
            )

            candidate = (
                clean_text
                + suffix
            )

            bbox = draw.textbbox(
                (
                    0,
                    0,
                ),
                candidate,
                font=font,
            )

            if (
                bbox[2]
                - bbox[0]
            ) <= max_width:
                return candidate

        return suffix


    def _wrap_text(
        self,
        draw,
        text,
        font,
        max_width,
    ):
        words = str(
            text
            or ""
        ).strip().split()

        if not words:
            return []

        lines = []
        current_line = ""

        for word in words:
            test_line = (
                word
                if not current_line
                else (
                    f"{current_line} "
                    f"{word}"
                )
            )

            bbox = draw.textbbox(
                (
                    0,
                    0,
                ),
                test_line,
                font=font,
            )

            if (
                (
                    bbox[2]
                    - bbox[0]
                )
                <= max_width

                or not current_line
            ):
                current_line = (
                    test_line
                )

            else:
                lines.append(
                    current_line
                )

                current_line = word

        if current_line:
            lines.append(
                current_line
            )

        return lines


    @staticmethod
    def _load_font(
        size,
        bold=True,
    ):
        font_names = (
            (
                "DejaVuSans-Bold.ttf",
                "arialbd.ttf",
            )

            if bold

            else (
                "DejaVuSans.ttf",
                "arial.ttf",
            )
        )

        for font_name in font_names:
            try:
                return ImageFont.truetype(
                    font_name,
                    size,
                )

            except Exception:
                continue

        return ImageFont.load_default()
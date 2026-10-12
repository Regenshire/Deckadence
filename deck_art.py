from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import hashlib
import json
import logging
import os
import re
import threading
import unicodedata

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
    subtitle: str = ""
    format_label: str = ""
    title_font_size: int = 34
    subtitle_font_size: int = 18
    title_offset_y: int = 0
    subtitle_offset_y: int = 0
    color_identity: tuple[str, ...] = ()
    scryfall_id: str = ""
    frame_key: str = ""
    artwork_path: str = ""
    artwork_zoom: float = 1.0
    artwork_offset_x: float = 0.0
    artwork_offset_y: float = 0.0

class DeckArtRenderer:
    CACHE_VERSION = 5

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

    TITLE_FONT_SIZE_DEFAULT = 34
    TITLE_FONT_SIZE_MIN = 18
    TITLE_FONT_SIZE_MAX = 44

    SUBTITLE_FONT_SIZE_DEFAULT = 18
    SUBTITLE_FONT_SIZE_MIN = 12
    SUBTITLE_FONT_SIZE_MAX = 28

    TEXT_OFFSET_Y_MIN = -60
    TEXT_OFFSET_Y_MAX = 60

    TITLE_CENTER_Y = 514
    SUBTITLE_TOP_Y = 584

    COLOR_ORDER = (
        "W",
        "U",
        "B",
        "R",
        "G",
        "C",
    )

    OVERLAY_BY_KEY = {
        "white": "deckbox_white.png",
        "blue": "deckbox_blue.png",
        "black": "deckbox_black.png",
        "red": "deckbox_red.png",
        "green": "deckbox_green.png",
        "gold": "deckbox_gold.png",
        "silver": "deckbox_silver.png",
    }

    FRAME_LABELS = {
        "none": "No Frame",
        "white": "Default - White",
        "blue": "Default - Blue",
        "black": "Default - Black",
        "red": "Default - Red",
        "green": "Default - Green",
        "gold": "Default - Gold",
        "silver": "Default - Silver",
    }

    SINGLE_COLOR_OVERLAY = {
        "W": "white",
        "U": "blue",
        "B": "black",
        "R": "red",
        "G": "green",
    }

    FRAME_KEYS = (
        "none",
        *OVERLAY_BY_KEY.keys(),
    )

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

        cache_payload = {
            "version": self.CACHE_VERSION,
            "deck_name": clean_spec.deck_name,
            "author": clean_spec.author,
            "subtitle": clean_spec.subtitle,
            "format_label": clean_spec.format_label,
            "title_font_size": clean_spec.title_font_size,
            "subtitle_font_size": clean_spec.subtitle_font_size,
            "title_offset_y": clean_spec.title_offset_y,
            "subtitle_offset_y": clean_spec.subtitle_offset_y,
            "color_identity": list(
                clean_spec.color_identity
            ),
            "scryfall_id": clean_spec.scryfall_id,
            "frame_key": clean_spec.frame_key,
            "artwork_zoom": clean_spec.artwork_zoom,
            "artwork_offset_x": clean_spec.artwork_offset_x,
            "artwork_offset_y": clean_spec.artwork_offset_y,
        }

        if clean_spec.frame_key != "none":
            overlay_path = self._overlay_path(
                clean_spec.frame_key
            )
            overlay_stat = os.stat(
                overlay_path
            )

            cache_payload.update({
                "overlay_size": overlay_stat.st_size,
                "overlay_mtime_ns": overlay_stat.st_mtime_ns,
            })

        if clean_spec.artwork_path:
            artwork_stat = os.stat(
                clean_spec.artwork_path
            )

            cache_payload.update({
                "artwork_path": clean_spec.artwork_path,
                "artwork_size": artwork_stat.st_size,
                "artwork_mtime_ns": artwork_stat.st_mtime_ns,
            })

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

        overlay = Image.new(
            "RGBA",
            self.CANVAS_SIZE,
            (
                0,
                0,
                0,
                0,
            ),
        )

        has_frame = (
            clean_spec.frame_key
            != "none"
        )

        if has_frame:
            overlay_path = self._overlay_path(
                clean_spec.frame_key
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

        art_box = (
            self.ART_BOX
            if has_frame
            else (
                0,
                0,
                self.CANVAS_SIZE[0],
                self.CANVAS_SIZE[1],
            )
        )

        art_width = (
            art_box[2]
            - art_box[0]
        )

        art_height = (
            art_box[3]
            - art_box[1]
        )

        artwork = self._load_artwork(
            clean_spec.scryfall_id,
            (
                art_width,
                art_height,
            ),
            artwork_path=(
                clean_spec.artwork_path
            ),
            zoom=clean_spec.artwork_zoom,
            offset_x=(
                clean_spec.artwork_offset_x
            ),
            offset_y=(
                clean_spec.artwork_offset_y
            ),
        )

        image.paste(
            artwork,
            (
                art_box[0],
                art_box[1],
            ),
        )

        if has_frame:
            image.alpha_composite(
                overlay
            )
        else:
            no_frame_shade = Image.new(
                "RGBA",
                self.CANVAS_SIZE,
                (
                    0,
                    0,
                    0,
                    0,
                ),
            )

            shade_draw = ImageDraw.Draw(
                no_frame_shade
            )

            shade_draw.rectangle(
                (
                    0,
                    450,
                    self.CANVAS_SIZE[0],
                    self.CANVAS_SIZE[1],
                ),
                fill=(
                    0,
                    0,
                    0,
                    168,
                ),
            )

            image.alpha_composite(
                no_frame_shade
            )

        draw = ImageDraw.Draw(
            image
        )

        if has_frame:
            self._draw_mana_identity(
                image,
                clean_spec.color_identity,
            )

        self._draw_deck_name(
            draw,
            clean_spec.deck_name,
            font_size=clean_spec.title_font_size,
            offset_y=clean_spec.title_offset_y,
        )

        if clean_spec.subtitle:
            self._draw_subtitle(
                draw,
                clean_spec.subtitle,
                font_size=clean_spec.subtitle_font_size,
                offset_y=clean_spec.subtitle_offset_y,
            )
        else:
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

    @staticmethod
    def _sanitize_render_text(
        value,
        preserve_newlines=False,
    ):
        text = unicodedata.normalize(
            "NFC",
            str(value or ""),
        ).replace(
            "\r\n",
            "\n",
        ).replace(
            "\r",
            "\n",
        )

        cleaned_characters = []

        for character in text:
            if (
                preserve_newlines
                and character == "\n"
            ):
                cleaned_characters.append(
                    character
                )
                continue

            if character.isascii():
                if character.isprintable():
                    cleaned_characters.append(
                        character
                    )
                continue

            category = unicodedata.category(
                character
            )

            if category[:1] in {
                "L",
                "N",
                "P",
                "Z",
            }:
                cleaned_characters.append(
                    character
                )

        cleaned_text = "".join(
            cleaned_characters
        )

        if preserve_newlines:
            lines = [
                re.sub(
                    r"\s+",
                    " ",
                    line,
                ).strip()
                for line in cleaned_text.split(
                    "\n"
                )
            ]

            while lines and not lines[0]:
                lines.pop(0)

            while lines and not lines[-1]:
                lines.pop()

            return "\n".join(
                lines
            )

        return re.sub(
            r"\s+",
            " ",
            cleaned_text,
        ).strip()
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
            self._sanitize_render_text(
                spec.deck_name,
                preserve_newlines=True,
            )
            or "Untitled Deck"
        )

        author = (
            self._sanitize_render_text(
                spec.author
            )
        )

        subtitle = (
            self._sanitize_render_text(
                spec.subtitle,
                preserve_newlines=True,
            )
        )

        format_label = (
            self._sanitize_render_text(
                spec.format_label
            )
        )

        scryfall_id = str(
            spec.scryfall_id
            or ""
        ).strip().lower()

        artwork_path = str(
            spec.artwork_path
            or ""
        ).strip()

        if artwork_path:
            artwork_path = os.path.abspath(
                artwork_path
            )

            if not os.path.isfile(
                artwork_path
            ):
                artwork_path = ""

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

        frame_key = self.resolve_frame_key(
            spec.frame_key,
            normalized_colors,
        )

        return DeckArtSpec(
            deck_name=deck_name,
            author=author,
            subtitle=subtitle,
            format_label=format_label,
            title_font_size=self._normalize_int(
                spec.title_font_size,
                self.TITLE_FONT_SIZE_DEFAULT,
                self.TITLE_FONT_SIZE_MIN,
                self.TITLE_FONT_SIZE_MAX,
            ),
            subtitle_font_size=self._normalize_int(
                spec.subtitle_font_size,
                self.SUBTITLE_FONT_SIZE_DEFAULT,
                self.SUBTITLE_FONT_SIZE_MIN,
                self.SUBTITLE_FONT_SIZE_MAX,
            ),
            title_offset_y=self._normalize_int(
                spec.title_offset_y,
                0,
                self.TEXT_OFFSET_Y_MIN,
                self.TEXT_OFFSET_Y_MAX,
            ),
            subtitle_offset_y=self._normalize_int(
                spec.subtitle_offset_y,
                0,
                self.TEXT_OFFSET_Y_MIN,
                self.TEXT_OFFSET_Y_MAX,
            ),
            color_identity=(
                normalized_colors
            ),
            scryfall_id=scryfall_id,
            frame_key=frame_key,
            artwork_path=artwork_path,
            artwork_zoom=self._normalize_zoom(
                spec.artwork_zoom
            ),
            artwork_offset_x=self._normalize_offset(
                spec.artwork_offset_x
            ),
            artwork_offset_y=self._normalize_offset(
                spec.artwork_offset_y
            ),
        )


    @staticmethod
    def _normalize_int(
        value,
        default_value,
        minimum_value,
        maximum_value,
    ):
        try:
            parsed_value = int(
                round(
                    float(value)
                )
            )
        except (
            TypeError,
            ValueError,
        ):
            parsed_value = int(
                default_value
            )

        return max(
            int(minimum_value),
            min(
                int(maximum_value),
                parsed_value,
            ),
        )


    @staticmethod
    def _normalize_zoom(
        value,
    ):
        try:
            parsed_value = float(
                value
            )
        except (
            TypeError,
            ValueError,
        ):
            parsed_value = 1.0

        return max(
            1.0,
            min(
                3.0,
                parsed_value,
            ),
        )


    @staticmethod
    def _normalize_offset(
        value,
    ):
        try:
            parsed_value = float(
                value
            )
        except (
            TypeError,
            ValueError,
        ):
            parsed_value = 0.0

        return max(
            -1.0,
            min(
                1.0,
                parsed_value,
            ),
        )


    @staticmethod
    def _apply_artwork_offset(
        base_position,
        offset,
    ):
        if offset < 0:
            return base_position * (
                1.0 + offset
            )

        return (
            base_position
            + (
                1.0
                - base_position
            )
            * offset
        )

    def resolve_frame_key(
        self,
        frame_key,
        color_identity=(),
    ):
        clean_frame_key = str(
            frame_key
            or ""
        ).strip().lower()

        if not clean_frame_key:
            return self._resolve_overlay_key(
                color_identity
            )

        if clean_frame_key not in self.FRAME_KEYS:
            raise ValueError(
                "Unsupported deck art frame: "
                f"{clean_frame_key}"
            )

        return clean_frame_key


    @classmethod
    def frame_label(
        cls,
        frame_key,
    ):
        clean_key = str(
            frame_key
            or ""
        ).strip().lower()

        if clean_key in cls.FRAME_LABELS:
            return cls.FRAME_LABELS[
                clean_key
            ]

        return (
            clean_key
            .replace("_", " ")
            .strip()
            .title()
            or "Frame"
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
        *,
        artwork_path="",
        zoom=1.0,
        offset_x=0.0,
        offset_y=0.0,
    ):
        clean_artwork_path = str(
            artwork_path
            or ""
        ).strip()

        if clean_artwork_path:
            try:
                with Image.open(
                    clean_artwork_path
                ) as source_image:
                    source_image = (
                        ImageOps.exif_transpose(
                            source_image
                        )
                        .convert("RGB")
                    )

                    return self._fit_artwork(
                        source_image,
                        target_size,
                        centering=(
                            0.5,
                            0.5,
                        ),
                        zoom=zoom,
                        offset_x=offset_x,
                        offset_y=offset_y,
                    )

            except Exception as exc:
                LOGGER.warning(
                    "DECK ART | Local artwork load failed "
                    "| path=%s | error=%s",
                    clean_artwork_path,
                    str(exc),
                )

        clean_scryfall_id = str(
            scryfall_id
            or ""
        ).strip().lower()

        valid_scryfall_id = bool(
            self.build_scryfall_artwork_url(
                clean_scryfall_id
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
                self.build_scryfall_artwork_url(
                    clean_scryfall_id,
                    image_kind=image_kind,
                )
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

                        return self._fit_artwork(
                            source_image,
                            target_size,
                            centering=centering,
                            zoom=zoom,
                            offset_x=offset_x,
                            offset_y=offset_y,
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
    def build_scryfall_artwork_url(
        scryfall_id,
        image_kind="art_crop",
    ):
        clean_scryfall_id = str(
            scryfall_id
            or ""
        ).strip().lower()

        clean_image_kind = str(
            image_kind
            or "art_crop"
        ).strip().lower()

        if clean_image_kind not in {
            "art_crop",
            "large",
            "normal",
        }:
            return ""

        if not re.fullmatch(
            (
                r"[0-9a-f]{8}-"
                r"[0-9a-f]{4}-"
                r"[0-9a-f]{4}-"
                r"[0-9a-f]{4}-"
                r"[0-9a-f]{12}"
            ),
            clean_scryfall_id,
            flags=re.IGNORECASE,
        ):
            return ""

        return (
            "https://cards.scryfall.io/"
            f"{clean_image_kind}/front/"
            f"{clean_scryfall_id[0]}/"
            f"{clean_scryfall_id[1]}/"
            f"{clean_scryfall_id}.jpg"
        )


    def _fit_artwork(
        self,
        source_image,
        target_size,
        *,
        centering=(
            0.5,
            0.5,
        ),
        zoom=1.0,
        offset_x=0.0,
        offset_y=0.0,
    ):
        target_width = max(
            1,
            int(target_size[0]),
        )
        target_height = max(
            1,
            int(target_size[1]),
        )

        source_width = max(
            1,
            int(source_image.width),
        )
        source_height = max(
            1,
            int(source_image.height),
        )

        clean_zoom = self._normalize_zoom(
            zoom
        )
        clean_offset_x = self._normalize_offset(
            offset_x
        )
        clean_offset_y = self._normalize_offset(
            offset_y
        )

        cover_scale = max(
            target_width / source_width,
            target_height / source_height,
        )

        scale = (
            cover_scale
            * clean_zoom
        )

        resized_width = max(
            target_width,
            int(round(
                source_width
                * scale
            )),
        )
        resized_height = max(
            target_height,
            int(round(
                source_height
                * scale
            )),
        )

        resized_image = source_image.resize(
            (
                resized_width,
                resized_height,
            ),
            Image.LANCZOS,
        )

        extra_x = max(
            0,
            resized_width
            - target_width,
        )
        extra_y = max(
            0,
            resized_height
            - target_height,
        )

        base_x = max(
            0.0,
            min(
                1.0,
                float(centering[0]),
            ),
        )
        base_y = max(
            0.0,
            min(
                1.0,
                float(centering[1]),
            ),
        )

        crop_x = self._apply_artwork_offset(
            base_x,
            clean_offset_x,
        )
        crop_y = self._apply_artwork_offset(
            base_y,
            clean_offset_y,
        )

        left = int(round(
            extra_x
            * crop_x
        ))
        top = int(round(
            extra_y
            * crop_y
        ))

        return resized_image.crop((
            left,
            top,
            left + target_width,
            top + target_height,
        ))


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
        font_size=None,
        offset_y=0,
    ):
        max_width = 330
        max_lines = 2

        requested_size = self._normalize_int(
            font_size,
            self.TITLE_FONT_SIZE_DEFAULT,
            self.TITLE_FONT_SIZE_MIN,
            self.TITLE_FONT_SIZE_MAX,
        )

        selected_font = None
        selected_size = requested_size
        lines = []

        for size in range(
            requested_size,
            self.TITLE_FONT_SIZE_MIN - 1,
            -1,
        ):
            candidate_font = self._load_font(
                size,
                bold=True,
            )

            candidate_lines = self._wrap_text(
                draw,
                deck_name,
                candidate_font,
                max_width,
            )

            if len(candidate_lines) <= max_lines:
                selected_font = candidate_font
                selected_size = size
                lines = candidate_lines
                break

        if selected_font is None:
            selected_size = self.TITLE_FONT_SIZE_MIN

            selected_font = self._load_font(
                selected_size,
                bold=True,
            )

            lines = self._wrap_text(
                draw,
                deck_name,
                selected_font,
                max_width,
                max_lines=max_lines,
            )

        line_spacing = max(
            4,
            int(round(
                selected_size
                * 0.35
            )),
        )

        line_heights = []

        for line in lines:
            bbox = draw.textbbox(
                (0, 0),
                line or " ",
                font=selected_font,
            )

            line_heights.append(
                bbox[3] - bbox[1]
            )

        total_height = sum(
            line_heights
        )

        if len(lines) > 1:
            total_height += (
                line_spacing
                * (len(lines) - 1)
            )

        clean_offset_y = self._normalize_int(
            offset_y,
            0,
            self.TEXT_OFFSET_Y_MIN,
            self.TEXT_OFFSET_Y_MAX,
        )

        y = int(
            self.TITLE_CENTER_Y
            + clean_offset_y
            - (total_height / 2)
        )

        for line, line_height in zip(
            lines,
            line_heights,
        ):
            bbox = draw.textbbox(
                (0, 0),
                line,
                font=selected_font,
            )

            line_width = (
                bbox[2] - bbox[0]
            )

            draw.text(
                (
                    (
                        self.CANVAS_SIZE[0]
                        - line_width
                    )
                    / 2,
                    y - bbox[1],
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


    def _draw_subtitle(
        self,
        draw,
        subtitle,
        font_size=None,
        offset_y=0,
    ):
        if not subtitle:
            return

        max_width = 345
        max_lines = 2

        requested_size = self._normalize_int(
            font_size,
            self.SUBTITLE_FONT_SIZE_DEFAULT,
            self.SUBTITLE_FONT_SIZE_MIN,
            self.SUBTITLE_FONT_SIZE_MAX,
        )

        selected_font = None
        selected_size = requested_size
        lines = []

        for size in range(
            requested_size,
            self.SUBTITLE_FONT_SIZE_MIN - 1,
            -1,
        ):
            candidate_font = self._load_font(
                size,
                bold=False,
            )

            candidate_lines = self._wrap_text(
                draw,
                subtitle,
                candidate_font,
                max_width,
            )

            if len(candidate_lines) <= max_lines:
                selected_font = candidate_font
                selected_size = size
                lines = candidate_lines
                break

        if selected_font is None:
            selected_size = self.SUBTITLE_FONT_SIZE_MIN

            selected_font = self._load_font(
                selected_size,
                bold=False,
            )

            lines = self._wrap_text(
                draw,
                subtitle,
                selected_font,
                max_width,
                max_lines=max_lines,
            )

        line_spacing = max(
            3,
            int(round(
                selected_size
                * 0.40
            )),
        )

        clean_offset_y = self._normalize_int(
            offset_y,
            0,
            self.TEXT_OFFSET_Y_MIN,
            self.TEXT_OFFSET_Y_MAX,
        )

        y = (
            self.SUBTITLE_TOP_Y
            + clean_offset_y
        )

        for line in lines:
            bbox = draw.textbbox(
                (0, 0),
                line or " ",
                font=selected_font,
            )

            text_width = (
                bbox[2] - bbox[0]
            )

            text_height = (
                bbox[3] - bbox[1]
            )

            draw.text(
                (
                    (
                        self.CANVAS_SIZE[0]
                        - text_width
                    )
                    / 2,
                    y - bbox[1],
                ),
                line,
                font=selected_font,
                fill=(
                    235,
                    235,
                    240,
                    255,
                ),
            )

            y += (
                text_height
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
            or "",
        ).strip().upper()

        if not clean_label:
            return

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
        max_lines=None,
    ):
        paragraphs = str(
            text
            or ""
        ).replace(
            "\r\n",
            "\n",
        ).replace(
            "\r",
            "\n",
        ).split(
            "\n"
        )

        if not paragraphs:
            return []

        lines = []

        for paragraph in paragraphs:
            words = paragraph.strip().split()

            if not words:
                if lines:
                    lines.append("")
                continue

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
                    (0, 0),
                    test_line,
                    font=font,
                )

                if (
                    (bbox[2] - bbox[0])
                    <= max_width
                    or not current_line
                ):
                    current_line = test_line
                else:
                    lines.append(
                        current_line
                    )

                    current_line = word

            if current_line:
                lines.append(
                    current_line
                )

        while lines and not lines[0]:
            lines.pop(0)

        while lines and not lines[-1]:
            lines.pop()

        if (
            max_lines is not None
            and len(lines) > max_lines
        ):
            visible_lines = lines[:max_lines]

            last_line = (
                visible_lines[-1]
                or ""
            ).rstrip()

            if not last_line.endswith("…"):
                last_line += "…"

            visible_lines[-1] = self._truncate_text(
                draw,
                last_line,
                font,
                max_width,
            )

            return visible_lines

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
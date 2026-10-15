import os
from pathlib import Path
from typing import Tuple, Optional
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageColor

from .image_utils import base64_to_pil, save_pil_image, pil_to_base64
from ...domain.models.content_studio import AddTextRequest, AddTextResponse

# Common font candidates across macOS and Linux
FONT_CANDIDATES = {
    "sans-serif": [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
    ],
    "serif": [
        "/System/Library/Fonts/Supplemental/Georgia.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
    ],
    "monospace": [
        "/System/Library/Fonts/Supplemental/Courier New.ttf",
        "/System/Library/Fonts/Monaco.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
    ],
    "impact": [
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/System/Library/Fonts/Supplemental/Arial Black.ttf"
    ],
    "bold": [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/HelveticaNeue.ttc"
    ]
}

def get_font(family: str, size: int) -> ImageFont.FreeTypeFont:
    """Finds a matching system TTF/TTC font, fallback to default."""
    candidates = FONT_CANDIDATES.get(family.lower(), FONT_CANDIDATES["sans-serif"])
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    # Fallback to default
    try:
        return ImageFont.load_default()
    except Exception:
        return ImageFont.load_default()

def parse_color(color_str: str) -> Tuple[int, int, int, int]:
    """Parses hex, rgb, or rgba color into (r, g, b, a)."""
    color_str = color_str.strip()
    if color_str.startswith("rgba"):
        import re
        nums = [float(x.strip()) for x in re.findall(r"[\d\.]+", color_str)]
        r = int(nums[0])
        g = int(nums[1])
        b = int(nums[2])
        a = int(nums[3] * 255) if nums[3] <= 1.0 else int(nums[3])
        return (r, g, b, a)
    elif color_str.startswith("rgb"):
        import re
        nums = [int(x.strip()) for x in re.findall(r"\d+", color_str)]
        return (nums[0], nums[1], nums[2], 255)
    else:
        try:
            rgb = ImageColor.getrgb(color_str)
            if len(rgb) == 3:
                return (rgb[0], rgb[1], rgb[2], 255)
            return rgb
        except Exception:
            return (255, 255, 255, 255)

class TypographyService:
    @staticmethod
    def add_text_to_image(req: AddTextRequest) -> AddTextResponse:
        base_img = base64_to_pil(req.image_base64).convert("RGBA")
        width, height = base_img.size

        font = get_font(req.font_family, req.font_size)

        # Split text into lines or wrap
        lines = req.text.split("\n")
        # Measure multiline text
        dummy_img = Image.new("RGBA", (1, 1))
        dummy_draw = ImageDraw.Draw(dummy_img)

        line_bboxes = [dummy_draw.textbbox((0, 0), line, font=font) for line in lines]
        line_widths = [b[2] - b[0] for b in line_bboxes]
        line_heights = [b[3] - b[1] for b in line_bboxes]
        line_spacing = int(req.font_size * 0.25)

        total_text_width = max(line_widths) if line_widths else 0
        total_text_height = sum(line_heights) + (len(lines) - 1) * line_spacing

        # Determine position
        pad = 40
        if req.position == "top-center":
            x = (width - total_text_width) // 2
            y = pad
        elif req.position == "top-left":
            x = pad
            y = pad
        elif req.position == "top-right":
            x = width - total_text_width - pad
            y = pad
        elif req.position == "center":
            x = (width - total_text_width) // 2
            y = (height - total_text_height) // 2
        elif req.position == "bottom-left":
            x = pad
            y = height - total_text_height - pad
        elif req.position == "bottom-right":
            x = width - total_text_width - pad
            y = height - total_text_height - pad
        elif req.position == "bottom-center":
            x = (width - total_text_width) // 2
            y = height - total_text_height - pad
        elif req.position == "custom" and req.custom_x is not None and req.custom_y is not None:
            x = req.custom_x
            y = req.custom_y
        else:
            x = (width - total_text_width) // 2
            y = height - total_text_height - pad

        # Create overlay layer
        overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        # Parse colors
        fill_color = parse_color(req.font_color)
        if req.opacity < 1.0:
            fill_color = (fill_color[0], fill_color[1], fill_color[2], int(fill_color[3] * req.opacity))

        # Background badge box
        if req.background_box:
            box_pad = req.background_padding
            box_color = parse_color(req.background_color)
            box_rect = [
                x - box_pad,
                y - box_pad,
                x + total_text_width + box_pad,
                y + total_text_height + box_pad
            ]
            draw.rounded_rectangle(box_rect, radius=req.border_radius, fill=box_color)

        # Shadow layer
        if req.shadow:
            shadow_overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
            shadow_draw = ImageDraw.Draw(shadow_overlay)
            shadow_color = parse_color(req.shadow_color)
            s_offset = max(2, req.font_size // 15)

            curr_y = y + s_offset
            for i, line in enumerate(lines):
                lx = x + (total_text_width - line_widths[i]) // 2 + s_offset
                shadow_draw.text((lx, curr_y), line, font=font, fill=shadow_color)
                curr_y += line_heights[i] + line_spacing

            if req.shadow_blur > 0:
                shadow_overlay = shadow_overlay.filter(ImageFilter.GaussianBlur(req.shadow_blur))
            overlay = Image.alpha_composite(overlay, shadow_overlay)
            draw = ImageDraw.Draw(overlay)

        # Draw main text lines with optional outline
        curr_y = y
        outline_color = parse_color(req.outline_color) if req.outline_width > 0 else None

        for i, line in enumerate(lines):
            lx = x + (total_text_width - line_widths[i]) // 2
            if req.outline_width > 0 and outline_color:
                draw.text(
                    (lx, curr_y),
                    line,
                    font=font,
                    fill=fill_color,
                    stroke_width=req.outline_width,
                    stroke_fill=outline_color
                )
            else:
                draw.text((lx, curr_y), line, font=font, fill=fill_color)
            curr_y += line_heights[i] + line_spacing

        # Rotation if requested
        if abs(req.rotation) > 0.01:
            overlay = overlay.rotate(req.rotation, resample=Image.Resampling.BICUBIC, center=(x + total_text_width // 2, y + total_text_height // 2))

        # Composite with original
        final_img = Image.alpha_composite(base_img, overlay)
        rgb_final = final_img.convert("RGB")

        # Save and return
        img_id, file_url = save_pil_image(rgb_final, prefix="txt")
        b64_output = pil_to_base64(rgb_final, format="PNG")

        return AddTextResponse(
            image_url=file_url,
            image_base64=b64_output,
            width=width,
            height=height
        )


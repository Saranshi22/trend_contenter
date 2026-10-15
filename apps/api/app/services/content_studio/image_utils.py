import base64
import io
import uuid
import re
from pathlib import Path
from typing import Tuple, Optional
from PIL import Image, ImageOps

from ...config import settings

settings.CONTENT_STUDIO_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

def clean_base64_string(b64_str: str) -> Tuple[bytes, str]:
    """
    Extracts binary image bytes and mime type from data URI or raw base64.
    """
    mime_type = "image/png"
    if "," in b64_str:
        header, b64_data = b64_str.split(",", 1)
        match = re.search(r"data:([^;]+);base64", header)
        if match:
            mime_type = match.group(1)
    else:
        b64_data = b64_str

    # Pad if necessary
    padding = len(b64_data) % 4
    if padding:
        b64_data += "=" * (4 - padding)

    image_bytes = base64.b64decode(b64_data)
    return image_bytes, mime_type

def base64_to_pil(b64_str: str) -> Image.Image:
    """Converts a base64 string to a PIL Image."""
    image_bytes, _ = clean_base64_string(b64_str)
    image = Image.open(io.BytesIO(image_bytes))
    return image.convert("RGBA" if image.mode in ("RGBA", "LA") or "transparency" in image.info else "RGB")

def pil_to_base64(image: Image.Image, format: str = "PNG") -> str:
    """Converts a PIL Image to a data URI base64 string."""
    buffered = io.BytesIO()
    # If saving as JPEG, ensure RGB mode
    if format.upper() in ("JPEG", "JPG") and image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    image.save(buffered, format=format)
    img_b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    mime = "image/jpeg" if format.upper() in ("JPEG", "JPG") else "image/png"
    return f"data:{mime};base64,{img_b64}"

def bytes_to_base64(image_bytes: bytes, mime_type: str = "image/png") -> str:
    """Converts image bytes directly to a data URI base64 string."""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{mime_type};base64,{b64}"

def save_image_bytes(image_bytes: bytes, prefix: str = "gen", ext: str = "png") -> Tuple[str, str]:
    """
    Saves image bytes to content storage directory.
    Returns: (image_id, file_url)
    """
    img_id = f"{prefix}_{uuid.uuid4().hex[:12]}"
    filename = f"{img_id}.{ext}"
    filepath = settings.CONTENT_STUDIO_MEDIA_DIR / filename
    with open(filepath, "wb") as f:
        f.write(image_bytes)
    return img_id, f"/api/v1/content-studio/media/{filename}"

def save_pil_image(image: Image.Image, prefix: str = "img", ext: str = "png") -> Tuple[str, str]:
    """Saves a PIL Image to storage and returns (image_id, file_url)."""
    img_id = f"{prefix}_{uuid.uuid4().hex[:12]}"
    filename = f"{img_id}.{ext}"
    filepath = settings.CONTENT_STUDIO_MEDIA_DIR / filename
    if ext.lower() in ("jpg", "jpeg") and image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    image.save(filepath)
    return img_id, f"/api/v1/content-studio/media/{filename}"

def create_mask_image(width: int, height: int, mask_type: str = "center") -> Image.Image:
    """Creates a synthetic binary mask (grayscale, 255=edit, 0=preserve)."""
    mask = Image.new("L", (width, height), 0)
    from PIL import ImageDraw
    draw = ImageDraw.Draw(mask)
    if mask_type == "background":
        # Invert: keep center subject, mask out perimeter
        draw.rectangle([width * 0.15, height * 0.15, width * 0.85, height * 0.85], fill=0)
        mask = ImageOps.invert(mask)
    elif mask_type == "center":
        draw.rectangle([width * 0.25, height * 0.25, width * 0.75, height * 0.75], fill=255)
    return mask


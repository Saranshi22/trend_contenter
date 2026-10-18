import base64
import io
import uuid
import re
import logging
from pathlib import Path
from typing import Tuple, Optional
from PIL import Image, ImageOps

from ...config import settings

logger = logging.getLogger(__name__)

settings.CONTENT_STUDIO_MEDIA_DIR.mkdir(parents=True, exist_ok=True)

def sync_file_to_gcs(filename: str, file_bytes: bytes, mime_type: Optional[str] = None) -> Optional[str]:
    """
    If GCS is enabled (via GCS_BUCKET or GCP_STORAGE_BUCKET_NAME), syncs the file bytes to GCS.
    Returns the GCS signed or public URL if available, or None if GCS is not enabled.
    Never raises an uncaught exception; logs a warning and allows local serving to continue seamlessly.
    """
    try:
        from ..storage import get_gcp_storage_adapter
        adapter = get_gcp_storage_adapter(
            bucket_name=settings.GCS_BUCKET or settings.GCP_STORAGE_BUCKET_NAME or None,
            service_key=settings.GCLOUD_SERVICE_KEY or None,
        )
        if not adapter:
            return None
        storage_key = f"content_studio/{filename}"
        adapter.upload_file_with_key_sync(storage_key, file_bytes, content_type=mime_type)
        logger.info("Successfully synced asset to GCS: %s", storage_key)
        try:
            return adapter.get_file_url(storage_key, expiry_seconds=86400)
        except Exception:
            return None
    except Exception as exc:
        logger.warning("GCS asset sync skipped or failed for %s: %s", filename, exc)
        return None

def clean_base64_string(b64_str: str) -> Tuple[bytes, str]:
    """
    Extracts binary image bytes and mime type from data URI or raw base64.
    Safely unwraps any nested or duplicate data URI prefixes.
    """
    mime_type = "image/png"
    cleaned = b64_str.strip()
    while cleaned.startswith("data:"):
        if "," in cleaned:
            header, cleaned = cleaned.split(",", 1)
            match = re.search(r"data:([^;]+);base64", header)
            if match:
                mime_type = match.group(1)
        else:
            break

    # Remove any stray whitespace or newlines
    cleaned = re.sub(r"\s+", "", cleaned)

    # Pad if necessary
    padding = len(cleaned) % 4
    if padding:
        cleaned += "=" * (4 - padding)

    image_bytes = base64.b64decode(cleaned)
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
    Saves image bytes to content storage directory and syncs to GCS if configured.
    Returns: (image_id, file_url)
    """
    img_id = f"{prefix}_{uuid.uuid4().hex[:12]}"
    filename = f"{img_id}.{ext}"
    filepath = settings.CONTENT_STUDIO_MEDIA_DIR / filename
    with open(filepath, "wb") as f:
        f.write(image_bytes)

    # Sync to GCS if enabled
    mime = "image/jpeg" if ext.lower() in ("jpg", "jpeg") else f"image/{ext.lower()}"
    sync_file_to_gcs(filename, image_bytes, mime_type=mime)

    return img_id, f"/api/v1/content-studio/media/{filename}"

def save_pil_image(image: Image.Image, prefix: str = "img", ext: str = "png") -> Tuple[str, str]:
    """Saves a PIL Image to storage, syncs to GCS if configured, and returns (image_id, file_url)."""
    img_id = f"{prefix}_{uuid.uuid4().hex[:12]}"
    filename = f"{img_id}.{ext}"
    filepath = settings.CONTENT_STUDIO_MEDIA_DIR / filename
    if ext.lower() in ("jpg", "jpeg") and image.mode in ("RGBA", "P"):
        image = image.convert("RGB")
    image.save(filepath)

    # Sync to GCS if enabled
    try:
        buffered = io.BytesIO()
        fmt = "JPEG" if ext.lower() in ("jpg", "jpeg") else ext.upper()
        image.save(buffered, format=fmt)
        mime = "image/jpeg" if ext.lower() in ("jpg", "jpeg") else f"image/{ext.lower()}"
        sync_file_to_gcs(filename, buffered.getvalue(), mime_type=mime)
    except Exception as e:
        logger.warning("Could not sync PIL image to GCS: %s", e)

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


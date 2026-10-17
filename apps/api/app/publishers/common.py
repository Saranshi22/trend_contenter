"""Shared primitives for enterprise-grade social publisher integrations."""

from __future__ import annotations

import base64
import logging
import os
import random
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlparse, urlsplit, urlunsplit

import requests

try:
    from .utilities import sanitize_for_logging
except ImportError:
    try:
        from utilities import sanitize_for_logging
    except ImportError:
        from publishers.utilities import sanitize_for_logging

LOGGER = logging.getLogger(__name__)

DEFAULT_TIMEOUT_SECONDS = 30.0
DEFAULT_RETRY_ATTEMPTS = 3
DEFAULT_RETRY_BACKOFF_BASE_SECONDS = 0.5
DEFAULT_RETRY_BACKOFF_MAX_SECONDS = 8.0
RETRYABLE_STATUS_CODES = {408, 425, 429, 500, 502, 503, 504}
SIGNED_IMAGE_UPLOAD_ENDPOINT = os.getenv(
    "SOCIAL_IMAGE_PROXY_UPLOAD_URL", "https://bodhi-vision-img-api.dev.psbodhi.live//api/v1/upload/image"
)
SIGNED_IMAGE_STORAGE_PROVIDER = os.getenv("SOCIAL_IMAGE_PROXY_STORAGE_PROVIDER", "aws")
SIGNED_IMAGE_PROXY_BEARER_TOKEN = os.getenv("SOCIAL_IMAGE_PROXY_BEARER_TOKEN", "eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIiwia2lkIiA6ICJ6YjhxdWJ0My0xZmlnRnc0NDBJVHlZX1JuZGQxd1poX3ZzYVVhYWxhaVdRIn0.eyJleHAiOjE3Nzk2OTAxMjIsImlhdCI6MTc3NDUwNjEyMiwianRpIjoib25ydHJvOmUxYzMxZjIzLTBhYTYtOWIxYy1jNTIwLTNhNzQ2M2IwMzRjOSIsImlzcyI6Imh0dHBzOi8vYXV0aC5kZXYucHNib2RoaS5saXZlL3JlYWxtcy9Cb2RoaUFjY2VzcyIsImF1ZCI6ImFjY291bnQiLCJzdWIiOiI1NWNjOTY2Zi05OGI1LTRhZjItYWJjNi03ZjAwMzdmOWM4ZmMiLCJ0eXAiOiJCZWFyZXIiLCJhenAiOiJib2RoaS1nZW5lcmFsLWFjY2VzcyIsInNpZCI6IjFkYzIxZGU3LWVlOTgtNDg3Ny04MDI5LTljOWJhNmE2YzMzYyIsImFjciI6IjEiLCJyZWFsbV9hY2Nlc3MiOnsicm9sZXMiOlsib2ZmbGluZV9hY2Nlc3MiLCJ1bWFfYXV0aG9yaXphdGlvbiIsImRlZmF1bHQtcm9sZXMtYm9kaGlhY2Nlc3MiXX0sInJlc291cmNlX2FjY2VzcyI6eyJhY2NvdW50Ijp7InJvbGVzIjpbIm1hbmFnZS1hY2NvdW50IiwibWFuYWdlLWFjY291bnQtbGlua3MiLCJ2aWV3LXByb2ZpbGUiXX19LCJzY29wZSI6InByb2ZpbGUgZW1haWwiLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwibmFtZSI6IkRoYWxhZGh1bGlzYWluYWdhc2FudG9zaCBEaGFsYWRodWxpc2FpbmFnYXNhbnRvc2giLCJwcmVmZXJyZWRfdXNlcm5hbWUiOiJkaGFsYWRodWxpc2FpbmFnYXNhbnRvc2hAcHVibGljaXNzYXBpZW50LmNvbSIsImdpdmVuX25hbWUiOiJEaGFsYWRodWxpc2FpbmFnYXNhbnRvc2giLCJmYW1pbHlfbmFtZSI6IkRoYWxhZGh1bGlzYWluYWdhc2FudG9zaCIsImRhaWx5X2xpbWl0IjoxMDAwLCJlbWFpbCI6ImRoYWxhZGh1bGlzYWluYWdhc2FudG9zaEBwdWJsaWNpc3NhcGllbnQuY29tIn0.Uj4oGljfVtPmnFc0Qz4yZP5IFWJp5FQj8KXt2V_9oLl21DqZ8PgmBo5q8ttzQRK0Lyyz-OYB-F6Aj0EyG-OYUXVMfppM8Ql5mz2DS3i_9IP7B0oijNElocl6tZMJjjDujsggyO86x-Kr6DpXnXtj5N5MBk_I2rgU_fpRSdZ52_JXUTWhUU2xXowPb4ImTQQJ7242JrqIYQDfIrgoqoliWBNF2kU9eigKzfEUqCS5PwTihL_Mb6fdys3v--8_zh7VPRp0jEY7VxllsPNBwLABmWOoX5NZu4ecXDTeAIme3kNJMzqCoBYfrNVMTZRmc26RwnT_71VEytiUZHw46BNfIA").strip()
SIGNED_IMAGE_URL_EXPIRATION_SECONDS = int(
    os.getenv("SOCIAL_IMAGE_PROXY_SIGNED_URL_EXPIRATION", "3600")
)
SIGNED_IMAGE_PROXY_TIMEOUT_SECONDS = float(os.getenv("SOCIAL_IMAGE_PROXY_TIMEOUT_SECONDS", "30"))
SIGNED_IMAGE_PROXY_ENABLED = os.getenv("SOCIAL_IMAGE_PROXY_ENABLED", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
IMAGE_DOWNLOAD_SSL_VERIFY = os.getenv("IMAGE_DOWNLOAD_SSL_VERIFY", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
IMAGE_DOWNLOAD_CA_BUNDLE_PATH = os.getenv("IMAGE_DOWNLOAD_CA_BUNDLE_PATH", "").strip()


class PublisherError(RuntimeError):
    """Canonical error for all provider publishing failures."""


@dataclass(slots=True)
class RetryPolicy:
    """Define bounded retry behavior for transient provider failures."""

    attempts: int = DEFAULT_RETRY_ATTEMPTS
    backoff_base_seconds: float = DEFAULT_RETRY_BACKOFF_BASE_SECONDS
    backoff_max_seconds: float = DEFAULT_RETRY_BACKOFF_MAX_SECONDS

    def normalized_attempts(self) -> int:
        return max(1, self.attempts)


def _compute_backoff_seconds(attempt: int, policy: RetryPolicy) -> float:
    exponential = policy.backoff_base_seconds * (2 ** max(0, attempt - 1))
    bounded = min(policy.backoff_max_seconds, exponential)
    # Full jitter to reduce thundering herd effects.
    return random.uniform(0.0, max(0.0, bounded))


def request_json(
    *,
    method: str,
    url: str,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    retry_policy: RetryPolicy | None = None,
    retryable_statuses: set[int] | None = None,
    request_error_context: str,
    parse_error_context: str,
    api_error_context: str,
    **kwargs: Any,
) -> dict[str, Any]:
    """Send HTTP request with resilient retry and normalized error semantics."""
    policy = retry_policy or RetryPolicy()
    retryable = retryable_statuses or RETRYABLE_STATUS_CODES
    sanitized_url = _sanitize_url(url)

    last_exception: Exception | None = None

    for attempt in range(1, policy.normalized_attempts() + 1):
        attempt_started = time.perf_counter()
        try:
            LOGGER.debug(
                "Outgoing API request",
                extra={
                    "event": "provider_http_request",
                    "method": method.upper(),
                    "url": sanitized_url,
                    "attempt": attempt,
                    "max_attempts": policy.normalized_attempts(),
                },
            )
            response = requests.request(
                method=method,
                url=url,
                timeout=timeout_seconds,
                **kwargs,
            )
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exception = exc
            if attempt < policy.normalized_attempts():
                delay = _compute_backoff_seconds(attempt, policy)
                LOGGER.warning(
                    "Transient network error",
                    extra={
                        "event": "provider_http_retry_scheduled",
                        "error_type": exc.__class__.__name__,
                        "method": method.upper(),
                        "url": sanitized_url,
                        "attempt": attempt,
                        "max_attempts": policy.normalized_attempts(),
                        "retry_delay_seconds": round(delay, 3),
                    },
                )
                time.sleep(delay)
                continue
            raise PublisherError(f"{request_error_context}: {exc}") from exc
        except requests.RequestException as exc:
            raise PublisherError(f"{request_error_context}: {exc}") from exc

        elapsed_ms = round((time.perf_counter() - attempt_started) * 1000, 2)
        LOGGER.debug(
            "Incoming API response",
            extra={
                "event": "provider_http_response",
                "method": method.upper(),
                "url": sanitized_url,
                "status_code": response.status_code,
                "attempt": attempt,
                "duration_ms": elapsed_ms,
            },
        )

        if response.status_code in retryable and attempt < policy.normalized_attempts():
            delay = _compute_backoff_seconds(attempt, policy)
            LOGGER.warning(
                "Retryable upstream response",
                extra={
                    "event": "provider_http_retry_scheduled",
                    "method": method.upper(),
                    "url": sanitized_url,
                    "status_code": response.status_code,
                    "attempt": attempt,
                    "max_attempts": policy.normalized_attempts(),
                    "retry_delay_seconds": round(delay, 3),
                },
            )
            time.sleep(delay)
            continue

        try:
            payload = response.json()
        except ValueError as exc:
            if response.status_code >= 400:
                raise PublisherError(
                    f"{api_error_context}: status={response.status_code}, body={response.text[:400]}"
                ) from exc
            raise PublisherError(parse_error_context) from exc

        if response.status_code >= 400:
            raise PublisherError(
                f"{api_error_context}: status={response.status_code}, payload={sanitize_for_logging(payload)}"
            )

        return payload

    if last_exception is not None:
        raise PublisherError(f"{request_error_context}: {last_exception}") from last_exception
    raise PublisherError(f"{request_error_context}: exhausted retries without response")


def _sanitize_url(url: str) -> str:
    split = urlsplit(url)
    if not split.query:
        return urlunsplit((split.scheme, split.netloc, split.path, "", ""))

    redacted_pairs = [(key, "***REDACTED***") for key, _ in parse_qsl(split.query, keep_blank_values=True)]
    return urlunsplit(
        (split.scheme, split.netloc, split.path, urlencode(redacted_pairs, doseq=True), "")
    )


def sniff_image_subtype(image_bytes: bytes) -> str | None:
    """Best-effort image subtype detection from magic bytes."""
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if image_bytes.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if image_bytes.startswith(b"BM"):
        return "bmp"
    if len(image_bytes) >= 12 and image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "webp"
    return None


def download_remote_image(
    *,
    url: str,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    retry_policy: RetryPolicy | None = None,
    max_bytes: int | None = None,
    request_error_context: str = "Image download failed",
) -> tuple[bytes, str]:
    """Download remote image bytes with retry and octet-stream sniffing support."""
    policy = retry_policy or RetryPolicy()
    sanitized_url = _sanitize_url(url)
    verify: bool | str = IMAGE_DOWNLOAD_CA_BUNDLE_PATH or IMAGE_DOWNLOAD_SSL_VERIFY
    last_exception: Exception | None = None

    if verify is False:
        LOGGER.warning(
            "SSL certificate verification is disabled for image downloads",
            extra={"event": "image_download_ssl_verification_disabled", "url": sanitized_url},
        )

    for attempt in range(1, policy.normalized_attempts() + 1):
        try:
            response = requests.get(url, timeout=timeout_seconds, verify=verify)
        except (requests.Timeout, requests.ConnectionError) as exc:
            last_exception = exc
            if attempt < policy.normalized_attempts():
                delay = _compute_backoff_seconds(attempt, policy)
                LOGGER.warning(
                    "Image download retry scheduled",
                    extra={
                        "event": "image_download_retry_scheduled",
                        "url": sanitized_url,
                        "attempt": attempt,
                        "max_attempts": policy.normalized_attempts(),
                        "retry_delay_seconds": round(delay, 3),
                        "error_type": exc.__class__.__name__,
                    },
                )
                time.sleep(delay)
                continue
            raise PublisherError(f"{request_error_context}: {exc}") from exc
        except requests.RequestException as exc:
            raise PublisherError(f"{request_error_context}: {exc}") from exc

        if response.status_code in RETRYABLE_STATUS_CODES and attempt < policy.normalized_attempts():
            delay = _compute_backoff_seconds(attempt, policy)
            LOGGER.warning(
                "Retryable image download response",
                extra={
                    "event": "image_download_retry_scheduled",
                    "url": sanitized_url,
                    "attempt": attempt,
                    "max_attempts": policy.normalized_attempts(),
                    "status_code": response.status_code,
                    "retry_delay_seconds": round(delay, 3),
                },
            )
            time.sleep(delay)
            continue

        if response.status_code >= 400:
            detail = response.text[:240] if response.text else ""
            raise PublisherError(
                f"{request_error_context}: status={response.status_code}, response={detail}"
            )

        image_bytes = response.content
        if not image_bytes:
            raise PublisherError(f"{request_error_context}: response body was empty")
        if max_bytes is not None and len(image_bytes) > max_bytes:
            raise ValueError(
                f"Downloaded image is {len(image_bytes)} bytes, which exceeds the {max_bytes} bytes limit."
            )

        content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
        sniffed_subtype = sniff_image_subtype(image_bytes)
        if content_type.startswith("image/"):
            subtype = content_type.split("/", 1)[1] if "/" in content_type else (sniffed_subtype or "jpeg")
            normalized_content_type = f"image/{subtype}"
        elif content_type in {"application/octet-stream", "binary/octet-stream", ""} and sniffed_subtype:
            normalized_content_type = f"image/{sniffed_subtype}"
            LOGGER.info(
                "Accepted generic-binary image response using signature sniffing",
                extra={
                    "event": "image_content_type_sniffed",
                    "url": sanitized_url,
                    "reported_content_type": content_type or "unknown",
                    "detected_content_type": normalized_content_type,
                },
            )
        else:
            raise PublisherError(
                f"{request_error_context}: expected image/* content-type or sniffable image bytes, "
                f"got '{content_type or 'unknown'}'."
            )

        return image_bytes, normalized_content_type

    if last_exception is not None:
        raise PublisherError(f"{request_error_context}: {last_exception}") from last_exception
    raise PublisherError(f"{request_error_context}: exhausted retries without response")


def resolve_provider_signed_image_url(
    *,
    image_url: str,
    timeout_seconds: float = SIGNED_IMAGE_PROXY_TIMEOUT_SECONDS,
    retry_policy: RetryPolicy | None = None,
) -> str:
    """Resolve source image URL to provider-signed URL through upload API."""
    if not SIGNED_IMAGE_PROXY_ENABLED:
        return image_url
    if not SIGNED_IMAGE_PROXY_BEARER_TOKEN:
        raise ValueError(
            "SOCIAL_IMAGE_PROXY_BEARER_TOKEN is required when SOCIAL_IMAGE_PROXY_ENABLED is true."
        )

    payload = request_json(
        method="POST",
        url=SIGNED_IMAGE_UPLOAD_ENDPOINT,
        timeout_seconds=timeout_seconds,
        retry_policy=retry_policy,
        request_error_context="Signed image URL request failed",
        parse_error_context="Signed image URL endpoint returned a non-JSON response",
        api_error_context="Signed image URL endpoint request failed",
        params={
            "storage_provider": SIGNED_IMAGE_STORAGE_PROVIDER,
            "signed_url_expiration": SIGNED_IMAGE_URL_EXPIRATION_SECONDS,
        },
        headers={"Authorization": f"Bearer {SIGNED_IMAGE_PROXY_BEARER_TOKEN}"},
        json={"image_url": image_url},
    )

    signed_url = payload.get("signed_url")
    if not isinstance(signed_url, str) or not signed_url.strip():
        raise PublisherError(
            "Signed image URL endpoint response missing non-empty 'signed_url': "
            f"{sanitize_for_logging(payload)}"
        )
    return signed_url.strip()


def load_image_bytes(
    image_ref: str | bytes,
    *,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    max_bytes: int | None = None,
) -> tuple[bytes, str]:
    """
    Universally loads raw binary image bytes and MIME type from:
    1. Raw bytes
    2. Base64 data URI (data:image/...;base64,...) or plain base64 string
    3. Local media path or URL (/api/v1/content-studio/media/<filename>)
    4. Local filesystem path (/app/apps/api/media/<filename>, apps/api/media/<filename>, or any absolute path)
    5. Filename only (gemini_gen_...png)
    6. Remote HTTP/HTTPS URL
    """
    if isinstance(image_ref, bytes):
        subtype = sniff_image_subtype(image_ref) or "png"
        return image_ref, f"image/{subtype}"

    cleaned = str(image_ref or "").strip()
    if not cleaned:
        raise ValueError("Image source cannot be empty.")

    # 1. Base64 data URI or raw base64 string
    if cleaned.startswith("data:image/") or ";base64," in cleaned:
        mime_type = "image/png"
        raw_b64 = cleaned
        if "," in cleaned:
            header, raw_b64 = cleaned.split(",", 1)
            m = re.search(r"data:([^;]+);base64", header)
            if m:
                mime_type = m.group(1).strip()
        raw_b64 = re.sub(r"\s+", "", raw_b64)
        padding = len(raw_b64) % 4
        if padding:
            raw_b64 += "=" * (4 - padding)
        b = base64.b64decode(raw_b64)
        sniffed = sniff_image_subtype(b)
        if sniffed:
            mime_type = f"image/{sniffed}"
        return b, mime_type

    # 2. Check local media directories
    candidate_filename = None
    if "/media/" in cleaned:
        candidate_filename = cleaned.split("/media/")[-1].split("?")[0].strip()
    elif not cleaned.startswith("http://") and not cleaned.startswith("https://") and not cleaned.startswith("/") and "." in cleaned:
        candidate_filename = cleaned.split("?")[0].strip()

    search_dirs = [
        Path("/app/apps/api/media"),
        Path("apps/api/media"),
        Path(__file__).resolve().parents[2] / "media",
    ]

    if candidate_filename:
        for sdir in search_dirs:
            p = (sdir / candidate_filename).resolve()
            if p.is_file():
                b = p.read_bytes()
                sniffed = sniff_image_subtype(b)
                ext = p.suffix.lstrip(".").lower()
                mime = f"image/{sniffed or ext or 'png'}"
                return b, mime

    # 3. Direct local disk path
    p = Path(cleaned)
    if p.is_file():
        b = p.read_bytes()
        sniffed = sniff_image_subtype(b)
        ext = p.suffix.lstrip(".").lower()
        mime = f"image/{sniffed or ext or 'png'}"
        return b, mime

    # 4. HTTP / HTTPS URL
    if cleaned.startswith("http://") or cleaned.startswith("https://"):
        # Check if URL references a local media file we can read directly without network
        if "/media/" in cleaned:
            fname = cleaned.split("/media/")[-1].split("?")[0].strip()
            for sdir in search_dirs:
                p = (sdir / fname).resolve()
                if p.is_file():
                    b = p.read_bytes()
                    sniffed = sniff_image_subtype(b)
                    return b, f"image/{sniffed or 'png'}"

        # Otherwise download remote image
        return download_remote_image(
            url=cleaned,
            timeout_seconds=timeout_seconds,
            max_bytes=max_bytes,
            request_error_context="Image download failed",
        )

    raise ValueError(f"Could not load image bytes from source: '{cleaned[:100]}'")


"""Instagram Graph publishing module with resilient polling and API calls."""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any

import requests
from pydantic import BaseModel, Field, ValidationError, field_validator

try:
    from .common import (
        PublisherError,
        RetryPolicy,
        download_remote_image,
        load_image_bytes,
        request_json,
        resolve_provider_signed_image_url,
    )
except ImportError:
    from publishers.common import (
        PublisherError,
        RetryPolicy,
        download_remote_image,
        load_image_bytes,
        request_json,
        resolve_provider_signed_image_url,
    )

try:
    from ..services.storage.gcp_storage import get_gcp_storage_adapter
except Exception:
    try:
        from apps.api.app.services.storage.gcp_storage import get_gcp_storage_adapter
    except Exception:
        try:
            from services.storage.gcp_storage import get_gcp_storage_adapter
        except Exception:
            get_gcp_storage_adapter = None

LOGGER = logging.getLogger(__name__)

GRAPH_BASE_URL = os.getenv("INSTAGRAM_GRAPH_API_BASE_URL", "https://graph.facebook.com")
GRAPH_VERSION = os.getenv("INSTAGRAM_GRAPH_API_VERSION", "v22.0")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("INSTAGRAM_HTTP_TIMEOUT_SECONDS", "30"))
DEFAULT_POLL_ATTEMPTS = int(os.getenv("INSTAGRAM_PUBLISH_POLL_ATTEMPTS", "5"))
DEFAULT_POLL_INTERVAL_SECONDS = float(os.getenv("INSTAGRAM_PUBLISH_POLL_INTERVAL_SECONDS", "2"))


class InstagramPostInput(BaseModel):
    image_url: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=2200)
    hashtags: list[str] = Field(default_factory=list)

    @field_validator("image_url", mode="before")
    @classmethod
    def normalize_image_url(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Post text cannot be empty.")
        return normalized

    @field_validator("hashtags", mode="before")
    @classmethod
    def normalize_hashtags(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            raw_parts = value.replace(",", " ").split()
        else:
            raw_parts = list(value)

        cleaned: list[str] = []
        seen: set[str] = set()
        for raw_part in raw_parts:
            tag = str(raw_part).strip().lstrip("#")
            if not tag:
                continue
            normalized = tag.replace(" ", "")
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(normalized)
        return cleaned

    @property
    def caption(self) -> str:
        if not self.hashtags:
            return self.text
        hashtags = " ".join(f"#{tag}" for tag in self.hashtags)
        return f"{self.text}\n\n{hashtags}"


class InstagramCredentials(BaseModel):
    instagram_user_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)
    graph_api_base_url: str = GRAPH_BASE_URL
    graph_api_version: str = GRAPH_VERSION
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS


def _build_input(image_url: str, text: str, hashtags: list[str] | str | None) -> InstagramPostInput:
    try:
        return InstagramPostInput(image_url=image_url, text=text, hashtags=hashtags)
    except ValidationError as exc:
        raise ValueError(exc.errors(include_url=False)) from exc


def _resolve_credentials(
    instagram_user_id: str | None,
    access_token: str | None,
    graph_api_version: str | None,
) -> InstagramCredentials:
    resolved_user_id = instagram_user_id or os.getenv("INSTAGRAM_USER_ID")
    resolved_access_token = access_token or os.getenv("INSTAGRAM_ACCESS_TOKEN")

    missing: list[str] = []
    if not resolved_user_id:
        missing.append("INSTAGRAM_USER_ID")
    if not resolved_access_token:
        missing.append("INSTAGRAM_ACCESS_TOKEN")

    if missing:
        raise ValueError(
            "Missing Instagram publishing credentials: "
            f"{', '.join(missing)}. Provide them as tool arguments or define them in mcp_server.env."
        )

    return InstagramCredentials(
        instagram_user_id=resolved_user_id,
        access_token=resolved_access_token,
        graph_api_base_url=os.getenv("INSTAGRAM_GRAPH_API_BASE_URL", GRAPH_BASE_URL),
        graph_api_version=graph_api_version or os.getenv("INSTAGRAM_GRAPH_API_VERSION", GRAPH_VERSION),
        timeout_seconds=float(
            os.getenv("INSTAGRAM_HTTP_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
        ),
    )


def _request_api(
    method: str,
    path: str,
    credentials: InstagramCredentials,
    *,
    data: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = (
        f"{credentials.graph_api_base_url.rstrip('/')}/"
        f"{credentials.graph_api_version.strip('/')}/"
        f"{path.lstrip('/')}"
    )

    request_params = dict(params or {})
    request_data = dict(data or {})

    if method.upper() == "GET":
        request_params["access_token"] = credentials.access_token
    else:
        request_data["access_token"] = credentials.access_token

    payload = request_json(
        method=method.upper(),
        url=url,
        timeout_seconds=credentials.timeout_seconds,
        request_error_context="Instagram Graph API request failed",
        parse_error_context="Instagram Graph API returned a non-JSON response",
        api_error_context="Instagram Graph API request failed",
        params=request_params or None,
        data=request_data or None,
    )

    if payload.get("error"):
        error = payload.get("error", {})
        raise PublisherError(
            "Instagram Graph API request failed: "
            f"code={error.get('code')}, subcode={error.get('error_subcode')}, message={error.get('message') or payload}"
        )

    return payload


def _wait_for_container(
    creation_id: str,
    credentials: InstagramCredentials,
    poll_attempts: int,
    poll_interval_seconds: float,
) -> dict[str, Any]:
    last_status = "UNKNOWN"

    for attempt in range(1, max(1, poll_attempts) + 1):
        payload = _request_api(
            "GET",
            creation_id,
            credentials,
            params={"fields": "status_code"},
        )
        status_code = str(payload.get("status_code", "UNKNOWN")).upper()
        last_status = status_code

        if status_code in {"FINISHED", "PUBLISHED"}:
            return {
                "ready": True,
                "checked_status": True,
                "attempts": attempt,
                "status_code": status_code,
            }

        if status_code in {"ERROR", "EXPIRED"}:
            raise PublisherError(
                f"Instagram media container {creation_id} is not publishable: {status_code}."
            )

        time.sleep(max(0.0, poll_interval_seconds))

    return {
        "ready": False,
        "checked_status": True,
        "attempts": max(1, poll_attempts),
        "status_code": last_status,
    }


def get_configuration_status() -> dict[str, Any]:
    return {
        "configured": bool(os.getenv("INSTAGRAM_USER_ID") and os.getenv("INSTAGRAM_ACCESS_TOKEN")),
        "required_env_vars": ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"],
        "optional_env_vars": [
            "INSTAGRAM_GRAPH_API_VERSION",
            "INSTAGRAM_GRAPH_API_BASE_URL",
            "INSTAGRAM_HTTP_TIMEOUT_SECONDS",
            "INSTAGRAM_PUBLISH_POLL_ATTEMPTS",
            "INSTAGRAM_PUBLISH_POLL_INTERVAL_SECONDS",
            "INSTAGRAM_IMAGE_PREFLIGHT_VALIDATE",
            "INSTAGRAM_IMAGE_DOWNLOAD_RETRY_ATTEMPTS",
            "INSTAGRAM_IMAGE_DOWNLOAD_RETRY_BASE_DELAY_SECONDS",
            "INSTAGRAM_IMAGE_DOWNLOAD_RETRY_MAX_DELAY_SECONDS",
        ],
        "defaults": {
            "INSTAGRAM_GRAPH_API_VERSION": GRAPH_VERSION,
            "INSTAGRAM_GRAPH_API_BASE_URL": GRAPH_BASE_URL,
            "INSTAGRAM_HTTP_TIMEOUT_SECONDS": DEFAULT_TIMEOUT_SECONDS,
            "INSTAGRAM_PUBLISH_POLL_ATTEMPTS": DEFAULT_POLL_ATTEMPTS,
            "INSTAGRAM_PUBLISH_POLL_INTERVAL_SECONDS": DEFAULT_POLL_INTERVAL_SECONDS,
            "INSTAGRAM_IMAGE_PREFLIGHT_VALIDATE": os.getenv(
                "INSTAGRAM_IMAGE_PREFLIGHT_VALIDATE", "true"
            ).strip().lower()
            in {"1", "true", "yes", "on"},
            "INSTAGRAM_IMAGE_DOWNLOAD_RETRY_ATTEMPTS": int(
                os.getenv("INSTAGRAM_IMAGE_DOWNLOAD_RETRY_ATTEMPTS", "4")
            ),
            "INSTAGRAM_IMAGE_DOWNLOAD_RETRY_BASE_DELAY_SECONDS": float(
                os.getenv("INSTAGRAM_IMAGE_DOWNLOAD_RETRY_BASE_DELAY_SECONDS", "0.5")
            ),
            "INSTAGRAM_IMAGE_DOWNLOAD_RETRY_MAX_DELAY_SECONDS": float(
                os.getenv("INSTAGRAM_IMAGE_DOWNLOAD_RETRY_MAX_DELAY_SECONDS", "4")
            ),
        },
    }


def publish(
    image_url: str,
    text: str,
    hashtags: list[str] | str | None = None,
    instagram_user_id: str | None = None,
    access_token: str | None = None,
    graph_api_version: str | None = None,
    poll_attempts: int = DEFAULT_POLL_ATTEMPTS,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    gcs_bucket: str | None = None,
    gcloud_service_key: str | None = None,
) -> dict[str, Any]:
    content = _build_input(image_url=image_url, text=text, hashtags=hashtags)
    credentials = _resolve_credentials(
        instagram_user_id=instagram_user_id,
        access_token=access_token,
        graph_api_version=graph_api_version,
    )

    # Universally load image bytes (handles relative /api/v1/content-studio/media/... paths, filenames, data URIs, or URLs)
    image_bytes, mime_type = load_image_bytes(
        content.image_url,
        timeout_seconds=credentials.timeout_seconds,
    )

    creation_id: str | None = None
    target_image_url: str | None = None

    # Step 1: If an external public URL is already provided, use it
    raw_str = str(content.image_url).strip()
    if (raw_str.startswith("http://") or raw_str.startswith("https://")) and not ("localhost" in raw_str or "127.0.0.1" in raw_str):
        target_image_url = raw_str

    # Step 2: If image is local / relative / base64, upload to GCS and generate a signed URL
    if not target_image_url and get_gcp_storage_adapter:
        try:
            storage_adapter = get_gcp_storage_adapter(
                bucket_name=gcs_bucket,
                service_key=gcloud_service_key,
            )
            if storage_adapter:
                ext = mime_type.split("/")[-1] if "/" in mime_type else "png"
                storage_key = f"instagram_posts/{uuid.uuid4().hex[:12]}.{ext}"
                storage_adapter.upload_file_with_key_sync(storage_key, image_bytes)
                # Generate a signed URL for Meta to download (expires in 24 hours)
                target_image_url = storage_adapter.get_file_url(storage_key, expiry_seconds=86400)
                LOGGER.info("Uploaded local image to GCS for Instagram publishing: %s", storage_key)
        except Exception as gcs_exc:
            LOGGER.warning("GCS storage upload/signing failed: %s", gcs_exc)

    # Step 3: Create Instagram media container via Meta Graph API
    if target_image_url:
        container = _request_api(
            "POST",
            f"{credentials.instagram_user_id}/media",
            credentials,
            data={"image_url": target_image_url, "caption": content.caption},
        )
        creation_id = container.get("id")
    else:
        # Fallback to signed proxy if enabled
        try:
            signed_url = resolve_provider_signed_image_url(
                image_url=str(content.image_url),
                timeout_seconds=credentials.timeout_seconds,
            )
            container = _request_api(
                "POST",
                f"{credentials.instagram_user_id}/media",
                credentials,
                data={"image_url": signed_url, "caption": content.caption},
            )
            creation_id = container.get("id")
        except Exception:
            raise PublisherError(
                "Instagram media container creation failed: Instagram Graph API requires a valid public image URL. "
                "Please configure GCLOUD_SERVICE_KEY and GCS_BUCKET (or GCP_STORAGE_BUCKET_NAME) in .env "
                "so local images can be automatically uploaded and signed for Meta."
            )

    if not creation_id:
        raise PublisherError("Instagram media creation failed: missing creation ID.")

    container_status = _wait_for_container(
        creation_id=creation_id,
        credentials=credentials,
        poll_attempts=max(1, poll_attempts),
        poll_interval_seconds=max(0.0, poll_interval_seconds),
    )

    published = _request_api(
        "POST",
        f"{credentials.instagram_user_id}/media_publish",
        credentials,
        data={"creation_id": creation_id},
    )

    return {
        "image_url": target_image_url or str(content.image_url),
        "text": content.text,
        "hashtags": content.hashtags,
        "caption": content.caption,
        "character_count": len(content.caption),
        "creation_id": creation_id,
        "container_status": container_status,
        "published_media_id": published.get("id"),
        "published": True,
    }

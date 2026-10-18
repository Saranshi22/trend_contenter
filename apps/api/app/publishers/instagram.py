"""Instagram Graph publishing module with resilient polling, Reels, Stories, and Video support."""

from __future__ import annotations

import logging
import os
import time
import uuid
from typing import Any, Optional

import requests
from pydantic import BaseModel, Field, ValidationError, field_validator

try:
    from .common import (
        PublisherError,
        RetryPolicy,
        download_remote_image,
        load_image_bytes,
        load_media_bytes,
        request_json,
        resolve_provider_signed_image_url,
    )
except ImportError:
    from publishers.common import (
        PublisherError,
        RetryPolicy,
        download_remote_image,
        load_image_bytes,
        load_media_bytes,
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
GRAPH_VERSION = os.getenv("INSTAGRAM_GRAPH_API_VERSION", "v25.0")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("INSTAGRAM_HTTP_TIMEOUT_SECONDS", "60"))
DEFAULT_VIDEO_TIMEOUT_SECONDS = int(os.getenv("INSTAGRAM_VIDEO_TIMEOUT_SECONDS", "300"))
DEFAULT_POLL_INTERVAL_SECONDS = float(os.getenv("INSTAGRAM_PUBLISH_POLL_INTERVAL_SECONDS", "5"))


class InstagramPublishInput(BaseModel):
    media_url: str = Field(min_length=1)
    target_format: str = Field(default="POST")  # "POST", "REEL", "STORY"
    media_type: str = Field(default="IMAGE")    # "IMAGE", "VIDEO"
    text: str = Field(default="", max_length=2200)
    hashtags: list[str] = Field(default_factory=list)
    share_to_feed: bool = Field(default=True)

    @field_validator("media_url", mode="before")
    @classmethod
    def normalize_media_url(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("target_format", mode="before")
    @classmethod
    def normalize_format(cls, value: Any) -> str:
        raw = str(value or "POST").strip().upper()
        if raw in {"REEL", "REELS"}:
            return "REEL"
        if raw in {"STORY", "STORIES"}:
            return "STORY"
        return "POST"

    @field_validator("media_type", mode="before")
    @classmethod
    def normalize_media_type(cls, value: Any) -> str:
        raw = str(value or "IMAGE").strip().upper()
        if "VIDEO" in raw:
            return "VIDEO"
        return "IMAGE"

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
        clean_text = self.text.strip()
        if not self.hashtags:
            return clean_text
        tags_str = " ".join(f"#{tag}" for tag in self.hashtags)
        if clean_text:
            return f"{clean_text}\n\n{tags_str}"
        return tags_str


# Backwards compatibility alias
InstagramPostInput = InstagramPublishInput


class InstagramCredentials(BaseModel):
    instagram_user_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)
    graph_api_base_url: str = GRAPH_BASE_URL
    graph_api_version: str = GRAPH_VERSION
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS


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
            f"{', '.join(missing)}. Provide them in the request or define them in your environment / .env file."
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


# ── Container Creation Helpers ──────────────────────────────────────────

def create_video_container(
    video_url: str,
    media_type: str,
    caption: str = "",
    share_to_feed: bool = True,
    credentials: Optional[InstagramCredentials] = None,
) -> str:
    """Create a Reel or Video Story container on Instagram Graph API."""
    norm_media_type = media_type.upper()
    if norm_media_type not in {"REELS", "STORIES"}:
        raise ValueError("media_type must be REELS or STORIES for video containers")

    creds = credentials or _resolve_credentials(None, None, None)
    data: dict[str, Any] = {
        "media_type": norm_media_type,
        "video_url": video_url,
    }

    if norm_media_type == "REELS":
        if caption:
            data["caption"] = caption
        data["share_to_feed"] = str(share_to_feed).lower()

    result = _request_api("POST", f"{creds.instagram_user_id}/media", creds, data=data)
    container_id = result.get("id")
    if not container_id:
        raise PublisherError(f"Video container creation failed: missing id in response {result}")
    return container_id


def create_image_container(
    image_url: str,
    media_type: str = "IMAGE",
    caption: str = "",
    credentials: Optional[InstagramCredentials] = None,
) -> str:
    """Create an Image Post or Image Story container on Instagram Graph API."""
    creds = credentials or _resolve_credentials(None, None, None)
    norm_media_type = media_type.upper()

    data: dict[str, Any] = {
        "image_url": image_url,
    }

    if norm_media_type in {"STORIES", "STORY"}:
        data["media_type"] = "STORIES"
        # Note: Instagram Graph API does not support captions on Stories
    else:
        if caption:
            data["caption"] = caption

    result = _request_api("POST", f"{creds.instagram_user_id}/media", creds, data=data)
    container_id = result.get("id")
    if not container_id:
        raise PublisherError(f"Image container creation failed: missing id in response {result}")
    return container_id


def wait_until_ready(
    container_id: str,
    credentials: Optional[InstagramCredentials] = None,
    timeout_seconds: int = DEFAULT_VIDEO_TIMEOUT_SECONDS,
    poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
) -> dict[str, Any]:
    """Polls until Instagram finishes processing the media container (video transcoding / image ingest)."""
    creds = credentials or _resolve_credentials(None, None, None)
    deadline = time.monotonic() + max(10, timeout_seconds)
    attempts = 0
    last_status = "UNKNOWN"

    while time.monotonic() < deadline:
        attempts += 1
        payload = _request_api(
            "GET",
            container_id,
            creds,
            params={"fields": "status_code,status"},
        )

        status_code = str(payload.get("status_code", "UNKNOWN")).upper()
        last_status = status_code
        LOGGER.info("Instagram container %s status: %s (attempt %d)", container_id, status_code, attempts)

        if status_code in {"FINISHED", "PUBLISHED"}:
            return {
                "ready": True,
                "checked_status": True,
                "attempts": attempts,
                "status_code": status_code,
            }

        if status_code in {"ERROR", "EXPIRED"}:
            raise PublisherError(
                f"Instagram media processing failed for container {container_id}: {payload}"
            )

        time.sleep(max(1.0, poll_interval))

    raise TimeoutError(
        f"Media container processing timed out after {timeout_seconds}s: {container_id} (last status: {last_status})"
    )


def publish_container(
    container_id: str,
    credentials: Optional[InstagramCredentials] = None,
) -> str:
    """Publish a processed media container to Instagram."""
    creds = credentials or _resolve_credentials(None, None, None)
    result = _request_api(
        "POST",
        f"{creds.instagram_user_id}/media_publish",
        creds,
        data={"creation_id": container_id},
    )
    published_id = result.get("id")
    if not published_id:
        raise PublisherError(f"Media publishing failed: missing published id in response {result}")
    return published_id


# ── High-Level Publish Methods ──────────────────────────────────────────

def publish_reel(
    video_url: str,
    caption: str = "",
    share_to_feed: bool = True,
    instagram_user_id: Optional[str] = None,
    access_token: Optional[str] = None,
    graph_api_version: Optional[str] = None,
    timeout_seconds: int = DEFAULT_VIDEO_TIMEOUT_SECONDS,
    poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
) -> str:
    """Publishes a video Reel, optionally sharing it to the profile feed."""
    creds = _resolve_credentials(instagram_user_id, access_token, graph_api_version)
    container_id = create_video_container(
        video_url=video_url,
        media_type="REELS",
        caption=caption,
        share_to_feed=share_to_feed,
        credentials=creds,
    )
    LOGGER.info("Created Instagram Reel container: %s", container_id)

    wait_until_ready(container_id, credentials=creds, timeout_seconds=timeout_seconds, poll_interval=poll_interval)
    media_id = publish_container(container_id, credentials=creds)
    LOGGER.info("Instagram Reel published successfully. Media ID: %s", media_id)
    return media_id


def publish_story(
    media_url: str,
    is_video: bool = False,
    instagram_user_id: Optional[str] = None,
    access_token: Optional[str] = None,
    graph_api_version: Optional[str] = None,
    timeout_seconds: int = DEFAULT_VIDEO_TIMEOUT_SECONDS,
    poll_interval: float = DEFAULT_POLL_INTERVAL_SECONDS,
) -> str:
    """Publishes an image or video Story to Instagram."""
    creds = _resolve_credentials(instagram_user_id, access_token, graph_api_version)

    if is_video:
        container_id = create_video_container(
            video_url=media_url,
            media_type="STORIES",
            credentials=creds,
        )
    else:
        container_id = create_image_container(
            image_url=media_url,
            media_type="STORIES",
            credentials=creds,
        )
    LOGGER.info("Created Instagram Story container: %s (is_video=%s)", container_id, is_video)

    wait_until_ready(
        container_id,
        credentials=creds,
        timeout_seconds=timeout_seconds if is_video else 60,
        poll_interval=poll_interval if is_video else 2.0,
    )
    media_id = publish_container(container_id, credentials=creds)
    LOGGER.info("Instagram Story published successfully. Media ID: %s", media_id)
    return media_id


# ── Unified Publish Entrypoint ──────────────────────────────────────────

def publish(
    image_url: Optional[str] = None,
    video_url: Optional[str] = None,
    media_url: Optional[str] = None,
    text: str = "",
    hashtags: list[str] | str | None = None,
    target_format: str = "POST",     # "POST", "REEL", or "STORY"
    media_type: Optional[str] = None, # "IMAGE" or "VIDEO" (auto-detected if None)
    share_to_feed: bool = True,
    instagram_user_id: str | None = None,
    access_token: str | None = None,
    graph_api_version: str | None = None,
    poll_attempts: int = 5,
    poll_interval_seconds: float = DEFAULT_POLL_INTERVAL_SECONDS,
    timeout_seconds: int = DEFAULT_VIDEO_TIMEOUT_SECONDS,
    gcs_bucket: str | None = None,
    gcloud_service_key: str | None = None,
) -> dict[str, Any]:
    """
    Unified Instagram Publisher:
    - Publishes Images as Feed Posts or Stories
    - Publishes Videos as Reels (with share_to_feed option) or Stories
    - Automatically uploads local/relative media to GCS to generate public signed URLs
    - Resiliently polls container processing until FINISHED and publishes container.
    """
    raw_source = media_url or video_url or image_url or ""
    if not raw_source:
        raise ValueError("Must provide media_url, video_url, or image_url to publish.")

    content = InstagramPublishInput(
        media_url=raw_source,
        target_format=target_format,
        media_type=media_type or "IMAGE",
        text=text,
        hashtags=hashtags,
        share_to_feed=share_to_feed,
    )

    credentials = _resolve_credentials(
        instagram_user_id=instagram_user_id,
        access_token=access_token,
        graph_api_version=graph_api_version,
    )

    # 1. Universally load media bytes (supports local filesystem, /media/ endpoints, URLs, data URIs)
    media_bytes, mime_type, detected_kind = load_media_bytes(
        content.media_url,
        timeout_seconds=credentials.timeout_seconds,
    )

    # Resolve active media type: explicitly specified or auto-detected
    is_video = (media_type and "VIDEO" in media_type.upper()) or (detected_kind == "video")
    active_media_type = "VIDEO" if is_video else "IMAGE"

    # Normalize format: Videos intended for feed are modern Reels
    active_format = content.target_format
    if is_video and active_format == "POST":
        active_format = "REEL"

    LOGGER.info(
        "Publishing to Instagram: format=%s, type=%s, size=%d bytes, mime=%s",
        active_format,
        active_media_type,
        len(media_bytes),
        mime_type,
    )

    # 2. Check if media URL is already an external public URL
    target_public_url: Optional[str] = None
    raw_str = content.media_url.strip()
    if (raw_str.startswith("http://") or raw_str.startswith("https://")) and not ("localhost" in raw_str or "127.0.0.1" in raw_str):
        target_public_url = raw_str

    # 3. Upload to GCS and generate a signed URL if local / relative / base64
    if not target_public_url and get_gcp_storage_adapter:
        try:
            storage_adapter = get_gcp_storage_adapter(
                bucket_name=gcs_bucket,
                service_key=gcloud_service_key,
            )
            if storage_adapter:
                ext = mime_type.split("/")[-1].split("+")[0] if "/" in mime_type else ("mp4" if is_video else "png")
                prefix = "instagram_reels" if (is_video and active_format == "REEL") else ("instagram_stories" if active_format == "STORY" else "instagram_posts")
                storage_key = f"{prefix}/{uuid.uuid4().hex[:12]}.{ext}"
                storage_adapter.upload_file_with_key_sync(storage_key, media_bytes)
                # Generate signed URL for Meta servers (valid for 24 hours)
                target_public_url = storage_adapter.get_file_url(storage_key, expiry_seconds=86400)
                LOGGER.info("Uploaded %s to GCS for Instagram publishing: %s", active_media_type, storage_key)
        except Exception as gcs_exc:
            LOGGER.warning("GCS storage upload/signing failed: %s", gcs_exc)

    if not target_public_url:
        # Fallback to signed proxy if enabled
        try:
            target_public_url = resolve_provider_signed_image_url(
                image_url=content.media_url,
                timeout_seconds=credentials.timeout_seconds,
            )
        except Exception:
            raise PublisherError(
                "Instagram media container creation failed: Instagram Graph API requires a valid public URL. "
                "Please configure GCLOUD_SERVICE_KEY and GCS_BUCKET in your environment/.env file "
                "so local media assets can be automatically uploaded and signed for Meta."
            )

    # 4. Create appropriate media container
    creation_id: str
    if is_video:
        if active_format == "STORY":
            creation_id = create_video_container(
                video_url=target_public_url,
                media_type="STORIES",
                credentials=credentials,
            )
        else:  # REEL
            creation_id = create_video_container(
                video_url=target_public_url,
                media_type="REELS",
                caption=content.caption,
                share_to_feed=content.share_to_feed,
                credentials=credentials,
            )
    else:  # IMAGE
        if active_format == "STORY":
            creation_id = create_image_container(
                image_url=target_public_url,
                media_type="STORIES",
                credentials=credentials,
            )
        else:  # POST (Feed)
            creation_id = create_image_container(
                image_url=target_public_url,
                media_type="IMAGE",
                caption=content.caption,
                credentials=credentials,
            )

    # 5. Wait until ready
    wait_timeout = timeout_seconds if is_video else 60
    poll_int = poll_interval_seconds if is_video else 2.0
    container_status = wait_until_ready(
        container_id=creation_id,
        credentials=credentials,
        timeout_seconds=wait_timeout,
        poll_interval=poll_int,
    )

    # 6. Publish container
    published_id = publish_container(container_id=creation_id, credentials=credentials)

    return {
        "media_url": target_public_url or content.media_url,
        "image_url": target_public_url or content.media_url,
        "video_url": target_public_url if is_video else None,
        "target_format": active_format,
        "media_type": active_media_type,
        "share_to_feed": content.share_to_feed if active_format == "REEL" else None,
        "text": content.text,
        "hashtags": content.hashtags,
        "caption": content.caption,
        "character_count": len(content.caption),
        "creation_id": creation_id,
        "container_status": container_status,
        "published_media_id": published_id,
        "published": True,
    }


def get_configuration_status() -> dict[str, Any]:
    return {
        "configured": bool(os.getenv("INSTAGRAM_USER_ID") and os.getenv("INSTAGRAM_ACCESS_TOKEN")),
        "required_env_vars": ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"],
        "optional_env_vars": [
            "INSTAGRAM_GRAPH_API_VERSION",
            "INSTAGRAM_GRAPH_API_BASE_URL",
            "INSTAGRAM_HTTP_TIMEOUT_SECONDS",
            "INSTAGRAM_VIDEO_TIMEOUT_SECONDS",
            "INSTAGRAM_PUBLISH_POLL_INTERVAL_SECONDS",
            "GCS_BUCKET",
            "GCLOUD_SERVICE_KEY",
        ],
        "defaults": {
            "INSTAGRAM_GRAPH_API_VERSION": GRAPH_VERSION,
            "INSTAGRAM_GRAPH_API_BASE_URL": GRAPH_BASE_URL,
            "INSTAGRAM_HTTP_TIMEOUT_SECONDS": DEFAULT_TIMEOUT_SECONDS,
            "INSTAGRAM_VIDEO_TIMEOUT_SECONDS": DEFAULT_VIDEO_TIMEOUT_SECONDS,
            "INSTAGRAM_PUBLISH_POLL_INTERVAL_SECONDS": DEFAULT_POLL_INTERVAL_SECONDS,
        },
    }

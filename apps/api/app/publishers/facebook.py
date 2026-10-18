"""Facebook Page publishing module with robust Graph API interactions for Photos, Video Posts, and Reels."""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
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

GRAPH_BASE_URL = os.getenv("FACEBOOK_GRAPH_API_BASE_URL", "https://graph.facebook.com")
GRAPH_VERSION = os.getenv("FACEBOOK_GRAPH_API_VERSION", "v26.0")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("FACEBOOK_HTTP_TIMEOUT_SECONDS", "60"))


class FacebookPublishInput(BaseModel):
    media_url: str = Field(min_length=1)
    target_format: str = Field(default="POST")  # "POST" (Feed) or "REEL"
    media_type: str = Field(default="IMAGE")    # "IMAGE" or "VIDEO"
    title: Optional[str] = Field(default="", max_length=255)
    text: str = Field(default="", max_length=63206)
    hashtags: list[str] = Field(default_factory=list)
    scheduled_at: Optional[datetime | str] = None

    @field_validator("media_url", mode="before")
    @classmethod
    def normalize_media_url(cls, value: Any) -> Any:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("target_format", mode="before")
    @classmethod
    def normalize_target_format(cls, value: Any) -> str:
        raw = str(value or "POST").strip().upper()
        if raw in {"REEL", "REELS"}:
            return "REEL"
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
    def message(self) -> str:
        clean_text = self.text.strip()
        if not self.hashtags:
            return clean_text
        tags_str = " ".join(f"#{tag}" for tag in self.hashtags)
        if clean_text:
            return f"{clean_text}\n\n{tags_str}"
        return tags_str


# Backward compatibility alias
FacebookPostInput = FacebookPublishInput


class FacebookCredentials(BaseModel):
    page_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)
    graph_api_base_url: str = GRAPH_BASE_URL
    graph_api_version: str = GRAPH_VERSION
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS


def _resolve_credentials(
    page_id: str | None,
    access_token: str | None,
    graph_api_version: str | None,
) -> FacebookCredentials:
    resolved_page_id = page_id or os.getenv("FACEBOOK_PAGE_ID")
    resolved_access_token = access_token or os.getenv("FACEBOOK_ACCESS_TOKEN") or os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN")

    missing: list[str] = []
    if not resolved_page_id:
        missing.append("FACEBOOK_PAGE_ID")
    if not resolved_access_token:
        missing.append("FACEBOOK_PAGE_ACCESS_TOKEN / FACEBOOK_ACCESS_TOKEN")

    if missing:
        raise ValueError(
            "Missing Facebook Page publishing credentials: "
            f"{', '.join(missing)}. Provide them in the request or define them in your environment/.env file."
        )

    return FacebookCredentials(
        page_id=resolved_page_id,
        access_token=resolved_access_token,
        graph_api_base_url=os.getenv("FACEBOOK_GRAPH_API_BASE_URL", GRAPH_BASE_URL),
        graph_api_version=graph_api_version or os.getenv("FACEBOOK_GRAPH_API_VERSION", GRAPH_VERSION),
        timeout_seconds=float(os.getenv("FACEBOOK_HTTP_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))),
    )


def _request_api(
    method: str,
    path: str,
    credentials: FacebookCredentials,
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
        request_error_context="Facebook Graph API request failed",
        parse_error_context="Facebook Graph API returned a non-JSON response",
        api_error_context="Facebook Graph API request failed",
        params=request_params or None,
        data=request_data or None,
    )

    if payload.get("error"):
        error = payload.get("error", {})
        raise PublisherError(
            "Facebook Graph API request failed: "
            f"code={error.get('code')}, subcode={error.get('error_subcode')}, message={error.get('message') or payload}"
        )

    return payload


# ── Standalone Video Post & Reels Methods (Reference Specification) ────

def publish_facebook_video_post(
    video_path: str,
    caption: str,
    title: str = "",
    scheduled_at: datetime | str | None = None,
    page_id: Optional[str] = None,
    access_token: Optional[str] = None,
    graph_api_version: Optional[str] = None,
) -> str:
    """
    Publish a video as a regular Facebook Page feed post.
    scheduled_at: Optional timezone-aware datetime or ISO string,
    at least 10 minutes and no more than 6 months in the future.
    """
    creds = _resolve_credentials(page_id, access_token, graph_api_version)
    base_url = f"{creds.graph_api_base_url.rstrip('/')}/{creds.graph_api_version.strip('/')}"
    endpoint = f"{base_url}/{creds.page_id}/videos"

    data: dict[str, Any] = {
        "access_token": creds.access_token,
        "description": caption,
        "published": "true",
    }

    if title:
        data["title"] = title

    if scheduled_at is not None:
        if isinstance(scheduled_at, str):
            try:
                scheduled_dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
            except Exception as e:
                raise ValueError(f"Invalid scheduled_at ISO format: {e}")
        else:
            scheduled_dt = scheduled_at

        if scheduled_dt.tzinfo is None:
            raise ValueError("scheduled_at must be timezone-aware")

        scheduled_utc = scheduled_dt.astimezone(timezone.utc)
        now = datetime.now(timezone.utc)

        if not (now + timedelta(minutes=10) <= scheduled_utc <= now + timedelta(days=180)):
            raise ValueError("Scheduled time must be 10 minutes to 6 months ahead")

        data["published"] = "false"
        data["scheduled_publish_time"] = str(int(scheduled_utc.timestamp()))

    # Universally load video bytes
    video_bytes, mime_type, _ = load_media_bytes(video_path, timeout_seconds=creds.timeout_seconds)

    # Check if a public URL is already provided, or upload to GCS for signed URL
    target_public_url: Optional[str] = None
    raw_str = str(video_path or "").strip()
    if (raw_str.startswith("http://") or raw_str.startswith("https://")) and not ("localhost" in raw_str or "127.0.0.1" in raw_str):
        target_public_url = raw_str

    if not target_public_url and get_gcp_storage_adapter:
        try:
            storage_adapter = get_gcp_storage_adapter(bucket_name=gcs_bucket, service_key=gcloud_service_key)
            if storage_adapter:
                ext = mime_type.split("/")[-1].split("+")[0] if "/" in mime_type else "mp4"
                storage_key = f"facebook_videos/{uuid.uuid4().hex[:12]}.{ext}"
                storage_adapter.upload_file_with_key_sync(storage_key, video_bytes)
                target_public_url = storage_adapter.get_file_url(storage_key, expiry_seconds=86400)
                LOGGER.info("Uploaded video to GCS for Facebook video post: %s", storage_key)
        except Exception as e:
            LOGGER.warning("GCS upload for Facebook video post failed: %s", e)

    if target_public_url:
        data["file_url"] = target_public_url
        response = requests.post(
            endpoint,
            data=data,
            timeout=(30, 600),
        )
    else:
        files = {
            "source": ("video.mp4", video_bytes, mime_type),
        }
        response = requests.post(
            endpoint,
            data=data,
            files=files,
            timeout=(30, 600),
        )

    try:
        result = response.json()
    except Exception:
        result = {"raw": response.text}

    if not response.ok or "error" in result:
        raise PublisherError(f"Facebook video post publishing failed: {result}")

    video_id = result.get("id")
    if not video_id:
        raise PublisherError(f"Facebook video post missing id in response: {result}")

    LOGGER.info("Facebook Video post created successfully: %s", video_id)
    return video_id


def publish_facebook_reel(
    video_url: str,
    description: str,
    title: str = "",
    page_id: Optional[str] = None,
    access_token: Optional[str] = None,
    graph_api_version: Optional[str] = None,
    gcs_bucket: Optional[str] = None,
    gcloud_service_key: Optional[str] = None,
) -> str:
    """
    Publish a video as a Facebook Page Reel using the 3-step Resumable Video Reels API.
    """
    creds = _resolve_credentials(page_id, access_token, graph_api_version)
    base_url = f"{creds.graph_api_base_url.rstrip('/')}/{creds.graph_api_version.strip('/')}"

    # Step 1: Initialize upload
    start_resp = requests.post(
        f"{base_url}/{creds.page_id}/video_reels",
        params={
            "upload_phase": "start",
            "access_token": creds.access_token,
        },
        timeout=60,
    )
    start_resp.raise_for_status()
    session = start_resp.json()

    if "error" in session:
        raise PublisherError(f"Facebook Reel initialize failed: {session['error']}")

    video_id = session.get("video_id")
    upload_url = session.get("upload_url")
    if not video_id or not upload_url:
        raise PublisherError(f"Facebook Reel start response missing video_id or upload_url: {session}")

    LOGGER.info("Initialized Facebook Reel session: video_id=%s", video_id)

    # Resolve video URL for Meta: if local/relative, upload to GCS and get signed URL
    target_public_url: Optional[str] = None
    raw_str = str(video_url or "").strip()
    if (raw_str.startswith("http://") or raw_str.startswith("https://")) and not ("localhost" in raw_str or "127.0.0.1" in raw_str):
        target_public_url = raw_str

    if not target_public_url and get_gcp_storage_adapter:
        try:
            video_bytes, mime_type, _ = load_media_bytes(video_url, timeout_seconds=creds.timeout_seconds)
            storage_adapter = get_gcp_storage_adapter(bucket_name=gcs_bucket, service_key=gcloud_service_key)
            if storage_adapter:
                ext = mime_type.split("/")[-1].split("+")[0] if "/" in mime_type else "mp4"
                storage_key = f"facebook_reels/{uuid.uuid4().hex[:12]}.{ext}"
                storage_adapter.upload_file_with_key_sync(storage_key, video_bytes)
                target_public_url = storage_adapter.get_file_url(storage_key, expiry_seconds=86400)
                LOGGER.info("Uploaded local video to GCS for Facebook Reel: %s", storage_key)
        except Exception as e:
            LOGGER.warning("GCS storage upload for Facebook Reel failed: %s", e)

    # Step 2: Upload video to upload_url
    if target_public_url:
        # Use file_url header
        upload_resp = requests.post(
            upload_url,
            headers={
                "Authorization": f"OAuth {creds.access_token}",
                "file_url": target_public_url,
            },
            timeout=600,
        )
    else:
        # Direct binary stream upload
        video_bytes, mime_type, _ = load_media_bytes(video_url, timeout_seconds=creds.timeout_seconds)
        upload_resp = requests.post(
            upload_url,
            headers={
                "Authorization": f"OAuth {creds.access_token}",
                "offset": "0",
                "file_size": str(len(video_bytes)),
                "Content-Type": mime_type or "application/octet-stream",
            },
            data=video_bytes,
            timeout=600,
        )

    upload_resp.raise_for_status()
    LOGGER.info("Completed Facebook Reel upload phase for video_id=%s", video_id)

    # Step 3: Finish and Publish Reel
    finish_params: dict[str, Any] = {
        "video_id": video_id,
        "upload_phase": "finish",
        "video_state": "PUBLISHED",
        "description": description,
        "access_token": creds.access_token,
    }
    if title:
        finish_params["title"] = title

    finish_resp = requests.post(
        f"{base_url}/{creds.page_id}/video_reels",
        params=finish_params,
        timeout=60,
    )
    finish_resp.raise_for_status()
    finish_result = finish_resp.json()

    if finish_result.get("success") is not True:
        raise PublisherError(f"Facebook Reel publishing failed: {finish_result}")

    LOGGER.info("Facebook Reel published successfully: %s", video_id)
    return video_id


# ── Unified Publish Entrypoint ──────────────────────────────────────────

def publish(
    image_url: Optional[str] = None,
    video_url: Optional[str] = None,
    media_url: Optional[str] = None,
    target_format: str = "POST",      # "POST" or "REEL"
    media_type: Optional[str] = None, # "IMAGE" or "VIDEO"
    title: Optional[str] = None,
    text: str = "",
    hashtags: list[str] | str | None = None,
    scheduled_at: Optional[datetime | str] = None,
    page_id: str | None = None,
    access_token: str | None = None,
    graph_api_version: str | None = None,
    gcs_bucket: str | None = None,
    gcloud_service_key: str | None = None,
) -> dict[str, Any]:
    """
    Unified Facebook Page Publisher:
    - Publishes Photos as Page feed posts
    - Publishes Videos as Page feed video posts (with optional scheduling)
    - Publishes Videos as Facebook Reels using the 3-step Resumable API
    """
    raw_source = media_url or video_url or image_url or ""
    if not raw_source:
        raise ValueError("Must provide media_url, video_url, or image_url to publish to Facebook.")

    content = FacebookPublishInput(
        media_url=raw_source,
        target_format=target_format,
        media_type=media_type or "IMAGE",
        title=title or "",
        text=text,
        hashtags=hashtags,
        scheduled_at=scheduled_at,
    )

    credentials = _resolve_credentials(
        page_id=page_id,
        access_token=access_token,
        graph_api_version=graph_api_version,
    )

    # Detect media type from extension / magic bytes if not explicitly provided
    media_bytes, mime_type, detected_kind = load_media_bytes(
        content.media_url,
        timeout_seconds=credentials.timeout_seconds,
    )
    is_video = (media_type and "VIDEO" in media_type.upper()) or (detected_kind == "video")
    active_media_type = "VIDEO" if is_video else "IMAGE"
    active_format = content.target_format

    LOGGER.info(
        "Publishing to Facebook Page: format=%s, type=%s, size=%d bytes, title=%s",
        active_format,
        active_media_type,
        len(media_bytes),
        content.title,
    )

    # 1. CASE: FACEBOOK REEL
    if active_format == "REEL" or (is_video and "REEL" in active_format):
        video_id = publish_facebook_reel(
            video_url=content.media_url,
            description=content.message,
            title=content.title or "",
            page_id=credentials.page_id,
            access_token=credentials.access_token,
            graph_api_version=credentials.graph_api_version,
            gcs_bucket=gcs_bucket,
            gcloud_service_key=gcloud_service_key,
        )
        return {
            "page_id": credentials.page_id,
            "media_url": str(content.media_url),
            "target_format": "REEL",
            "media_type": "VIDEO",
            "title": content.title,
            "text": content.text,
            "hashtags": content.hashtags,
            "message": content.message,
            "character_count": len(content.message),
            "video_id": video_id,
            "post_id": video_id,
            "published": True,
        }

    # 2. CASE: VIDEO FEED POST
    if is_video:
        video_id = publish_facebook_video_post(
            video_path=content.media_url,
            caption=content.message,
            title=content.title or "",
            scheduled_at=content.scheduled_at,
            page_id=credentials.page_id,
            access_token=credentials.access_token,
            graph_api_version=credentials.graph_api_version,
        )
        return {
            "page_id": credentials.page_id,
            "media_url": str(content.media_url),
            "target_format": "POST",
            "media_type": "VIDEO",
            "title": content.title,
            "text": content.text,
            "hashtags": content.hashtags,
            "message": content.message,
            "character_count": len(content.message),
            "video_id": video_id,
            "post_id": video_id,
            "published": True,
        }

    # 3. CASE: PHOTO FEED POST
    url = (
        f"{credentials.graph_api_base_url.rstrip('/')}/"
        f"{credentials.graph_api_version.strip('/')}/"
        f"{credentials.page_id}/photos"
    )
    request_data = {
        "caption": content.message,
        "published": "true",
        "access_token": credentials.access_token,
    }

    # Resolve public GCS URL if local
    target_public_url = None
    raw_str = str(content.media_url or "").strip()
    if (raw_str.startswith("http://") or raw_str.startswith("https://")) and not ("localhost" in raw_str or "127.0.0.1" in raw_str):
        target_public_url = raw_str

    if not target_public_url and get_gcp_storage_adapter:
        try:
            storage_adapter = get_gcp_storage_adapter(bucket_name=gcs_bucket, service_key=gcloud_service_key)
            if storage_adapter:
                ext = mime_type.split("/")[-1].split("+")[0] if "/" in mime_type else "png"
                storage_key = f"facebook_photos/{uuid.uuid4().hex[:12]}.{ext}"
                storage_adapter.upload_file_with_key_sync(storage_key, media_bytes)
                target_public_url = storage_adapter.get_file_url(storage_key, expiry_seconds=86400)
                LOGGER.info("Uploaded photo to GCS for Facebook photo post: %s", storage_key)
        except Exception as e:
            LOGGER.warning("GCS upload for Facebook photo post failed: %s", e)

    try:
        if target_public_url:
            request_data["url"] = target_public_url
            response = requests.post(
                url=url,
                data=request_data,
                timeout=credentials.timeout_seconds,
            )
        else:
            files = {
                "source": ("image.png", media_bytes, mime_type),
            }
            response = requests.post(
                url=url,
                data=request_data,
                files=files,
                timeout=credentials.timeout_seconds,
            )
        try:
            published = response.json()
        except Exception:
            published = {"raw": response.text}

        if response.status_code >= 400 or published.get("error"):
            error = published.get("error", {})
            raise PublisherError(
                "Facebook Graph API request failed: "
                f"code={error.get('code')}, subcode={error.get('error_subcode')}, message={error.get('message') or published}"
            )
    except PublisherError:
        raise
    except Exception as exc:
        raise PublisherError(f"Facebook Graph API photo upload failed: {exc}") from exc

    return {
        "page_id": credentials.page_id,
        "media_url": str(content.media_url),
        "target_format": "POST",
        "media_type": "IMAGE",
        "text": content.text,
        "hashtags": content.hashtags,
        "message": content.message,
        "character_count": len(content.message),
        "post_id": published.get("post_id"),
        "photo_id": published.get("id"),
        "published": True,
    }


def get_configuration_status() -> dict[str, Any]:
    return {
        "configured": bool(os.getenv("FACEBOOK_PAGE_ID") and (os.getenv("FACEBOOK_ACCESS_TOKEN") or os.getenv("FACEBOOK_PAGE_ACCESS_TOKEN"))),
        "required_env_vars": ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"],
        "optional_env_vars": [
            "FACEBOOK_GRAPH_API_VERSION",
            "FACEBOOK_GRAPH_API_BASE_URL",
            "FACEBOOK_HTTP_TIMEOUT_SECONDS",
            "GCS_BUCKET",
            "GCLOUD_SERVICE_KEY",
        ],
        "defaults": {
            "FACEBOOK_GRAPH_API_VERSION": GRAPH_VERSION,
            "FACEBOOK_GRAPH_API_BASE_URL": GRAPH_BASE_URL,
            "FACEBOOK_HTTP_TIMEOUT_SECONDS": DEFAULT_TIMEOUT_SECONDS,
        },
    }

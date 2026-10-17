"""Facebook Page publishing module with robust Graph API interactions."""

from __future__ import annotations

import os
import requests
from typing import Any

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

GRAPH_BASE_URL = os.getenv("FACEBOOK_GRAPH_API_BASE_URL", "https://graph.facebook.com")
GRAPH_VERSION = os.getenv("FACEBOOK_GRAPH_API_VERSION", "v22.0")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("FACEBOOK_HTTP_TIMEOUT_SECONDS", "30"))


class FacebookPostInput(BaseModel):
    image_url: str = Field(min_length=1)
    text: str = Field(min_length=1, max_length=63206)
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
    def message(self) -> str:
        if not self.hashtags:
            return self.text
        hashtags = " ".join(f"#{tag}" for tag in self.hashtags)
        return f"{self.text}\n\n{hashtags}"


class FacebookCredentials(BaseModel):
    page_id: str = Field(min_length=1)
    access_token: str = Field(min_length=1)
    graph_api_base_url: str = GRAPH_BASE_URL
    graph_api_version: str = GRAPH_VERSION
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS


def _build_input(image_url: str, text: str, hashtags: list[str] | str | None) -> FacebookPostInput:
    try:
        return FacebookPostInput(image_url=image_url, text=text, hashtags=hashtags)
    except ValidationError as exc:
        raise ValueError(exc.errors(include_url=False)) from exc


def _resolve_credentials(
    page_id: str | None,
    access_token: str | None,
    graph_api_version: str | None,
) -> FacebookCredentials:
    resolved_page_id = page_id or os.getenv("FACEBOOK_PAGE_ID")
    resolved_access_token = access_token or os.getenv("FACEBOOK_ACCESS_TOKEN")

    missing: list[str] = []
    if not resolved_page_id:
        missing.append("FACEBOOK_PAGE_ID")
    if not resolved_access_token:
        missing.append("FACEBOOK_ACCESS_TOKEN")

    if missing:
        raise ValueError(
            "Missing Facebook publishing credentials: "
            f"{', '.join(missing)}. Provide them as tool arguments or define them in mcp_server.env."
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


def get_configuration_status() -> dict[str, Any]:
    return {
        "configured": bool(os.getenv("FACEBOOK_PAGE_ID") and os.getenv("FACEBOOK_ACCESS_TOKEN")),
        "required_env_vars": ["FACEBOOK_PAGE_ID", "FACEBOOK_ACCESS_TOKEN"],
        "optional_env_vars": [
            "FACEBOOK_GRAPH_API_VERSION",
            "FACEBOOK_GRAPH_API_BASE_URL",
            "FACEBOOK_HTTP_TIMEOUT_SECONDS",
            "FACEBOOK_IMAGE_PREFLIGHT_VALIDATE",
            "FACEBOOK_IMAGE_DOWNLOAD_RETRY_ATTEMPTS",
            "FACEBOOK_IMAGE_DOWNLOAD_RETRY_BASE_DELAY_SECONDS",
            "FACEBOOK_IMAGE_DOWNLOAD_RETRY_MAX_DELAY_SECONDS",
        ],
        "defaults": {
            "FACEBOOK_GRAPH_API_VERSION": GRAPH_VERSION,
            "FACEBOOK_GRAPH_API_BASE_URL": GRAPH_BASE_URL,
            "FACEBOOK_HTTP_TIMEOUT_SECONDS": DEFAULT_TIMEOUT_SECONDS,
            "FACEBOOK_IMAGE_PREFLIGHT_VALIDATE": os.getenv(
                "FACEBOOK_IMAGE_PREFLIGHT_VALIDATE", "true"
            ).strip().lower()
            in {"1", "true", "yes", "on"},
            "FACEBOOK_IMAGE_DOWNLOAD_RETRY_ATTEMPTS": int(
                os.getenv("FACEBOOK_IMAGE_DOWNLOAD_RETRY_ATTEMPTS", "4")
            ),
            "FACEBOOK_IMAGE_DOWNLOAD_RETRY_BASE_DELAY_SECONDS": float(
                os.getenv("FACEBOOK_IMAGE_DOWNLOAD_RETRY_BASE_DELAY_SECONDS", "0.5")
            ),
            "FACEBOOK_IMAGE_DOWNLOAD_RETRY_MAX_DELAY_SECONDS": float(
                os.getenv("FACEBOOK_IMAGE_DOWNLOAD_RETRY_MAX_DELAY_SECONDS", "4")
            ),
        },
    }


def publish(
    image_url: str,
    text: str,
    hashtags: list[str] | str | None = None,
    page_id: str | None = None,
    access_token: str | None = None,
    graph_api_version: str | None = None,
) -> dict[str, Any]:
    content = _build_input(image_url=image_url, text=text, hashtags=hashtags)
    credentials = _resolve_credentials(
        page_id=page_id,
        access_token=access_token,
        graph_api_version=graph_api_version,
    )

    # Load image binary directly (supports local media paths, data URIs, or remote URLs)
    image_bytes, mime_type = load_image_bytes(
        content.image_url,
        timeout_seconds=credentials.timeout_seconds,
    )

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
    files = {
        "source": ("image.png", image_bytes, mime_type),
    }

    try:
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
        "image_url": str(content.image_url),
        "text": content.text,
        "hashtags": content.hashtags,
        "message": content.message,
        "character_count": len(content.message),
        "post_id": published.get("post_id"),
        "photo_id": published.get("id"),
        "published": True,
    }

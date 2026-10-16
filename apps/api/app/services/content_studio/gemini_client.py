import os
import logging
from typing import Optional, Dict, Any
import google.genai as genai
from google.genai import types
from ...config import settings

logger = logging.getLogger(__name__)

def get_gemini_client(
    api_key_override: Optional[str] = None,
    base_url_override: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    **kwargs: Any,
) -> genai.Client:
    """
    Builds and returns a google-genai Client configured to talk either directly to
    Google AI Studio/Vertex or via a LiteLLM-based deployed LLM gateway.

    Uses types.HttpOptions to configure:
      - base_url: The gateway base URL (via base_url_override, settings.GEMINI_BASE_URL,
                  or settings.LLM_GATEWAY_BASE_URL).
      - headers: 'Authorization: Bearer <token>' containing the gateway token or API key.
    """
    token = (
        api_key
        or api_key_override
        or settings.GEMINI_API_KEY
        or settings.LLM_GATEWAY_TOKEN
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("LLM_GATEWAY_TOKEN")
        or ""
    ).strip()

    target_base_url = (
        base_url
        or base_url_override
        or settings.GEMINI_BASE_URL
        or settings.LLM_GATEWAY_BASE_URL
        or os.environ.get("GEMINI_BASE_URL")
        or os.environ.get("LLM_GATEWAY_BASE_URL")
        or ""
    ).strip()

    if not token and not base_url:
        raise ValueError(
            "Gemini API Key or Gateway Token is missing. Please set GEMINI_API_KEY (or LLM_GATEWAY_TOKEN) in your environment or .env file."
        )

    auth_token = token or "gateway-token"
    auth_header = auth_token if auth_token.startswith("Bearer ") else f"Bearer {auth_token}"

    headers: Dict[str, str] = {
        "Authorization": auth_header,
    }

    http_options_kwargs: Dict[str, Any] = {
        "headers": headers,
    }

    if target_base_url:
        clean_url = target_base_url.rstrip("/")
        if clean_url.endswith("/v1beta"):
            http_options_kwargs["base_url"] = clean_url
            http_options_kwargs["api_version"] = ""
        else:
            http_options_kwargs["base_url"] = clean_url
        logger.info(f"Configuring Gemini Client with Gateway base_url: {clean_url}")

    http_options = types.HttpOptions(**http_options_kwargs)
    return genai.Client(api_key=auth_token, http_options=http_options)


def has_gemini_credentials(
    api_key_override: Optional[str] = None,
    base_url_override: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    **kwargs: Any,
) -> bool:
    """Returns True if a Gemini API key or Gateway base_url/token is configured."""
    return bool(
        api_key
        or api_key_override
        or base_url
        or base_url_override
        or settings.GEMINI_API_KEY
        or settings.GEMINI_BASE_URL
        or settings.LLM_GATEWAY_TOKEN
        or settings.LLM_GATEWAY_BASE_URL
        or os.environ.get("GEMINI_API_KEY")
        or os.environ.get("GEMINI_BASE_URL")
        or os.environ.get("LLM_GATEWAY_TOKEN")
        or os.environ.get("LLM_GATEWAY_BASE_URL")
    )



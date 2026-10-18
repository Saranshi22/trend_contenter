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
    gemini_key = (
        api_key
        or api_key_override
        or settings.GEMINI_API_KEY
        or os.environ.get("GEMINI_API_KEY")
        or ""
    ).strip()

    # Local testing variable: when enabled, routes Content Studio calls via LLM Gateway.
    # To delete/disable later: set USE_LLM_GATEWAY_FOR_CONTENT_STUDIO=false or remove from .env.
    use_gateway = (
        getattr(settings, "USE_LLM_GATEWAY_FOR_CONTENT_STUDIO", False)
        or os.environ.get("USE_LLM_GATEWAY_FOR_CONTENT_STUDIO", "false").strip().lower() in ("true", "1")
    )

    if use_gateway:
        target_base_url = (
            base_url
            or base_url_override
            or getattr(settings, "LLM_GATEWAY_BASE_URL", "")
            or os.environ.get("LLM_GATEWAY_BASE_URL")
            or ""
        ).strip()
        gateway_token = (
            getattr(settings, "LLM_GATEWAY_TOKEN", "")
            or os.environ.get("LLM_GATEWAY_TOKEN")
            or gemini_key
            or "gateway-token"
        ).strip()

        if not target_base_url:
            raise ValueError(
                "USE_LLM_GATEWAY_FOR_CONTENT_STUDIO is true, but LLM_GATEWAY_BASE_URL is not set."
            )

        auth_header = gateway_token if gateway_token.startswith("Bearer ") else f"Bearer {gateway_token}"
        headers: Dict[str, str] = {
            "Authorization": auth_header,
        }
        http_options_kwargs: Dict[str, Any] = {
            "headers": headers,
        }
        clean_url = target_base_url.rstrip("/")
        if clean_url.endswith("/v1beta"):
            http_options_kwargs["base_url"] = clean_url
            http_options_kwargs["api_version"] = ""
        else:
            http_options_kwargs["base_url"] = clean_url
        logger.info(f"[LOCAL TESTING] Routing Content Studio via LLM Gateway: {clean_url}")
        http_options = types.HttpOptions(**http_options_kwargs)
        return genai.Client(api_key=gateway_token, http_options=http_options)

    # Standard direct Google AI Studio Gemini client (Production & Default)
    explicit_base_url = (base_url or base_url_override or getattr(settings, "GEMINI_BASE_URL", "") or "").strip()
    if explicit_base_url:
        http_options = types.HttpOptions(base_url=explicit_base_url.rstrip("/"))
        return genai.Client(api_key=gemini_key, http_options=http_options)

    if gemini_key:
        logger.info("Configuring direct Google AI Studio Gemini client using GEMINI_API_KEY.")
        return genai.Client(api_key=gemini_key)

    raise ValueError(
        "GEMINI_API_KEY is missing. Please set GEMINI_API_KEY in your environment or .env file "
        "(or set USE_LLM_GATEWAY_FOR_CONTENT_STUDIO=true with LLM_GATEWAY_BASE_URL for local testing)."
    )


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



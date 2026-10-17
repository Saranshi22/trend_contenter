"""Utilities for logging and sensitive data sanitization in publishers."""

from __future__ import annotations
import re
from typing import Any

SENSITIVE_KEYS = {
    "token", "access_token", "api_key", "password", "secret", 
    "authorization", "bearer", "smtp_password", "key"
}

def sanitize_for_logging(data: Any, depth: int = 0) -> Any:
    """
    Recursively masks sensitive tokens, passwords, and API keys for safe structured logging.
    """
    if depth > 5:
        return "<truncated>"
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            k_lower = str(k).lower()
            if any(s in k_lower for s in SENSITIVE_KEYS):
                if isinstance(v, str) and len(v) > 8:
                    sanitized[k] = f"{v[:3]}...{v[-3:]}"
                else:
                    sanitized[k] = "***"
            else:
                sanitized[k] = sanitize_for_logging(v, depth + 1)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_for_logging(item, depth + 1) for item in data]
    elif isinstance(data, str):
        # Mask JWT tokens
        if len(data) > 60 and "." in data and data.count(".") == 2:
            return f"{data[:8]}...[jwt]...{data[-6:]}"
        return data
    return data

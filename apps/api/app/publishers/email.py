"""Email publishing module with SMTP and SendGrid SDK delivery backends."""

from __future__ import annotations

import base64
import logging
import os
import smtplib
import time
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from html import escape
from typing import Any

import requests
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
try:
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import (
        Attachment,
        ContentId,
        Disposition,
        Email,
        FileContent,
        FileName,
        FileType,
        Mail,
        Personalization,
    )
    HAVE_SENDGRID = True
except ImportError:
    SendGridAPIClient = None  # type: ignore
    Attachment = None  # type: ignore
    ContentId = None  # type: ignore
    Disposition = None  # type: ignore
    Email = None  # type: ignore
    FileContent = None  # type: ignore
    FileName = None  # type: ignore
    FileType = None  # type: ignore
    Mail = None  # type: ignore
    Personalization = None  # type: ignore
    HAVE_SENDGRID = False

try:
    from .common import PublisherError, RETRYABLE_STATUS_CODES, RetryPolicy, load_image_bytes
    from .utilities import sanitize_for_logging
except ImportError:
    try:
        from publishers.common import PublisherError, RETRYABLE_STATUS_CODES, RetryPolicy, load_image_bytes
        from publishers.utilities import sanitize_for_logging
    except ImportError:
        from common import PublisherError, RETRYABLE_STATUS_CODES, RetryPolicy, load_image_bytes
        from utilities import sanitize_for_logging

SMTP_DEFAULT_HOST = os.getenv("SMTP_RELAY_HOST", "smtp.sendgrid.net")
SMTP_DEFAULT_PORT = int(os.getenv("SMTP_RELAY_PORT", "587"))
SMTP_DEFAULT_USERNAME = os.getenv("SMTP_RELAY_USERNAME", "apikey")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("SMTP_RELAY_TIMEOUT_SECONDS", "30"))
DEFAULT_EMAIL_DELIVERY_PROVIDER = os.getenv("EMAIL_DELIVERY_PROVIDER", "sendgrid_sdk").strip().lower()
DEFAULT_CAMPAIGN_BUTTON_URL = "https://trendcontenter.com/"
LOGGER = logging.getLogger(__name__)


class EmailPublishInput(BaseModel):
    to_emails: list[str] = Field(min_length=1)
    subject: str = Field(min_length=1, max_length=998)
    text: str | None = None
    image_url: str | None = None
    html_content: str | None = None
    brand_heading: str | None = None
    campaign_body: str | None = None
    review_button_url: str | None = None
    approve_button_url: str | None = None
    from_email: str = Field(min_length=3)
    reply_to: str | None = None

    @field_validator("to_emails", mode="before")
    @classmethod
    def normalize_to_emails(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            raw_parts = value.replace(",", " ").split()
        else:
            raw_parts = list(value)

        cleaned: list[str] = []
        seen: set[str] = set()
        for raw_part in raw_parts:
            email = str(raw_part).strip()
            if not email:
                continue
            key = email.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(email)

        if not cleaned:
            raise ValueError("At least one recipient email is required.")
        return cleaned

    @field_validator("subject", "from_email")
    @classmethod
    def non_empty_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Field cannot be empty.")
        return normalized

    @field_validator("text", "campaign_body", "brand_heading")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("review_button_url", "approve_button_url")
    @classmethod
    def validate_optional_button_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            return None
        if not (normalized.startswith("http://") or normalized.startswith("https://")):
            raise ValueError("Button URLs must start with http:// or https://")
        return normalized

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.strip()
        if not normalized:
            return None
        return normalized

    @field_validator("to_emails")
    @classmethod
    def validate_recipient_addresses(cls, value: list[str]) -> list[str]:
        for email in value:
            if "@" not in email or email.startswith("@") or email.endswith("@"):
                raise ValueError(f"Invalid recipient email: {email}")
        return value

    @field_validator("reply_to", mode="before")
    @classmethod
    def normalize_reply_to(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = str(value).strip()
        return normalized or None

    @field_validator("from_email", "reply_to")
    @classmethod
    def validate_sender_addresses(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError(f"Invalid email address: {value}")
        return value

    @model_validator(mode="after")
    def validate_content_presence(self) -> "EmailPublishInput":
        if not self.text and not self.html_content and not self.image_url:
            raise ValueError("Provide at least one content source: text, html_content, or image_url.")
        return self


class SMTPRelayCredentials(BaseModel):
    host: str = SMTP_DEFAULT_HOST
    port: int = SMTP_DEFAULT_PORT
    username: str = SMTP_DEFAULT_USERNAME
    password: str = Field(min_length=1)
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS
    use_starttls: bool = True


class SendGridCredentials(BaseModel):
    api_key: str = Field(min_length=1)


def _build_input(
    to_emails: list[str] | str,
    subject: str,
    text: str | None,
    from_email: str,
    image_url: str | None = None,
    html_content: str | None = None,
    brand_heading: str | None = None,
    campaign_body: str | None = None,
    review_button_url: str | None = None,
    approve_button_url: str | None = None,
    reply_to: str | None = None,
) -> EmailPublishInput:
    try:
        return EmailPublishInput(
            to_emails=to_emails,
            subject=subject,
            text=text,
            image_url=image_url,
            html_content=html_content,
            brand_heading=brand_heading,
            campaign_body=campaign_body,
            review_button_url=review_button_url,
            approve_button_url=approve_button_url,
            from_email=from_email,
            reply_to=reply_to,
        )
    except ValidationError as exc:
        raise ValueError(exc.errors(include_url=False)) from exc


def _resolve_smtp_credentials(
    smtp_host: str | None,
    smtp_port: int | None,
    smtp_username: str | None,
    smtp_password: str | None,
    use_starttls: bool | None,
) -> SMTPRelayCredentials:
    resolved_password = smtp_password or os.getenv("SMTP_RELAY_PASSWORD")
    if not resolved_password:
        raise ValueError(
            "Missing SMTP relay password. Provide smtp_password argument "
            "or set SMTP_RELAY_PASSWORD in mcp_server.env."
        )

    return SMTPRelayCredentials(
        host=smtp_host or os.getenv("SMTP_RELAY_HOST", SMTP_DEFAULT_HOST),
        port=smtp_port or int(os.getenv("SMTP_RELAY_PORT", str(SMTP_DEFAULT_PORT))),
        username=smtp_username or os.getenv("SMTP_RELAY_USERNAME", SMTP_DEFAULT_USERNAME),
        password=resolved_password,
        timeout_seconds=float(os.getenv("SMTP_RELAY_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))),
        use_starttls=(
            use_starttls
            if use_starttls is not None
            else os.getenv("SMTP_RELAY_USE_STARTTLS", "true").strip().lower() in {"1", "true", "yes", "on"}
        ),
    )


def _resolve_sendgrid_credentials(smtp_password: str | None) -> SendGridCredentials:
    resolved_api_key = smtp_password or os.getenv("SENDGRID_API_KEY") or os.getenv("SMTP_RELAY_PASSWORD")
    if not resolved_api_key:
        raise ValueError(
            "Missing SendGrid API key. Provide smtp_password argument "
            "or set SENDGRID_API_KEY in mcp_server.env."
        )
    return SendGridCredentials(api_key=resolved_api_key)


def _build_image_html(image_url: str | None, text: str | None) -> str | None:
    if not image_url:
        return None
    caption = escape(text) if text else "Shared image"
    safe_url = escape(image_url, quote=True)
    return (
        "<html><body style='font-family:Arial,sans-serif;padding:12px;'>"
        f"<p>{caption}</p>"
        f"<img src='{safe_url}' alt='email-image' style='max-width:100%;height:auto;border-radius:8px;'/>"
        "</body></html>"
    )

def _build_marketing_campaign_html(
    image_src: str,
    text: str | None,
    brand_heading: str | None = None,
    campaign_body: str | None = None,
    review_button_url: str | None = None,
    approve_button_url: str | None = None,
    is_cid: bool = False,
) -> str:
    """Renders a marketing-campaign email with a clean blue-forward style."""
    # Keep payload-driven copy only: no placeholders when values are empty.
    headline = escape(text.strip()) if text and text.strip() else ""
    body_copy = escape(campaign_body.strip()) if campaign_body and campaign_body.strip() else ""
    headline_block = (
        "<h1 style=\"margin:0 0 16px;font-size:28px;font-weight:800;"
        "color:#004B93;line-height:1.2;letter-spacing:-0.5px;\">"
        f"{headline}</h1>"
    ) if headline else ""
    body_block = (
        "<p style=\"margin:0 0 28px;font-size:15px;color:#444444;line-height:1.7;\">"
        f"{body_copy}</p>"
    ) if body_copy else ""
    buttons_top_padding = "0" if not (headline_block or body_block) else "4"
    resolved_review_button_url = escape(
        (review_button_url or DEFAULT_CAMPAIGN_BUTTON_URL).strip(), quote=True
    )
    resolved_approve_button_url = escape(
        (approve_button_url or DEFAULT_CAMPAIGN_BUTTON_URL).strip(), quote=True
    )
    safe_src = escape(image_src, quote=True)
    # For cid: srcs the <picture> trick keeps Outlook/Gmail happy
    img_tag = (
        f"<picture><source srcset='{safe_src}'/>"
        f"<img src='{safe_src}' alt='Campaign image' "
        "style='width:100%;max-width:600px;height:auto;display:block;border:0;'/>"
        "</picture>"
        if is_cid
        else (
            f"<img src='{safe_src}' alt='Campaign image' "
            "style='width:100%;max-width:600px;height:auto;display:block;border:0;'/>"
        )
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title></title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#f0f4f8;padding:32px 0;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;border-radius:12px;
                      overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.15);">

          <!-- Hero image -->
          <tr>
            <td style="background-color:#ffffff;padding:0;line-height:0;">
              {img_tag}
            </td>
          </tr>

          <!-- Accent stripe -->
          <tr>
            <td style="background-color:#E8112D;height:6px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Body copy -->
          <tr>
            <td style="background-color:#ffffff;padding:36px 40px 28px;">
              {headline_block}
              {body_block}
              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" border="0" style="padding-top:{buttons_top_padding}px;">
                <tr>
                  <td style="background-color:#E8112D;border-radius:6px;">
                    <a href="{resolved_review_button_url}" style="display:inline-block;padding:14px 32px;
                                       font-size:15px;font-weight:700;
                                       color:#ffffff;text-decoration:none;
                                       letter-spacing:0.5px;text-transform:uppercase;">
                      Review in Platform
                    </a>
                  </td>
                  <td style="width:10px;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="background-color:#004B93;border-radius:6px;">
                    <a href="{resolved_approve_button_url}" style="display:inline-block;padding:14px 32px;
                                       font-size:15px;font-weight:700;
                                       color:#ffffff;text-decoration:none;
                                       letter-spacing:0.5px;text-transform:uppercase;">
                      Approve
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>"""


def _build_inline_image_html(inline_cid: str, fallback_url: str | None, text: str | None) -> str:
    caption = escape(text) if text else "Shared image"
    safe_cid = escape(inline_cid, quote=True)
    safe_fallback = escape(fallback_url or "", quote=True)
    fallback_src = safe_fallback or safe_cid
    return (
        "<html><body style='font-family:Arial,sans-serif;padding:12px;'>"
        f"<p>{caption}</p>"
        "<picture>"
        f"<source srcset='{safe_cid}'/>"
        f"<img src='{fallback_src}' alt='email-image' style='max-width:100%;height:auto;border-radius:8px;'/>"
        "</picture>"
        "</body></html>"
    )


def _download_inline_image(image_url: str, timeout_seconds: float) -> tuple[str, str, bytes]:
    try:
        image_bytes, content_type = load_image_bytes(image_url, timeout_seconds=timeout_seconds)
    except Exception as exc:
        raise PublisherError(f"Image load failed for email: {exc}") from exc

    sniffed_subtype = _sniff_image_subtype(image_bytes)
    if content_type.startswith("image/"):
        subtype = content_type.split("/", 1)[1] if "/" in content_type else (sniffed_subtype or "png")
        normalized_content_type = f"image/{subtype}"
    elif sniffed_subtype:
        subtype = sniffed_subtype
        normalized_content_type = f"image/{subtype}"
    else:
        subtype = "png"
        normalized_content_type = "image/png"

    return f"email-image-inline.{subtype}", normalized_content_type, image_bytes


def _sniff_image_subtype(image_bytes: bytes) -> str | None:
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


def _send_email_via_smtp(payload: EmailPublishInput, credentials: SMTPRelayCredentials) -> dict[str, Any]:
    retry_policy = RetryPolicy(
        attempts=int(os.getenv("SMTP_RELAY_RETRY_ATTEMPTS", "3")),
        backoff_base_seconds=float(os.getenv("SMTP_RELAY_RETRY_BASE_DELAY_SECONDS", "1")),
        backoff_max_seconds=float(os.getenv("SMTP_RELAY_RETRY_MAX_DELAY_SECONDS", "20")),
    )

    mime_message = _build_smtp_mime_message(payload, credentials.timeout_seconds)

    last_exception: Exception | None = None
    for attempt in range(1, retry_policy.normalized_attempts() + 1):
        try:
            LOGGER.info(
                "SMTP relay send attempt",
                extra={
                    "event": "email_smtp_send_attempt",
                    "attempt": attempt,
                    "max_attempts": retry_policy.normalized_attempts(),
                    "provider": "smtp",
                    "recipient_count": len(payload.to_emails),
                },
            )
            with smtplib.SMTP(credentials.host, credentials.port, timeout=credentials.timeout_seconds) as smtp:
                smtp.ehlo()
                if credentials.use_starttls:
                    smtp.starttls()
                    smtp.ehlo()
                smtp.login(credentials.username, credentials.password)
                refused = smtp.sendmail(
                    from_addr=payload.from_email,
                    to_addrs=payload.to_emails,
                    msg=mime_message,
                )
                if refused:
                    raise PublisherError(f"SMTP relay refused recipients: {refused}")

                LOGGER.info(
                    "SMTP relay send succeeded",
                    extra={
                        "event": "email_smtp_send_succeeded",
                        "provider": "smtp",
                        "recipient_count": len(payload.to_emails),
                    },
                )
                return {
                    "accepted": True,
                    "status_code": 250,
                    "message_id": None,
                    "recipient_count": len(payload.to_emails),
                }
        except (smtplib.SMTPException, OSError) as exc:
            last_exception = exc
            if attempt < retry_policy.normalized_attempts():
                delay = min(
                    retry_policy.backoff_max_seconds,
                    retry_policy.backoff_base_seconds * (2 ** (attempt - 1)),
                )
                LOGGER.warning(
                    "SMTP relay send retry scheduled",
                    extra={
                        "event": "email_smtp_send_retry",
                        "provider": "smtp",
                        "attempt": attempt,
                        "max_attempts": retry_policy.normalized_attempts(),
                        "retry_delay_seconds": delay,
                        "error_type": exc.__class__.__name__,
                    },
                )
                time.sleep(
                    delay
                )
                continue
            raise PublisherError(f"SMTP relay email publish failed: {exc}") from exc

    if last_exception is not None:
        raise PublisherError(f"SMTP relay email publish failed: {last_exception}") from last_exception
    raise PublisherError("SMTP relay email publish failed after retries.")


def _build_smtp_mime_message(payload: EmailPublishInput, timeout_seconds: float) -> str:
    resolved_text = payload.text or (
        f"Image content: {payload.image_url}" if payload.image_url else "HTML email content."
    )
    resolved_html = payload.html_content
    inline_image_part: MIMEImage | None = None

    if not payload.html_content and payload.image_url:
        content_id, content_type, image_bytes = _download_inline_image(payload.image_url, timeout_seconds)
        subtype = content_type.split("/", 1)[1] if "/" in content_type else "jpeg"
        image_part = MIMEImage(image_bytes, _subtype=subtype)
        image_part.add_header("Content-ID", f"<{content_id}>")
        image_part.add_header("X-Attachment-Id", content_id)
        image_part.add_header("Content-Disposition", "inline")
        image_part.add_header("Content-Location", content_id)
        inline_image_part = image_part
        resolved_html = _build_marketing_campaign_html(
            image_src=f"cid:{content_id}",
            text=payload.text,
            brand_heading=payload.brand_heading,
            campaign_body=payload.campaign_body,
            review_button_url=payload.review_button_url,
            approve_button_url=payload.approve_button_url,
            is_cid=True,
        )
    elif not payload.html_content:
        resolved_html = _build_image_html(payload.image_url, payload.text)

    message = MIMEMultipart("related")
    message["Subject"] = payload.subject
    message["From"] = payload.from_email
    message["To"] = ", ".join(payload.to_emails)
    if payload.reply_to:
        message["Reply-To"] = payload.reply_to

    alternative = MIMEMultipart("alternative")
    message.attach(alternative)
    alternative.attach(MIMEText(resolved_text, "plain", "utf-8"))
    if resolved_html:
        alternative.attach(MIMEText(resolved_html, "html", "utf-8"))
    if inline_image_part is not None:
        message.attach(inline_image_part)

    return message.as_string()


def _send_email_via_sendgrid(payload: EmailPublishInput, credentials: SendGridCredentials) -> dict[str, Any]:
    if not HAVE_SENDGRID or SendGridAPIClient is None:
        raise PublisherError(
            "SendGrid SDK is not installed. Please install it via `poetry run pip install sendgrid`.",
            is_retryable=False,
        )
    client = SendGridAPIClient(credentials.api_key)

    resolved_text = payload.text or (
        f"Image content: {payload.image_url}" if payload.image_url else "HTML email content."
    )
    resolved_html = payload.html_content
    inline_attachment: Attachment | None = None

    if not payload.html_content and payload.image_url:
        content_id, content_type, image_bytes = _download_inline_image(
            payload.image_url, DEFAULT_TIMEOUT_SECONDS
        )
        encoded = base64.b64encode(image_bytes).decode()
        resolved_html = _build_marketing_campaign_html(
            image_src=f"cid:{content_id}",
            text=payload.text,
            brand_heading=payload.brand_heading,
            campaign_body=payload.campaign_body,
            review_button_url=payload.review_button_url,
            approve_button_url=payload.approve_button_url,
            is_cid=True,
        )
        inline_attachment = Attachment(
            FileContent(encoded),
            FileName(content_id),
            FileType(content_type),
            Disposition("inline"),
            ContentId(content_id),
        )
    elif not payload.html_content:
        resolved_html = _build_image_html(payload.image_url, payload.text)

    mail = Mail(
        from_email=Email(payload.from_email),
        subject=payload.subject,
        plain_text_content=resolved_text,
        html_content=resolved_html or None,
    )

    personalization = Personalization()
    for address in payload.to_emails:
        personalization.add_to(Email(address))
    mail.add_personalization(personalization)

    if payload.reply_to:
        mail.reply_to = Email(payload.reply_to)

    if inline_attachment is not None:
        mail.add_attachment(inline_attachment)

    retry_policy = RetryPolicy(
        attempts=int(os.getenv("SENDGRID_RETRY_ATTEMPTS", "3")),
        backoff_base_seconds=float(os.getenv("SENDGRID_RETRY_BASE_DELAY_SECONDS", "1")),
        backoff_max_seconds=float(os.getenv("SENDGRID_RETRY_MAX_DELAY_SECONDS", "20")),
    )

    last_exception: Exception | None = None
    for attempt in range(1, retry_policy.normalized_attempts() + 1):
        try:
            LOGGER.info(
                "SendGrid SDK send attempt",
                extra={
                    "event": "email_sendgrid_send_attempt",
                    "attempt": attempt,
                    "max_attempts": retry_policy.normalized_attempts(),
                    "provider": "sendgrid_sdk",
                    "recipient_count": len(payload.to_emails),
                    "has_html_content": bool(resolved_html),
                    "has_inline_attachment": inline_attachment is not None,
                },
            )
            response = client.send(mail)
        except Exception as exc:
            last_exception = exc
            if attempt < retry_policy.normalized_attempts():
                delay = min(
                    retry_policy.backoff_max_seconds,
                    retry_policy.backoff_base_seconds * (2 ** (attempt - 1)),
                )
                LOGGER.warning(
                    "SendGrid SDK send retry scheduled",
                    extra={
                        "event": "email_sendgrid_send_retry",
                        "provider": "sendgrid_sdk",
                        "attempt": attempt,
                        "max_attempts": retry_policy.normalized_attempts(),
                        "retry_delay_seconds": delay,
                        "error_type": exc.__class__.__name__,
                    },
                )
                time.sleep(
                    delay
                )
                continue
            raise PublisherError(f"SendGrid SDK email publish failed: {exc}") from exc

        if response.status_code in {408, 425, 429, 500, 502, 503, 504} and attempt < retry_policy.normalized_attempts():
            delay = min(
                retry_policy.backoff_max_seconds,
                retry_policy.backoff_base_seconds * (2 ** (attempt - 1)),
            )
            LOGGER.warning(
                "SendGrid SDK retryable response",
                extra={
                    "event": "email_sendgrid_retryable_response",
                    "provider": "sendgrid_sdk",
                    "attempt": attempt,
                    "max_attempts": retry_policy.normalized_attempts(),
                    "status_code": response.status_code,
                    "retry_delay_seconds": delay,
                },
            )
            time.sleep(
                delay
            )
            continue

        if response.status_code >= 300:
            body = response.body.decode() if response.body else "SendGrid error"
            raise PublisherError(f"SendGrid SDK email publish failed: status={response.status_code}, body={body}")

        result = {
            "accepted": True,
            "status_code": response.status_code,
            "message_id": response.headers.get("X-Message-Id"),
            "recipient_count": len(payload.to_emails),
        }
        LOGGER.info(
            "SendGrid SDK send succeeded",
            extra={
                "event": "email_sendgrid_send_succeeded",
                "provider": "sendgrid_sdk",
                "status_code": response.status_code,
                "recipient_count": len(payload.to_emails),
                "result": sanitize_for_logging(result),
            },
        )
        return result

    if last_exception is not None:
        raise PublisherError(f"SendGrid SDK email publish failed: {last_exception}") from last_exception
    raise PublisherError("SendGrid SDK email publish failed after retries.")


def get_configuration_status() -> dict[str, Any]:
    provider = os.getenv("EMAIL_DELIVERY_PROVIDER", DEFAULT_EMAIL_DELIVERY_PROVIDER).strip().lower()
    provider = provider if provider in {"smtp", "sendgrid_sdk"} else "sendgrid_sdk"

    configured = bool(os.getenv("SENDGRID_FROM_EMAIL"))
    if provider == "smtp":
        configured = configured and bool(os.getenv("SMTP_RELAY_PASSWORD"))
    else:
        configured = configured and bool(os.getenv("SENDGRID_API_KEY"))

    return {
        "configured": configured,
        "active_provider": provider,
        "required_env_vars": ["SENDGRID_FROM_EMAIL"]
        + (["SMTP_RELAY_PASSWORD"] if provider == "smtp" else ["SENDGRID_API_KEY"]),
        "optional_env_vars": [
            "EMAIL_DELIVERY_PROVIDER",
            "SMTP_RELAY_HOST",
            "SMTP_RELAY_PORT",
            "SMTP_RELAY_USERNAME",
            "SMTP_RELAY_USE_STARTTLS",
            "SMTP_RELAY_TIMEOUT_SECONDS",
            "SMTP_RELAY_RETRY_ATTEMPTS",
            "SMTP_RELAY_RETRY_BASE_DELAY_SECONDS",
            "SMTP_RELAY_RETRY_MAX_DELAY_SECONDS",
            "SENDGRID_API_KEY",
            "SENDGRID_RETRY_ATTEMPTS",
            "SENDGRID_RETRY_BASE_DELAY_SECONDS",
            "SENDGRID_RETRY_MAX_DELAY_SECONDS",
            "SENDGRID_REPLY_TO",
        ],
        "defaults": {
            "EMAIL_DELIVERY_PROVIDER": provider,
            "SMTP_RELAY_HOST": SMTP_DEFAULT_HOST,
            "SMTP_RELAY_PORT": SMTP_DEFAULT_PORT,
            "SMTP_RELAY_USERNAME": SMTP_DEFAULT_USERNAME,
            "SMTP_RELAY_USE_STARTTLS": True,
            "SMTP_RELAY_TIMEOUT_SECONDS": DEFAULT_TIMEOUT_SECONDS,
            "SMTP_RELAY_RETRY_ATTEMPTS": int(os.getenv("SMTP_RELAY_RETRY_ATTEMPTS", "3")),
            "SMTP_RELAY_RETRY_BASE_DELAY_SECONDS": float(os.getenv("SMTP_RELAY_RETRY_BASE_DELAY_SECONDS", "1")),
            "SMTP_RELAY_RETRY_MAX_DELAY_SECONDS": float(os.getenv("SMTP_RELAY_RETRY_MAX_DELAY_SECONDS", "20")),
            "SENDGRID_RETRY_ATTEMPTS": int(os.getenv("SENDGRID_RETRY_ATTEMPTS", "3")),
            "SENDGRID_RETRY_BASE_DELAY_SECONDS": float(os.getenv("SENDGRID_RETRY_BASE_DELAY_SECONDS", "1")),
            "SENDGRID_RETRY_MAX_DELAY_SECONDS": float(os.getenv("SENDGRID_RETRY_MAX_DELAY_SECONDS", "20")),
        },
    }


def publish(
    to_emails: list[str] | str,
    subject: str,
    text: str | None = None,
    image_url: str | None = None,
    html_content: str | None = None,
    brand_heading: str | None = None,
    campaign_body: str | None = None,
    review_button_url: str | None = None,
    approve_button_url: str | None = None,
    from_email: str | None = None,
    reply_to: str | None = None,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    smtp_username: str | None = None,
    smtp_password: str | None = None,
    use_starttls: bool | None = None,
) -> dict[str, Any]:
    resolved_from_email = from_email or os.getenv("SENDGRID_FROM_EMAIL")
    if not resolved_from_email:
        raise ValueError(
            "Missing sender email: SENDGRID_FROM_EMAIL. "
            "Provide from_email as argument or define it in mcp_server.env."
        )

    resolved_reply_to = _empty_to_none(reply_to) or _empty_to_none(os.getenv("SENDGRID_REPLY_TO"))
    payload = _build_input(
        to_emails=to_emails,
        subject=subject,
        text=text,
        image_url=image_url,
        html_content=html_content,
        brand_heading=brand_heading,
        campaign_body=campaign_body,
        review_button_url=review_button_url,
        approve_button_url=approve_button_url,
        from_email=resolved_from_email,
        reply_to=resolved_reply_to,
    )

    provider = os.getenv("EMAIL_DELIVERY_PROVIDER", DEFAULT_EMAIL_DELIVERY_PROVIDER).strip().lower()
    provider = provider if provider in {"smtp", "sendgrid_sdk"} else "sendgrid_sdk"
    LOGGER.info(
        "Email publish invoked",
        extra={
            "event": "email_publish_invoked",
            "provider": provider,
            "to_emails": sanitize_for_logging(payload.to_emails),
            "subject": payload.subject,
            "has_text": bool(payload.text),
            "has_html_content": bool(payload.html_content),
            "has_image_url": bool(payload.image_url),
            "has_brand_heading": bool(payload.brand_heading),
            "has_campaign_body": bool(payload.campaign_body),
            "has_review_button_url": bool(payload.review_button_url),
            "has_approve_button_url": bool(payload.approve_button_url),
        },
    )

    if provider == "sendgrid_sdk":
        sendgrid_credentials = _resolve_sendgrid_credentials(smtp_password=smtp_password)
        send_result = _send_email_via_sendgrid(payload=payload, credentials=sendgrid_credentials)
    else:
        smtp_credentials = _resolve_smtp_credentials(
            smtp_host=smtp_host,
            smtp_port=smtp_port,
            smtp_username=smtp_username,
            smtp_password=smtp_password,
            use_starttls=use_starttls,
        )
        send_result = _send_email_via_smtp(payload=payload, credentials=smtp_credentials)

    return {
        "to_emails": payload.to_emails,
        "subject": payload.subject,
        "from_email": payload.from_email,
        "reply_to": payload.reply_to,
        "text_length": len(payload.text or ""),
        "brand_heading": payload.brand_heading,
        "campaign_body_length": len(payload.campaign_body or ""),
        "review_button_url": payload.review_button_url or DEFAULT_CAMPAIGN_BUTTON_URL,
        "approve_button_url": payload.approve_button_url or DEFAULT_CAMPAIGN_BUTTON_URL,
        "image_url": payload.image_url,
        "has_html_content": bool(payload.html_content or payload.image_url),
        "published": True,
        "provider": provider,
        **send_result,
    }


def _empty_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None

import os
import logging
from html import escape
from typing import Dict, Any, Optional, List

from ...config import settings
from ...domain.models.content_studio import (
    PublishFacebookRequest,
    PublishInstagramRequest,
    PublishEmailRequest,
    EmailTemplateConfig,
    PublishingStatusResponse,
    ChannelStatus,
    PublishResult
)

# Resilient imports for publishers
try:
    from ..publishers import facebook as fb_publisher
    from ..publishers import instagram as ig_publisher
    from ..publishers import email as email_publisher
except ImportError:
      from apps.api.app.publishers import facebook as fb_publisher
      from apps.api.app.publishers import instagram as ig_publisher
      from apps.api.app.publishers import email as email_publisher

logger = logging.getLogger(__name__)

THEME_PALETTES = {
    "modern_blue": {
        "bg": "#f0f4f8",
        "card_bg": "#ffffff",
        "primary": "#004B93",
        "stripe": "#E8112D",
        "text": "#222222",
        "text_muted": "#555555",
        "card_border": "#d2e3fc",
        "cta_text": "#ffffff"
    },
    "minimalist_dark": {
        "bg": "#0f172a",
        "card_bg": "#1e293b",
        "primary": "#6366f1",
        "stripe": "#818cf8",
        "text": "#f8fafc",
        "text_muted": "#94a3b8",
        "card_border": "#334155",
        "cta_text": "#ffffff"
    },
    "emerald_clean": {
        "bg": "#f0fdf4",
        "card_bg": "#ffffff",
        "primary": "#059669",
        "stripe": "#10b981",
        "text": "#111827",
        "text_muted": "#4b5563",
        "card_border": "#bbf7d0",
        "cta_text": "#ffffff"
    },
    "sunset_amber": {
        "bg": "#fffbeb",
        "card_bg": "#ffffff",
        "primary": "#d97706",
        "stripe": "#f59e0b",
        "text": "#1f2937",
        "text_muted": "#4b5563",
        "card_border": "#fde68a",
        "cta_text": "#ffffff"
    }
}


def render_campaign_email_html(
    headline: Optional[str],
    campaign_body: str,
    image_url: Optional[str] = None,
    config: Optional[EmailTemplateConfig] = None
) -> str:
    """
    Renders a responsive, bulletproof HTML email template with customizable
    themes, brand heading, hero visual, call-to-action buttons, and footer.
    Provides an automated clean fallback for missing fields.
    """
    cfg = config or EmailTemplateConfig()
    palette = THEME_PALETTES.get(cfg.theme or "modern_blue", THEME_PALETTES["modern_blue"])
    primary_color = cfg.accent_color or palette["primary"]

    safe_brand = escape(cfg.brand_heading or "TREND CONTENT")
    safe_subtitle = escape(cfg.brand_subtitle or "Campaign Intelligence Notification")
    safe_headline = escape(headline.strip()) if headline and headline.strip() else ""

    # Parse simple markdown formatting: bold (**text**) and newlines
    body_text = escape(campaign_body.strip()) if campaign_body else ""
    # Bold conversion
    import re
    body_html = re.sub(r"\*\*(.*?)\*\*", r"<strong>\1</strong>", body_text)
    # Line breaks into paragraphs / breaks
    paragraphs = [p.strip() for p in body_html.split("\n\n") if p.strip()]
    formatted_body = "".join(f"<p style=\"margin:0 0 16px;font-size:15px;line-height:1.7;color:{palette['text']};\">{p.replace(chr(10), '<br/>')}</p>" for p in paragraphs)

    # Hero visual
    hero_block = ""
    if cfg.include_hero_image and image_url:
        safe_img = escape(image_url.strip(), quote=True)
        hero_block = f"""
        <tr>
          <td style="padding:0;line-height:0;background-color:{palette['card_bg']};">
            <img src="{safe_img}" alt="Campaign Visual" style="width:100%;max-width:600px;height:auto;display:block;border:0;" />
          </td>
        </tr>
        """

    # Headline block
    headline_block = ""
    if safe_headline:
        headline_block = f"""
        <h1 style="margin:0 0 16px;font-size:26px;font-weight:800;color:{primary_color};line-height:1.25;letter-spacing:-0.5px;">
          {safe_headline}
        </h1>
        """

    # Action Buttons
    primary_cta_text = escape(cfg.primary_cta_text or "Explore Campaign")
    primary_cta_url = escape((cfg.primary_cta_url or "https://trendcontenter.com/").strip(), quote=True)

    secondary_btn = ""
    if cfg.secondary_button_text and cfg.secondary_button_url:
        sec_text = escape(cfg.secondary_button_text.strip())
        sec_url = escape(cfg.secondary_button_url.strip(), quote=True)
        secondary_btn = f"""
        <td style="padding-left:12px;">
          <a href="{sec_url}" style="display:inline-block;padding:12px 24px;border:1px solid {primary_color};color:{primary_color};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">
            {sec_text}
          </a>
        </td>
        """

    safe_footer = escape(cfg.footer_text or "You are receiving this intelligence notification from Trend Contenter.")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>{safe_headline or safe_brand}</title>
</head>
<body style="margin:0;padding:0;background-color:{palette['bg']};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:{palette['bg']};padding:32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:{palette['card_bg']};border-radius:12px;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,0.08);border:1px solid {palette['card_border']};">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding:22px 32px;background-color:{primary_color};color:#ffffff;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">{safe_brand}</div>
                    <div style="font-size:12px;opacity:0.85;margin-top:2px;">{safe_subtitle}</div>
                  </td>
                  <td align="right">
                    <span style="font-size:11px;background:rgba(255,255,255,0.2);padding:4px 10px;border-radius:20px;font-weight:600;letter-spacing:0.5px;">LIVE DISPATCH</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Image -->
          {hero_block}

          <!-- Accent Line -->
          <tr>
            <td style="background-color:{palette['stripe']};height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:36px 36px 28px;background-color:{palette['card_bg']};">
              {headline_block}
              {formatted_body}

              <!-- CTA Buttons Row -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;margin-bottom:8px;">
                <tr>
                  <td style="background-color:{primary_color};border-radius:6px;">
                    <a href="{primary_cta_url}" style="display:inline-block;padding:13px 30px;font-size:15px;font-weight:700;color:{palette['cta_text']};text-decoration:none;border-radius:6px;letter-spacing:0.2px;">
                      {primary_cta_text} &rarr;
                    </a>
                  </td>
                  {secondary_btn}
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 36px 28px;background-color:{palette['bg']};border-top:1px solid {palette['card_border']};color:{palette['text_muted']};font-size:12px;line-height:1.6;text-align:center;">
              <div>{safe_footer}</div>
              <div style="margin-top:8px;font-size:11px;opacity:0.75;">
                &copy; Trend Contenter Studio &bull; Evidence-Backed Content Supply Chain
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return html


def _resolve_absolute_image_url(image_url: str) -> str:
    cleaned = (image_url or "").strip()
    if not cleaned:
        raise ValueError("Image source is required for publishing.")
    public_base = os.getenv("APP_PUBLIC_URL") or os.getenv("PUBLIC_APP_URL") or os.getenv("PUBLIC_BASE_URL")
    if public_base:
        if cleaned.startswith("/"):
            return f"{public_base.rstrip('/')}/{cleaned.lstrip('/')}"
        if "localhost" in cleaned or "127.0.0.1" in cleaned:
            from urllib.parse import urlparse
            parsed = urlparse(cleaned)
            path = parsed.path
            if parsed.query:
                path += f"?{parsed.query}"
            return f"{public_base.rstrip('/')}/{path.lstrip('/')}"
    return cleaned


class PublisherService:
    def __init__(self):
        pass

    def get_publishing_status(self) -> PublishingStatusResponse:
        """Checks configuration status across Facebook, Instagram, and SendGrid/SMTP."""
        fb_configured = bool(os.getenv("FACEBOOK_PAGE_ID") and os.getenv("FACEBOOK_ACCESS_TOKEN"))
        fb_details = f"Page ID: {os.getenv('FACEBOOK_PAGE_ID')[:4]}***" if fb_configured else "Missing FACEBOOK_PAGE_ID or FACEBOOK_ACCESS_TOKEN"

        ig_configured = bool(os.getenv("INSTAGRAM_USER_ID") and os.getenv("INSTAGRAM_ACCESS_TOKEN"))
        ig_details = f"Account ID: {os.getenv('INSTAGRAM_USER_ID')[:4]}***" if ig_configured else "Missing INSTAGRAM_USER_ID or INSTAGRAM_ACCESS_TOKEN"

        sendgrid_configured = bool(os.getenv("SENDGRID_API_KEY") or os.getenv("SMTP_RELAY_PASSWORD"))
        email_from = os.getenv("SENDGRID_FROM_EMAIL", "")
        email_provider = os.getenv("EMAIL_DELIVERY_PROVIDER", "sendgrid_sdk")
        email_configured = sendgrid_configured and bool(email_from)
        email_details = f"Provider: {email_provider} | From: {email_from}" if email_configured else "Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in .env"

        return PublishingStatusResponse(
            facebook=ChannelStatus(configured=fb_configured, platform="Facebook Page", details=fb_details),
            instagram=ChannelStatus(configured=ig_configured, platform="Instagram Business", details=ig_details),
            email=ChannelStatus(configured=email_configured, platform=f"Email ({email_provider.upper()})", details=email_details)
        )

    def publish_facebook(self, req: PublishFacebookRequest) -> PublishResult:
        """Publishes post + image to Facebook Page via Graph API."""
        try:
            target_image_url = _resolve_absolute_image_url(req.image_url)
            logger.info(f"Publishing to Facebook Page with resolved image: {target_image_url}")
            res = fb_publisher.publish(
                image_url=target_image_url,
                text=req.text,
                hashtags=req.hashtags,
                page_id=req.page_id,
                access_token=req.access_token
            )
            post_id = res.get("post_id") or res.get("photo_id")
            return PublishResult(
                platform="facebook",
                success=True,
                post_id=post_id,
                url=f"https://facebook.com/{post_id}" if post_id else None,
                message="Successfully published photo post to Facebook Page!",
                details=res
            )
        except Exception as e:
            logger.exception(f"Facebook publish failed: {e}")
            raise RuntimeError(f"Facebook publishing failed: {e}") from e

    def publish_instagram(self, req: PublishInstagramRequest) -> PublishResult:
        """Publishes photo + caption to Instagram Business/Creator account."""
        try:
            target_image_url = _resolve_absolute_image_url(req.image_url)
            logger.info(f"Publishing to Instagram with image: {target_image_url}")
            res = ig_publisher.publish(
                image_url=target_image_url,
                text=req.text,
                hashtags=req.hashtags,
                instagram_user_id=req.instagram_user_id,
                access_token=req.access_token,
                gcs_bucket=req.gcs_bucket,
                gcloud_service_key=req.gcloud_service_key,
            )
            media_id = res.get("published_media_id") or res.get("creation_id")
            return PublishResult(
                platform="instagram",
                success=True,
                post_id=media_id,
                url=f"https://instagram.com/p/{media_id}" if media_id else None,
                message="Successfully published photo post to Instagram Feed!",
                details=res
            )
        except Exception as e:
            logger.exception(f"Instagram publish failed: {e}")
            raise RuntimeError(f"Instagram publishing failed: {e}") from e

    def publish_email(self, req: PublishEmailRequest) -> PublishResult:
        """
        Sends email notification/campaign via SendGrid SDK or SMTP relay.
        Renders the configurable template with customizable styling and automatic fallback.
        """
        try:
            logger.info(f"Dispatching campaign email to {len(req.to_emails)} recipients...")

            # Render HTML template if custom_html not explicitly provided
            if req.custom_html:
                rendered_html = req.custom_html
            else:
                rendered_html = render_campaign_email_html(
                    headline=req.headline or req.subject,
                    campaign_body=req.campaign_body,
                    image_url=req.image_url,
                    config=req.template_config
                )

            res = email_publisher.publish(
                to_emails=req.to_emails,
                subject=req.subject,
                text=req.campaign_body,
                html_content=rendered_html,
                image_url=req.image_url,
                from_email=req.from_email,
                reply_to=req.reply_to,
                smtp_host=req.smtp_host,
                smtp_port=req.smtp_port,
                smtp_username=req.smtp_username,
                smtp_password=req.sendgrid_api_key or req.smtp_password
            )

            msg_id = res.get("message_id") or f"msg_{len(req.to_emails)}_sent"
            return PublishResult(
                platform="email",
                success=True,
                post_id=msg_id,
                message=f"Campaign email successfully delivered to {len(req.to_emails)} recipients!",
                details=res
            )
        except Exception as e:
            logger.exception(f"Email publishing failed: {e}")
            raise RuntimeError(f"Email campaign dispatch failed: {e}") from e


publisher_service = PublisherService()


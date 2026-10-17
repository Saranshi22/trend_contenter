import json
import re
import uuid
import logging
from typing import List, Optional, Any, Dict

import google.genai as genai
from google.genai import types

from ...config import settings
from .gemini_client import get_gemini_client, has_gemini_credentials
from ...domain.models.content_studio import (
    GenerateExperimentsRequest,
    GenerateExperimentsResponse,
    ContentExperimentVariant
)
from .image_utils import clean_base64_string

logger = logging.getLogger(__name__)

class ContentExperimentService:
    def __init__(self):
        pass

    def _get_client(self, api_key_override: Optional[str] = None, base_url_override: Optional[str] = None) -> genai.Client:
        return get_gemini_client(api_key_override=api_key_override, base_url_override=base_url_override)

    async def generate_experiments(self, req: GenerateExperimentsRequest) -> GenerateExperimentsResponse:
        """
        Synthesizes an editorial brief or trend opportunity into 3 distinct, high-impact
        Campaign Experiment Variants (Trend Jacker, Educational Solution, Emotive Story)
        tailored for cross-platform execution (Instagram, Facebook, Email, Visual Artwork).
        """
        if not req.brief_text and not req.brief_file_base64 and not req.opportunity_id:
            raise ValueError("Please provide a brief text, brief file (PDF/Markdown), or opportunity ID.")

        if not has_gemini_credentials(req.api_key, getattr(req, "base_url", None)):
            raise ValueError("Gemini API key or LLM Gateway credentials are not configured.")

        # If opportunity_id is provided, try to fetch its brief from the database
        brief_context = req.brief_text or ""
        opp_title = ""
        opp_audience = req.target_audience or "Qualified Demographic"
        opp_gap = ""

        if req.opportunity_id and not brief_context:
            try:
                from ...db_postgres import get_db_session
                from sqlalchemy import text
                async with get_db_session() as session:
                    res = await session.execute(
                        text("SELECT title, content_gap, audience_label, recommended_angle, problem FROM opportunities WHERE opportunity_id = :id"),
                        {"id": req.opportunity_id}
                    )
                    row = res.fetchone()
                    if row:
                        opp_title = row.title or ""
                        opp_gap = row.content_gap or row.problem or ""
                        opp_audience = row.audience_label or opp_audience
                        rec_angle = row.recommended_angle or ""
                        brief_context = (
                            f"Opportunity Title: {opp_title}\n"
                            f"Target Audience: {opp_audience}\n"
                            f"Content Gap: {opp_gap}\n"
                            f"Recommended Editorial Angle: {rec_angle}"
                        )
            except Exception as e:
                logger.warning(f"Could not load opportunity from postgres: {e}")

        client = self._get_client(req.api_key, getattr(req, "base_url", None))
        contents = []

        if req.brief_file_base64:
            file_bytes, mime_type = clean_base64_string(req.brief_file_base64)
            if req.brief_file_mime:
                mime_type = req.brief_file_mime
            if hasattr(types, "Part") and hasattr(types.Part, "from_bytes"):
                contents.append(types.Part.from_bytes(data=file_bytes, mime_type=mime_type))
            else:
                contents.append(types.Blob(mime_type=mime_type, data=file_bytes))

        prompt_instructions = f"""
You are the Executive Creative Director & Omni-Channel Campaign Strategist for an elite digital agency.
Your task is to analyze the following intelligence brief and produce a structured Campaign Content Supply Chain containing exactly 3 distinct Campaign Experiment Variants:

1. Variant A (trend_jacker): "The Trend Jacker / Provocative Hook" - Leverages current urgency, contrarian take, or cultural tension to stop the scroll.
2. Variant B (educational_solution): "The Value Blueprint / Problem Solver" - Clear step-by-step utility addressing the audience's verified pain point or question.
3. Variant C (emotive_narrative): "The Human Story / Empathy" - Narrative, relatable, speaking directly to emotional aspirations and identity.

Brief & Parameters:
- Campaign Goal: {req.campaign_goal or 'high engagement and conversion'}
- Target Audience: {req.target_audience or opp_audience}
- Brand Tone: {req.brand_tone or 'authoritative yet accessible'}
- Brief Context:
{brief_context if brief_context else 'Analyze the attached document carefully.'}

Output Format:
You MUST respond with ONLY a valid, parseable JSON object matching this exact schema (no markdown backticks, no trailing commentary):
{{
  "campaign_title": "string",
  "campaign_summary": "string (2-3 sentences)",
  "target_audience": "string",
  "core_friction_point": "string",
  "variants": [
    {{
      "id": "var_1",
      "variant_type": "trend_jacker",
      "variant_label": "Variant A: The Trend Jacker",
      "title": "string",
      "hook": "string (catchy scroll-stopping opening hook)",
      "angle": "string (editorial strategy explanation)",
      "instagram_copy": "string (complete Instagram caption with line breaks, emojis, and 5 hashtags)",
      "facebook_copy": "string (complete Facebook post copy with compelling body and hashtags)",
      "email_subject": "string (high open-rate subject line)",
      "email_preview": "string (email inbox preheader preview snippet)",
      "email_body": "string (rich markdown email body with bold points, concise paragraphs, and clear value)",
      "email_cta_text": "string (e.g., Read Full Breakdown / Claim Guide)",
      "email_cta_url": "https://trendcontenter.com/",
      "visual_direction": "string (detailed description for generating or photographing the hero visual)",
      "search_query": "string (concise 3-6 word Google image search query for finding authentic imagery)",
      "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "audience_fit_score": 0.94
    }},
    {{
      "id": "var_2",
      "variant_type": "educational_solution",
      "variant_label": "Variant B: The Value Blueprint",
      "title": "string",
      "hook": "string",
      "angle": "string",
      "instagram_copy": "string",
      "facebook_copy": "string",
      "email_subject": "string",
      "email_preview": "string",
      "email_body": "string",
      "email_cta_text": "string",
      "email_cta_url": "https://trendcontenter.com/",
      "visual_direction": "string",
      "search_query": "string",
      "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "audience_fit_score": 0.91
    }},
    {{
      "id": "var_3",
      "variant_type": "emotive_narrative",
      "variant_label": "Variant C: The Human Story",
      "title": "string",
      "hook": "string",
      "angle": "string",
      "instagram_copy": "string",
      "facebook_copy": "string",
      "email_subject": "string",
      "email_preview": "string",
      "email_body": "string",
      "email_cta_text": "string",
      "email_cta_url": "https://trendcontenter.com/",
      "visual_direction": "string",
      "search_query": "string",
      "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
      "audience_fit_score": 0.88
    }}
  ]
}}
"""
        contents.append(prompt_instructions)

        logger.info(f"Generating content experiments using Gemini model '{settings.GEMINI_TEXT_MODEL}'...")

        gen_config = None
        if hasattr(types, "GenerateContentConfig"):
            try:
                gen_config = types.GenerateContentConfig(
                    temperature=0.7,
                    response_mime_type="application/json"
                )
            except Exception:
                pass

        call_kwargs = {}
        if gen_config:
            call_kwargs["config"] = gen_config

        response = client.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=contents,
            **call_kwargs
        )

        raw_text = response.text or ""
        # Clean any markdown json fencing
        cleaned_json = raw_text.strip()
        if cleaned_json.startswith("```json"):
            cleaned_json = cleaned_json[7:]
        elif cleaned_json.startswith("```"):
            cleaned_json = cleaned_json[3:]
        if cleaned_json.endswith("```"):
            cleaned_json = cleaned_json[:-3]
        cleaned_json = cleaned_json.strip()

        try:
            data = json.loads(cleaned_json)
        except Exception as e:
            logger.error(f"Failed to parse Gemini experiments JSON: {e}\nRaw output: {raw_text[:500]}")
            # Try regex extraction
            match = re.search(r"(\{.*\})", raw_text, re.DOTALL)
            if match:
                data = json.loads(match.group(1))
            else:
                raise RuntimeError(f"Could not parse experiments response from Gemini: {e}") from e

        variants = []
        for i, item in enumerate(data.get("variants", [])):
            var_id = item.get("id") or f"var_{uuid.uuid4().hex[:6]}"
            v_type = item.get("variant_type") or ("trend_jacker" if i == 0 else "educational_solution" if i == 1 else "emotive_narrative")
            v_label = item.get("variant_label") or f"Variant {chr(65+i)}"
            variants.append(ContentExperimentVariant(
                id=var_id,
                variant_type=v_type,
                variant_label=v_label,
                title=item.get("title", f"Campaign Angle {chr(65+i)}"),
                hook=item.get("hook", ""),
                angle=item.get("angle", ""),
                instagram_copy=item.get("instagram_copy", ""),
                facebook_copy=item.get("facebook_copy", ""),
                email_subject=item.get("email_subject", ""),
                email_preview=item.get("email_preview", ""),
                email_body=item.get("email_body", ""),
                email_cta_text=item.get("email_cta_text", "Explore Campaign"),
                email_cta_url=item.get("email_cta_url", "https://trendcontenter.com/"),
                visual_direction=item.get("visual_direction", ""),
                search_query=item.get("search_query", item.get("title", "")),
                veo_motion_prompt=item.get("veo_motion_prompt", ""),
                hashtags=item.get("hashtags", []),
                audience_fit_score=float(item.get("audience_fit_score", 0.90))
            ))

        return GenerateExperimentsResponse(
            campaign_title=data.get("campaign_title", opp_title or "Multi-Channel Campaign Experiments"),
            campaign_summary=data.get("campaign_summary", "3 distinct campaign variants tailored for audience engagement and conversion across social and email channels."),
            target_audience=data.get("target_audience", opp_audience),
            core_friction_point=data.get("core_friction_point", opp_gap or "Unmet audience question and media gap"),
            variants=variants,
            model_used=settings.GEMINI_TEXT_MODEL
        )

experiment_service = ContentExperimentService()


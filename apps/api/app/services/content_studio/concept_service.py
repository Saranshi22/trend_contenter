import json
import re
import uuid
import logging
from typing import List, Optional, Any

import google.genai as genai
from google.genai import types

from ...config import settings
from .gemini_client import get_gemini_client, has_gemini_credentials
from ...domain.models.content_studio import (
    GenerateConceptsRequest,
    GenerateConceptsResponse,
    ContentConceptItem
)
from .image_utils import clean_base64_string

logger = logging.getLogger(__name__)

def _safe_int(val: Any, default: Optional[int] = None) -> Optional[int]:
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        try:
            m = re.search(r"\d+", str(val))
            return int(m.group()) if m else default
        except Exception:
            return default

class ConceptGenerationService:
    def __init__(self):
        pass

    def _get_client(self, api_key_override: Optional[str] = None, base_url_override: Optional[str] = None) -> genai.Client:
        return get_gemini_client(api_key_override=api_key_override, base_url_override=base_url_override)

    def generate_concepts(self, req: GenerateConceptsRequest) -> GenerateConceptsResponse:
        """
        Analyzes a brief (provided as PDF bytes or Markdown/text) and generates
        tailored image/video content concepts, platform optimizations, and exact generation prompts.
        """
        if not req.file_base64 and not (req.brief_text and req.brief_text.strip()):
            raise ValueError("No brief content provided. Please upload a PDF, upload a Markdown file, or paste brief text.")

        if not has_gemini_credentials(req.api_key, getattr(req, "base_url", None)):
            raise ValueError("Gemini API key or LLM Gateway credentials are not configured. Please set GEMINI_API_KEY or LLM_GATEWAY_TOKEN in your environment or request.")

        try:
            client = self._get_client(req.api_key, getattr(req, "base_url", None))

            # Build multimodal contents
            contents = []
            brief_detected = False

            if req.file_base64:
                file_bytes, mime_type = clean_base64_string(req.file_base64)
                # Override mime_type if caller specified a known type
                if req.file_mime_type and "pdf" in req.file_mime_type.lower():
                    mime_type = "application/pdf"
                elif req.file_mime_type and "markdown" in req.file_mime_type.lower():
                    mime_type = "text/markdown"

                if mime_type == "application/pdf":
                    contents.append(types.Part.from_bytes(data=file_bytes, mime_type="application/pdf"))
                    brief_detected = True
                else:
                    try:
                        text_content = file_bytes.decode("utf-8")
                        contents.append(types.Part.from_text(text=f"--- BRIEF CONTENT ---\n{text_content}\n--- END BRIEF ---"))
                        brief_detected = True
                    except Exception:
                        contents.append(types.Part.from_bytes(data=file_bytes, mime_type=mime_type))
                        brief_detected = True

            if req.brief_text and req.brief_text.strip():
                contents.append(types.Part.from_text(text=f"--- BRIEF CONTENT ---\n{req.brief_text.strip()}\n--- END BRIEF ---"))
                brief_detected = True

            if not brief_detected:
                raise ValueError("No brief content provided. Please upload a PDF, upload a Markdown file, or paste brief text.")

            media_instruction = "Provide a balanced distribution of image and video concepts."
            if req.preferred_media_mix == "image_only":
                media_instruction = "All concepts MUST have media_type: 'image'."
            elif req.preferred_media_mix == "video_only":
                media_instruction = "All concepts MUST have media_type: 'video'."

            platforms_str = ", ".join(req.target_platforms) if req.target_platforms else "Instagram Reels, TikTok, LinkedIn, YouTube Shorts, X (Twitter), Facebook"

            prompt_director = (
                "You are an elite Digital Content Strategist, Creative Director, and Generative AI Prompt Engineer.\n"
                "Analyze the attached Content Intelligence Opportunity Dossier / Brief in full detail.\n\n"
                f"Your task is to produce exactly {req.num_concepts} breakthrough content concepts tailored to this brief.\n"
                f"Media Mix: {media_instruction}\n"
                f"Candidate Platforms: {platforms_str}\n\n"
                "For EACH concept:\n"
                "1. 'title': Engaging concept title.\n"
                "2. 'media_type': 'image' or 'video'.\n"
                "3. 'target_platform': The specific platform where this concept will achieve maximum reach & engagement.\n"
                "4. 'platform_optimization_rationale': 2-3 sentences explaining why this format and platform best serve this specific audience and friction point.\n"
                "5. 'concept_hook': Compelling framing hook that addresses the audience's direct questions or fears.\n"
                "6. 'visual_description': Vivid description of the visual scene, subject framing, and narrative.\n"
                "7. 'generation_prompt': READY-TO-USE prompt optimized for production:\n"
                "   - If 'image': Ultra-detailed Google Gemini 3.1 Pro Image prompt (subject, lighting, composition, textures, camera angle, color grade).\n"
                "   - If 'video': Ultra-detailed Google Veo video prompt (camera motion choreography like FPV drone or push-in, subject motion, lighting, temporal dynamics).\n"
                "8. 'aspect_ratio': Platform-ideal ratio ('9:16' for Reels/Shorts/TikTok, '1:1' for Instagram/LinkedIn, '16:9' for YouTube/Landscape/X).\n"
                "9. 'style_preset': e.g., 'photorealistic', 'cinematic', 'minimalist', 'infographic'.\n"
                "10. 'camera_motion': (for videos) e.g., 'slow cinematic push-in', 'FPV drone sweep', 'dynamic tracking shot'.\n"
                "11. 'duration_seconds': (for videos) 5 or 6.\n"
                "12. 'fps': (for videos) 24 or 30.\n\n"
                "Return ONLY a structured JSON object with this EXACT schema:\n"
                "{\n"
                '  "brief_title": "Title of the brief",\n'
                '  "brief_summary": "2-3 sentence executive synthesis of the opportunity",\n'
                '  "target_audience": "Specific audience segment",\n'
                '  "key_friction_points": ["friction 1", "friction 2", "friction 3"],\n'
                '  "concepts": [\n'
                "    {\n"
                '      "id": "c1",\n'
                '      "title": "...",\n'
                '      "media_type": "image" or "video",\n'
                '      "target_platform": "...",\n'
                '      "platform_optimization_rationale": "...",\n'
                '      "concept_hook": "...",\n'
                '      "visual_description": "...",\n'
                '      "generation_prompt": "...",\n'
                '      "aspect_ratio": "16:9" or "9:16" or "1:1",\n'
                '      "style_preset": "photorealistic",\n'
                '      "camera_motion": "...",\n'
                '      "duration_seconds": 5,\n'
                '      "fps": 24\n'
                "    }\n"
                "  ]\n"
                "}"
            )

            contents.append(types.Part.from_text(text=prompt_director))

            response = client.models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.4
                )
            )

            raw_text = (response.text or "").strip()
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()
            data = json.loads(raw_text)

            concept_items: List[ContentConceptItem] = []
            for idx, c in enumerate(data.get("concepts", [])):
                if not isinstance(c, dict):
                    continue
                media_type = str(c.get("media_type") or "image").strip().lower()
                is_video = "video" in media_type
                concept_items.append(ContentConceptItem(
                    id=f"concept_{idx+1}_{uuid.uuid4().hex[:6]}",
                    title=c.get("title") or f"Content Concept {idx+1}",
                    media_type="video" if is_video else "image",
                    target_platform=c.get("target_platform") or "Instagram",
                    platform_optimization_rationale=c.get("platform_optimization_rationale") or "High engagement potential for target audience.",
                    concept_hook=c.get("concept_hook") or c.get("hook") or "",
                    visual_description=c.get("visual_description") or "",
                    generation_prompt=c.get("generation_prompt") or c.get("image_prompt") or c.get("video_prompt") or "",
                    aspect_ratio=c.get("aspect_ratio") or "1:1",
                    style_preset=c.get("style_preset") or "photorealistic",
                    camera_motion=c.get("camera_motion") or None,
                    duration_seconds=_safe_int(c.get("duration_seconds"), 5 if is_video else None),
                    fps=_safe_int(c.get("fps"), 24 if is_video else None)
                ))

            return GenerateConceptsResponse(
                brief_title=data.get("brief_title") or "Opportunity Dossier",
                brief_summary=data.get("brief_summary") or "Comprehensive content strategy extracted from dossier.",
                target_audience=data.get("target_audience") or "General Audience",
                key_friction_points=data.get("key_friction_points") or [],
                concepts=concept_items,
                model_used=settings.GEMINI_TEXT_MODEL
            )

        except Exception as e:
            logger.exception(f"Concept generation failed: {e}")
            raise RuntimeError(f"Concept generation failed: {e}") from e

concept_service = ConceptGenerationService()

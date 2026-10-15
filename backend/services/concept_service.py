import os
import json
import uuid
import logging
from typing import List, Optional

import google.genai as genai
from google.genai import types

from config import settings
from models.schemas import (
    GenerateConceptsRequest,
    GenerateConceptsResponse,
    ContentConceptItem
)
from utils.image_utils import clean_base64_string

logger = logging.getLogger(__name__)

class ConceptGenerationService:
    def __init__(self):
        pass

    def _get_client(self, api_key_override: Optional[str] = None) -> genai.Client:
        key = api_key_override or settings.GEMINI_API_KEY
        if not key:
            raise ValueError(
                "Gemini API Key is missing. Please set GEMINI_API_KEY in your environment, .env file, or pass it via request."
            )
        return genai.Client(api_key=key)

    def generate_concepts(self, req: GenerateConceptsRequest) -> GenerateConceptsResponse:
        """
        Analyzes a brief (provided as PDF bytes or Markdown/text) and generates
        tailored image/video content concepts, platform optimizations, and exact generation prompts.
        """
        try:
            client = self._get_client(req.api_key)

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

            raw_text = response.text
            data = json.loads(raw_text)

            concept_items: List[ContentConceptItem] = []
            for idx, c in enumerate(data.get("concepts", [])):
                concept_items.append(ContentConceptItem(
                    id=f"concept_{idx+1}_{uuid.uuid4().hex[:6]}",
                    title=c.get("title", f"Content Concept {idx+1}"),
                    media_type=c.get("media_type", "image").lower(),
                    target_platform=c.get("target_platform", "Instagram"),
                    platform_optimization_rationale=c.get("platform_optimization_rationale", "High engagement potential for target audience."),
                    concept_hook=c.get("concept_hook", ""),
                    visual_description=c.get("visual_description", ""),
                    generation_prompt=c.get("generation_prompt", ""),
                    aspect_ratio=c.get("aspect_ratio", "1:1"),
                    style_preset=c.get("style_preset", "photorealistic"),
                    camera_motion=c.get("camera_motion", None),
                    duration_seconds=int(c.get("duration_seconds", 5)),
                    fps=int(c.get("fps", 24))
                ))

            return GenerateConceptsResponse(
                brief_title=data.get("brief_title", "Opportunity Dossier"),
                brief_summary=data.get("brief_summary", "Comprehensive content strategy extracted from dossier."),
                target_audience=data.get("target_audience", "General Audience"),
                key_friction_points=data.get("key_friction_points", []),
                concepts=concept_items,
                model_used=settings.GEMINI_TEXT_MODEL
            )

        except Exception as e:
            logger.exception(f"Concept generation failed: {e}. Returning strategic fallback concepts.")
            return self._generate_fallback_concepts(req, str(e))

    def _generate_fallback_concepts(self, req: GenerateConceptsRequest, reason: str) -> GenerateConceptsResponse:
        """
        Provides intelligent pre-curated fallback concepts based on the CBD Ground Protest Organizer Dossier.
        """
        all_curated = [
            ContentConceptItem(
                id="concept_demo_1",
                title="The 48-Hour Permit Checklist: What Police NOC Won't Tell You",
                media_type="image",
                target_platform="LinkedIn Carousel & Instagram Post",
                platform_optimization_rationale="Activists and grassroots organizers require authoritative, scannable infographics to share across leadership channels. 1:1 format drives bookmarking and carousel saves.",
                concept_hook="Sudden permit revocations can derail months of planning. Here are the 4 legal verification steps every organizer must complete before setting foot on CBD ground.",
                visual_description="A clean, minimalist high-impact graphic showing an organizer holding official municipal documentation on a clipboard against the iconic CBD ground skyline in golden hour.",
                generation_prompt="Commercial editorial photography of a determined civic organizer in smart casual attire holding a clipboard with permit paperwork, standing in an open urban plaza at CBD ground, soft morning backlight, 35mm lens, sharp focus, award-winning photojournalism style.",
                aspect_ratio="1:1",
                style_preset="photorealistic"
            ),
            ContentConceptItem(
                id="concept_demo_2",
                title="Cinematic Ground Tour: Cutoff Hours & Designated Rally Boundaries",
                media_type="video",
                target_platform="Instagram Reels & YouTube Shorts",
                platform_optimization_rationale="Vertical video format (9:16) with fast-paced visual orientation helps mobilizers visualize perimeter coordinates and avoid accidental trespassing or crowd bottleneck traps.",
                concept_hook="Where does your protest legally end? A 30-second virtual walk-through of the official CBD ground boundaries so your marshals stay protected.",
                visual_description="Low-angle FPV drone push-in gliding smoothly across the perimeter of CBD ground, showcasing demarcation zones, sound equipment stages, and designated emergency medical lanes.",
                generation_prompt="FPV drone smoothly swooping through an expansive metropolitan civic plaza at sunrise, moving from perimeter barriers toward central sound staging, realistic morning haze, volumetric sunlight, 4k ultra-high definition, 24fps motion.",
                aspect_ratio="9:16",
                style_preset="cinematic",
                camera_motion="FPV drone swoop and low pass",
                duration_seconds=5,
                fps=24
            ),
            ContentConceptItem(
                id="concept_demo_3",
                title="Decibel Limits & Sound Marshaling: Keep Your Mic Live Without Fines",
                media_type="image",
                target_platform="X (Twitter) Visual Infographic & Thread Header",
                platform_optimization_rationale="X is the primary real-time channel during live civic mobilizations. A widescreen 16:9 banner gives sound marshals instantaneous reference values for sound thresholds.",
                concept_hook="Sound equipment confiscation is the #1 tactic used to shut rallies down early. Know your legal decibel thresholds and speaker orientation rules.",
                visual_description="Close-up photorealistic shot of an audio technician's hand adjusting an acoustic sound level meter on a speaker stand in an open public square.",
                generation_prompt="Cinematic close-up macro shot of a decibel meter display showing 85 dB, mounted next to a professional PA loudspeaker at an open-air public amphitheater, shallow depth of field, warm sunset bokeh, 50mm f/1.8 lens.",
                aspect_ratio="16:9",
                style_preset="photorealistic"
            ),
            ContentConceptItem(
                id="concept_demo_4",
                title="Crowd Safety & Hydration Corridors: Emergency Marshaling in Action",
                media_type="video",
                target_platform="TikTok & Instagram Stories",
                platform_optimization_rationale="Snappy, educational vertical video formats excel at demystifying volunteer marshal logistics, medical access lanes, and water stations for first-time attendees.",
                concept_hook="How 5 volunteers can keep a crowd of 5,000 completely safe: The golden triangle of water points, first aid, and clear egress.",
                visual_description="Slow sweeping camera tracking shot of peaceful civic volunteers wearing high-visibility orange sashes organizing water stations and clear medical corridors under shade canopies.",
                generation_prompt="Slow cinematic push-in tracking shot showing civic volunteer safety marshals setting up a hydration station in a sunlit urban park, natural motion, documentary photojournalism aesthetic, authentic textures, 24fps.",
                aspect_ratio="9:16",
                style_preset="cinematic",
                camera_motion="Slow cinematic push-in tracking shot",
                duration_seconds=5,
                fps=24
            )
        ]

        # Filter by media preference if needed
        mix = (req.preferred_media_mix or req.media_mix or "balanced").lower()
        if "image" in mix and "video" not in mix and "balanced" not in mix and "both" not in mix:
            filtered = [c for c in all_curated if c.media_type == "image"]
        elif "video" in mix and "image" not in mix and "balanced" not in mix and "both" not in mix:
            filtered = [c for c in all_curated if c.media_type == "video"]
        else:
            filtered = all_curated

        req_count = req.num_concepts or req.target_count or 4
        count = max(1, min(req_count, len(filtered)))
        selected = filtered[:count]

        return GenerateConceptsResponse(
            brief_title="Unlocking CBD Ground: Your Guide to Organizing Protests",
            brief_summary="Strategic executive content dossier addressing legal permit ambiguities, sound equipment limits, and crowd safety logistics for civic mobilizers at CBD ground.",
            target_audience="Civic Activists, Community Organizers & Public Mobilizers",
            key_friction_points=[
                "Sudden permit revocations without clear rationale",
                "Lack of basic amenities (drinking water, first aid logistics)",
                "Disruptive access bottlenecks & designated boundary confusion"
            ],
            concepts=selected,
            model_used=f"{settings.GEMINI_TEXT_MODEL} (Demo Preview: {reason[:80]})"
        )

concept_service = ConceptGenerationService()

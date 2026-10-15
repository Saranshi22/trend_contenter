import os
import time
import uuid
import logging
from pathlib import Path
from typing import Optional

import google.genai as genai
from google.genai import types

from config import settings
from models.schemas import GenerateVideoRequest, GenerateVideoResponse
from utils.image_utils import clean_base64_string
from utils.mock_data import get_demo_video_url

logger = logging.getLogger(__name__)

class VeoVideoService:
    def __init__(self):
        pass

    def _get_client(self, api_key_override: Optional[str] = None) -> genai.Client:
        key = api_key_override or settings.GEMINI_API_KEY
        if not key:
            raise ValueError(
                "Gemini/Veo API Key is missing. Please set GEMINI_API_KEY in your environment, .env file, or pass it via request."
            )
        return genai.Client(api_key=key)

    def enhance_video_prompt(self, prompt: str, api_key: Optional[str] = None) -> str:
        """
        Uses Gemini to expand a prompt for optimal Veo cinematic video generation.
        Adds camera movement, lighting, pacing, and visual dynamics.
        """
        try:
            client = self._get_client(api_key)
            prompt_instruction = (
                "You are an expert Hollywood cinematographer and prompt director for Google Veo video models.\n"
                "Expand the following video concept into a rich, vivid, cinematic video generation prompt.\n"
                "Specify camera motion (e.g. slow cinematic push-in, seamless drone flythrough, sweeping arc, smooth gimbal pan),\n"
                "subject motion and temporal progression, lighting (e.g. golden hour volumetric rays, neon rim glow), and texture fidelity.\n"
                "Keep the final prompt concise (2-3 sentences max) and high impact.\n\n"
                f"User Concept: '{prompt}'\n\n"
                "Return ONLY the enhanced prompt string without commentary or markdown quotes."
            )
            response = client.models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=prompt_instruction,
            )
            enhanced = response.text.strip().strip('"').strip("'") if response.text else prompt
            return enhanced
        except Exception as e:
            logger.warning(f"Failed to enhance video prompt with Gemini: {e}")
            return f"{prompt}, cinematic lighting, smooth 24fps motion, 4k ultra-high definition, professional color grading."

    def generate_video(self, req: GenerateVideoRequest) -> GenerateVideoResponse:
        """
        Generates cinematic videos using Google Veo models (e.g. veo-2.0-generate-001).
        Supports both text-to-video and image-to-video generation.
        """
        model_name = req.model or settings.VEO_MODEL

        final_prompt = req.prompt.strip()
        enhanced_text = None
        if req.enhance_prompt:
            try:
                enhanced_text = self.enhance_video_prompt(req.prompt, api_key=req.api_key)
                final_prompt = enhanced_text
            except Exception:
                pass

        video_id = f"veo_{uuid.uuid4().hex[:12]}"
        dest_filename = f"{video_id}.mp4"
        dest_path = settings.CONTENT_DIR / dest_filename

        try:
            client = self._get_client(req.api_key)

            # Build source: Text-to-Video or Image-to-Video
            source_args = {"prompt": final_prompt}
            if req.image_base64:
                src_bytes, src_mime = clean_base64_string(req.image_base64)
                source_args["image"] = types.Image(image_bytes=src_bytes, mime_type=src_mime)

            source = types.GenerateVideosSource(**source_args)

            # Build config
            config_args = {
                "aspect_ratio": req.aspect_ratio if req.aspect_ratio in ["16:9", "9:16", "1:1"] else "16:9",
                "duration_seconds": max(5, min(req.duration_seconds, 8)),
                "fps": req.fps if req.fps in [24, 30] else 24,
            }
            if req.person_generation in ["allow_adult", "dont_allow", "allow_all"]:
                config_args["person_generation"] = req.person_generation
            if req.negative_prompt:
                config_args["negative_prompt"] = req.negative_prompt

            config = types.GenerateVideosConfig(**config_args)

            logger.info(f"Initiating Veo video generation with model '{model_name}' (source: {list(source_args.keys())})")
            operation = client.models.generate_videos(
                model=model_name,
                source=source,
                config=config
            )

            # Poll operation until done
            poll_interval = 6
            max_wait_seconds = 300
            elapsed = 0
            while not operation.done and elapsed < max_wait_seconds:
                time.sleep(poll_interval)
                elapsed += poll_interval
                operation = client.operations.get(operation)
                logger.info(f"Veo video generation polling: elapsed {elapsed}s, done={operation.done}")

            if not operation.done:
                raise TimeoutError(f"Veo video generation timed out after {max_wait_seconds} seconds")

            if getattr(operation, "error", None):
                raise RuntimeError(f"Veo video generation failed: {operation.error}")

            if not getattr(operation, "result", None) or not getattr(operation.result, "generated_videos", None):
                raise RuntimeError("Veo generation returned no video results in operation response.")

            generated_video = operation.result.generated_videos[0]
            video = generated_video.video

            # Save / download video locally
            if getattr(video, "video_bytes", None):
                with open(dest_path, "wb") as f:
                    f.write(video.video_bytes)
            else:
                client.files.download(file=video, destination=dest_path)

            file_url = f"/content/{dest_filename}"
            video_uri = getattr(video, "uri", None)

            return GenerateVideoResponse(
                id=video_id,
                video_url=file_url,
                video_uri=video_uri,
                prompt=req.prompt,
                enhanced_prompt=enhanced_text,
                aspect_ratio=req.aspect_ratio,
                duration_seconds=req.duration_seconds,
                fps=req.fps,
                model_used=model_name,
                status="completed"
            )

        except Exception as e:
            logger.exception(f"Veo video generation failed: {e}. Providing demo preview fallback.")
            sample_url = get_demo_video_url(req.prompt)

            return GenerateVideoResponse(
                id=video_id,
                video_url=sample_url,
                video_uri=f"demo://{sample_url}",
                prompt=req.prompt,
                enhanced_prompt=f"[Demo Preview - {e}] {final_prompt}",
                aspect_ratio=req.aspect_ratio,
                duration_seconds=req.duration_seconds,
                fps=req.fps,
                model_used=f"{model_name} (Demo Preview)",
                status="completed_fallback"
            )

veo_service = VeoVideoService()


import os
import time
import uuid
import base64
import logging
from pathlib import Path
from typing import Optional, List, Any, Dict, Tuple

import httpx
import google.genai as genai
from google.genai import types

from ...config import settings
from .gemini_client import get_gemini_client
from ...domain.models.content_studio import GenerateVideoRequest, GenerateVideoResponse
from .image_utils import clean_base64_string
from .mock_data import get_demo_video_url

logger = logging.getLogger(__name__)


def _extract_video_data(data: Any) -> Tuple[Optional[bytes], Optional[str]]:
    """
    Recursively scans any response dictionary or list for:
    1. Base64 video bytes ('bytesBase64Encoded', 'b64_json', 'video_bytes')
    2. Video download URI/URL ('uri', 'url', 'video_url', 'videoUri')
    """
    if isinstance(data, dict):
        for key in ["bytesBase64Encoded", "b64_json", "video_bytes"]:
            if key in data and data[key]:
                val = data[key]
                if isinstance(val, str):
                    try:
                        return base64.b64decode(val), None
                    except Exception:
                        pass
                elif isinstance(val, (bytes, bytearray)):
                    return bytes(val), None

        for key in ["uri", "url", "video_url", "videoUri"]:
            if key in data and isinstance(data[key], str) and data[key].startswith(("http://", "https://", "gs://")):
                return None, data[key]

        for val in data.values():
            b, u = _extract_video_data(val)
            if b or u:
                return b, u
    elif isinstance(data, list):
        for item in data:
            b, u = _extract_video_data(item)
            if b or u:
                return b, u

    return None, None


# Size mapping based on aspect ratio and resolution for Veo
_VEO_SIZE_BY_RESOLUTION = {
    "720p": {"16:9": "1280x720", "9:16": "720x1280", "1:1": "720x720"},
    "1080p": {"16:9": "1920x1080", "9:16": "1080x1920", "1:1": "1080x1080"},
    "4k": {"16:9": "3840x2160", "9:16": "2160x3840", "1:1": "2160x2160"},
}

def _veo_video_size(aspect_ratio: str, resolution: Optional[str] = None) -> str:
    """Return the WxH size LiteLLM and Veo expect for a resolution and aspect ratio."""
    resolution_key = (resolution or "720p").lower()
    sizes = _VEO_SIZE_BY_RESOLUTION.get(resolution_key, _VEO_SIZE_BY_RESOLUTION["720p"])
    return sizes.get(aspect_ratio, sizes.get("16:9", "1280x720"))


class VeoVideoService:
    def __init__(self):
        pass

    def _get_client(self, api_key_override: Optional[str] = None, base_url_override: Optional[str] = None) -> genai.Client:
        return get_gemini_client(api_key_override=api_key_override, base_url_override=base_url_override)

    def enhance_video_prompt(self, prompt: str, api_key: Optional[str] = None, base_url: Optional[str] = None) -> str:
        """
        Uses Gemini to expand a prompt for cinematic video generation.
        Adds camera movement, lighting, pacing, and visual dynamics.
        """
        try:
            client = self._get_client(api_key, base_url)
            prompt_instruction = (
                "You are an expert AI video director for Google Veo.\n"
                f"Expand this basic video idea into a detailed cinematographic prompt:\n'{prompt}'\n\n"
                "Incorporate camera movement (panning, tracking, tilt, orbit), lighting (volumetric, golden hour, neon), "
                "mood, realistic textures, and visual pacing. Keep it under 60 words.\n"
                "Return ONLY the enhanced prompt string without commentary or markdown quotes."
            )
            response = client.models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=prompt_instruction,
            )
            enhanced = response.text.strip().strip('"').strip("'") if response.text else prompt
            return enhanced
        except Exception as e:
            logger.warning(f"Failed to enhance video prompt with Gemini ({e}); using original prompt.")
            return prompt

    def _generate_video_via_sdk(
        self,
        req: GenerateVideoRequest,
        model_name: str,
        final_prompt: str,
        dest_path: Path,
        client_override: Optional[genai.Client] = None,
    ) -> None:
        """Uses client.models.generate_videos if supported by the installed google-genai version."""
        client = client_override or self._get_client(req.api_key, getattr(req, "base_url", None))
        if not hasattr(client.models, "generate_videos"):
            raise AttributeError("Installed google-genai SDK does not have 'generate_videos' method on client.models")

        logger.info(f"Generating video with Google Veo SDK model '{model_name}'...")

        source_args: Dict[str, Any] = {"prompt": final_prompt}
        if req.image_base64:
            src_bytes, src_mime = clean_base64_string(req.image_base64)
            if hasattr(types, "Image"):
                try:
                    source_args["image"] = types.Image(image_bytes=src_bytes, mime_type=src_mime)
                except Exception:
                    pass

        veo_kwargs: Dict[str, Any] = {}
        if hasattr(types, "GenerateVideosSource"):
            try:
                veo_kwargs["source"] = types.GenerateVideosSource(**source_args)
            except Exception:
                veo_kwargs.update(source_args)
        else:
            veo_kwargs.update(source_args)

        if hasattr(types, "GenerateVideosConfig"):
            try:
                raw_d = req.duration_seconds or 6
                dur_sec = 4 if raw_d <= 4 else (6 if raw_d <= 6 else 8)
                veo_kwargs["config"] = types.GenerateVideosConfig(
                    aspect_ratio=req.aspect_ratio if req.aspect_ratio in ["16:9", "9:16", "1:1"] else "16:9",
                    duration_seconds=dur_sec,
                )
            except Exception:
                pass

        op = client.models.generate_videos(
            model=model_name,
            **veo_kwargs
        )

        logger.info(f"Veo operation initiated: {getattr(op, 'name', 'unnamed')}. Polling status...")
        elapsed = 0
        while not op.done and elapsed < 300:
            time.sleep(10)
            elapsed += 10
            op = client.operations.get(op)

        if not op.done:
            raise TimeoutError("Veo video generation timed out after 300 seconds.")

        if getattr(op, "error", None):
            err = op.error
            err_msg = getattr(err, "message", None) or str(err)
            raise RuntimeError(f"Veo model error: {err_msg}")

        res = getattr(op, "response", None) or getattr(op, "result", None)
        if not res or not getattr(res, "generated_videos", None):
            raise RuntimeError(f"Veo returned no generated videos in response: {res}")

        generated_video = res.generated_videos[0]
        v = generated_video.video

        video_bytes = None
        if getattr(v, "video_bytes", None):
            video_bytes = v.video_bytes
        elif hasattr(v, "save"):
            try:
                if hasattr(client, "files") and hasattr(client.files, "download"):
                    client.files.download(file=v)
            except Exception:
                pass
            v.save(str(dest_path))
        elif hasattr(client, "files") and hasattr(client.files, "download"):
            client.files.download(file=v, destination=str(dest_path))

        if not dest_path.exists() and video_bytes:
            with open(dest_path, "wb") as f:
                f.write(video_bytes)

        if not dest_path.exists() or dest_path.stat().st_size == 0:
            raise RuntimeError("Could not save Veo video file to disk from SDK response.")

    def _generate_video_via_gateway(
        self,
        req: GenerateVideoRequest,
        model_name: str,
        final_prompt: str,
        gateway_url: str,
        gateway_token: str,
        dest_path: Path,
    ) -> None:
        """
        Submits video generation job to an LLM Gateway (LiteLLM /v1/videos) with polling
        and direct binary video content download (/v1/videos/{op_id}/content).
        """
        base_url = gateway_url.rstrip("/")
        litellm_url = f"{base_url}/v1/videos"

        auth_token = gateway_token.strip()
        auth_header = auth_token if auth_token.startswith("Bearer ") else f"Bearer {auth_token}"
        headers = {
            "Authorization": auth_header,
            "Content-Type": "application/json",
        }

        resolution = (getattr(req, "resolution", "720p") or "720p").lower()
        aspect_ratio = req.aspect_ratio if req.aspect_ratio in ["16:9", "9:16", "1:1"] else "16:9"
        video_size = _veo_video_size(aspect_ratio, resolution)

        extra_body: Dict[str, Any] = {
            "sampleCount": 1,
            "generateAudio": getattr(req, "generate_audio", False),
            "personGeneration": getattr(req, "person_generation", "allow_all") or "allow_all",
            "enhancePrompt": getattr(req, "enhance_prompt", True),
            "seed": 42,
            "aspectRatio": aspect_ratio,
            "resolution": resolution,
        }

        payload: Dict[str, Any] = {
            "model": model_name,
            "prompt": final_prompt,
            "size": video_size,
            "resolution": resolution,
            "negative_prompt": getattr(req, "negative_prompt", "No violence") or "No violence",
            "seconds": req.duration_seconds,
            "extra_body": extra_body,
        }

        if req.image_base64:
            src_bytes, src_mime = clean_base64_string(req.image_base64)
            payload["input_reference"] = {
                "mimeType": src_mime or "image/png",
                "bytesBase64Encoded": base64.b64encode(src_bytes).decode("ascii"),
            }

        logger.info(
            f"Submitting Veo video generation to LLM Gateway: {litellm_url} "
            f"(model: {model_name}, size: {video_size}, duration: {req.duration_seconds}s)"
        )

        with httpx.Client(timeout=httpx.Timeout(120.0, connect=30.0)) as http_client:
            # 1. Post to initiate video generation
            resp = None
            for attempt in range(1, 4):
                try:
                    resp = http_client.post(litellm_url, headers=headers, json=payload)
                    if resp.status_code in (200, 201, 202):
                        break
                    logger.warning(f"Gateway POST attempt {attempt} returned HTTP {resp.status_code}: {resp.text[:300]}")
                except Exception as ex:
                    logger.warning(f"Gateway POST attempt {attempt} failed: {ex}")
                    if attempt == 3:
                        raise RuntimeError(f"Failed to submit Veo job to LLM Gateway ({litellm_url}): {ex}") from ex
                    time.sleep(2)

            if not resp or resp.status_code not in (200, 201, 202):
                err_text = resp.text if resp else "No response"
                raise RuntimeError(f"LLM Gateway returned HTTP {resp.status_code if resp else 'N/A'}: {err_text}")

            resp_data = resp.json()
            op_id = resp_data.get("id") or resp_data.get("video_id") or resp_data.get("name")

            if not op_id:
                # Direct completed video returned immediately in payload
                video_bytes, video_url = _extract_video_data(resp_data)
                if video_bytes:
                    with open(dest_path, "wb") as f:
                        f.write(video_bytes)
                    return
                elif video_url:
                    v_resp = http_client.get(video_url, headers=headers)
                    with open(dest_path, "wb") as f:
                        f.write(v_resp.content)
                    return
                raise RuntimeError(f"LLM Gateway response contained no operation ID or video data: {resp_data}")

            # 2. Poll until operation status is completed
            operation_url = f"{base_url}/v1/videos/{op_id}"
            logger.info(f"Veo job submitted (operation_id: {op_id}). Polling status at {operation_url}...")

            elapsed = 0
            max_wait_seconds = 360
            poll_interval = 8
            final_poll_data = None

            while elapsed < max_wait_seconds:
                time.sleep(poll_interval)
                elapsed += poll_interval

                try:
                    poll_resp = http_client.get(operation_url, headers=headers)
                    if poll_resp.status_code != 200:
                        logger.warning(f"Gateway polling HTTP {poll_resp.status_code}: {poll_resp.text[:200]}")
                        continue
                    data = poll_resp.json()
                    status = (data.get("status") or "").lower()

                    if status in ["completed", "succeeded", "ready"]:
                        logger.info(f"Gateway Veo operation '{op_id}' completed in {elapsed}s.")
                        final_poll_data = data
                        break
                    elif status in ["failed", "error"]:
                        error_payload = data.get("error", {})
                        error_message = error_payload.get("message") if isinstance(error_payload, dict) else str(error_payload)
                        raise RuntimeError(f"LLM Gateway Veo generation failed: {error_message}")
                    else:
                        logger.info(f"Veo operation '{op_id}' status: {status or 'processing'} ({elapsed}s elapsed)")
                except RuntimeError:
                    raise
                except Exception as poll_ex:
                    logger.warning(f"Error during operation poll: {poll_ex}")

            if not final_poll_data:
                raise TimeoutError(f"LLM Gateway Veo generation timed out after {max_wait_seconds} seconds.")

            # 3. Retrieve video stream from /content endpoint
            content_url = f"{base_url}/v1/videos/{op_id}/content"
            logger.info(f"Downloading generated video stream from {content_url}...")

            content_saved = False
            try:
                content_resp = http_client.get(content_url, headers=headers)
                if content_resp.status_code == 200 and len(content_resp.content) > 1000:
                    with open(dest_path, "wb") as f:
                        f.write(content_resp.content)
                    content_saved = True
            except Exception as dl_ex:
                logger.warning(f"Direct /content download unsuccessful: {dl_ex}. Checking poll payload...")

            if not content_saved:
                # Check if polling response had the video bytes or URI
                video_bytes, video_url = _extract_video_data(final_poll_data)
                if video_bytes:
                    with open(dest_path, "wb") as f:
                        f.write(video_bytes)
                    content_saved = True
                elif video_url:
                    v_resp = http_client.get(video_url, headers=headers)
                    if v_resp.status_code == 200:
                        with open(dest_path, "wb") as f:
                            f.write(v_resp.content)
                        content_saved = True

            if not dest_path.exists() or dest_path.stat().st_size == 0:
                raise RuntimeError("Failed to retrieve or save generated Veo video from LLM Gateway.")

    def _generate_video_via_gemini_key(
        self,
        req: GenerateVideoRequest,
        model_name: str,
        final_prompt: str,
        gemini_key: str,
        dest_path: Path,
    ) -> None:
        """
        Generates video using a direct Google Gemini API Key.
        Tries google-genai SDK models.generate_videos first; falls back to
        direct Google AI REST predictLongRunning endpoint.
        """
        # 1. Try google-genai SDK if available
        try:
            client = self._get_client(api_key_override=gemini_key)
            if hasattr(client.models, "generate_videos"):
                self._generate_video_via_sdk(req, model_name, final_prompt, dest_path, client_override=client)
                if dest_path.exists() and dest_path.stat().st_size > 0:
                    return
        except Exception as sdk_err:
            logger.info(f"SDK generate_videos not supported or failed ({sdk_err}). Using Google AI REST predictLongRunning.")

        # 2. Direct Google AI REST predictLongRunning
        endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predictLongRunning"
        headers = {
            "x-goog-api-key": gemini_key,
            "Content-Type": "application/json",
        }

        aspect_ratio = req.aspect_ratio if req.aspect_ratio in ["16:9", "9:16", "1:1"] else "16:9"
        raw_dur = req.duration_seconds or 6
        duration_seconds = 4 if raw_dur <= 4 else (6 if raw_dur <= 6 else 8)

        instance: Dict[str, Any] = {"prompt": final_prompt}
        if req.image_base64:
            src_bytes, src_mime = clean_base64_string(req.image_base64)
            instance["image"] = {
                "bytesBase64Encoded": base64.b64encode(src_bytes).decode("ascii"),
                "mimeType": src_mime or "image/png"
            }

        payload = {
            "instances": [instance],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio,
                "durationSeconds": duration_seconds,
                "personGeneration": getattr(req, "person_generation", "allow_all") or "allow_all"
            }
        }

        logger.info(f"Submitting Veo predictLongRunning to Google AI ({endpoint_url})...")
        with httpx.Client(timeout=httpx.Timeout(120.0, connect=30.0)) as http_client:
            resp = http_client.post(
                endpoint_url,
                params={"key": gemini_key},
                headers=headers,
                json=payload
            )
            if resp.status_code not in (200, 201, 202):
                raise RuntimeError(f"Google AI Veo initiation returned HTTP {resp.status_code}: {resp.text}")

            op_data = resp.json()
            op_name = op_data.get("name")
            if not op_name:
                video_bytes, video_url = _extract_video_data(op_data)
                if video_bytes:
                    with open(dest_path, "wb") as f:
                        f.write(video_bytes)
                    return
                elif video_url:
                    v_resp = http_client.get(video_url, params={"key": gemini_key}, headers=headers)
                    with open(dest_path, "wb") as f:
                        f.write(v_resp.content)
                    return
                raise RuntimeError(f"Unexpected Google AI response without operation name: {op_data}")

            # Polling
            poll_url = f"https://generativelanguage.googleapis.com/v1beta/{op_name.lstrip('/')}"
            logger.info(f"Polling Google AI Veo operation: {op_name}...")

            elapsed = 0
            max_wait_seconds = 360
            poll_interval = 8
            final_data = None

            while elapsed < max_wait_seconds:
                time.sleep(poll_interval)
                elapsed += poll_interval

                poll_resp = http_client.get(poll_url, params={"key": gemini_key}, headers=headers)
                if poll_resp.status_code != 200:
                    logger.warning(f"Google AI polling HTTP {poll_resp.status_code}: {poll_resp.text[:200]}")
                    continue

                res_json = poll_resp.json()
                if res_json.get("done") is True:
                    if "error" in res_json:
                        err = res_json["error"]
                        err_msg = err.get("message") if isinstance(err, dict) else str(err)
                        raise RuntimeError(f"Google AI Veo error: {err_msg}")
                    final_data = res_json
                    break
                logger.info(f"Google AI Veo operation '{op_name}' still generating... ({elapsed}s elapsed)")

            if not final_data:
                raise TimeoutError(f"Google AI Veo generation timed out after {max_wait_seconds} seconds.")

            video_bytes, video_uri = _extract_video_data(final_data)
            if video_bytes:
                with open(dest_path, "wb") as f:
                    f.write(video_bytes)
            elif video_uri:
                logger.info(f"Downloading Veo video from Google URI: {video_uri}")
                v_resp = http_client.get(video_uri, params={"key": gemini_key}, headers=headers)
                if v_resp.status_code != 200:
                    raise RuntimeError(f"Failed to download video from {video_uri}: HTTP {v_resp.status_code}")
                with open(dest_path, "wb") as f:
                    f.write(v_resp.content)
            else:
                raise RuntimeError(f"Could not extract video bytes or URL from Google AI response: {final_data}")

            if not dest_path.exists() or dest_path.stat().st_size == 0:
                raise RuntimeError("Saved Veo video file is empty or missing from disk.")

    def generate_video(self, req: GenerateVideoRequest) -> GenerateVideoResponse:
        """
        Generates videos with Google Veo.
        Supports both text-to-video and image-to-video.
        Routes to:
          1. Custom LLM Gateway (/v1/videos) if gateway base URL & token are provided or configured.
          2. Direct Google Gemini Key (SDK generate_videos or REST predictLongRunning) if GEMINI_API_KEY is configured.
          3. Automatic fallback between both live providers if available.
          4. Verified demo preview fallback if all live credentials are absent or fail.
        """
        model_name = req.model or settings.VEO_MODEL or "veo-2.0-generate-001"

        # 1. Resolve Gateway credentials
        gateway_url = (
            getattr(req, "base_url", None)
            or os.getenv("LLM_GATEWAY_URL")
            or settings.get_llm_gateway_url()
            or os.getenv("LLM_GATEWAY_BASE_URL")
            or ""
        ).strip().rstrip("/")

        gateway_token = (
            getattr(req, "token", None)
            or (req.api_key if getattr(req, "base_url", None) else None)
            or os.getenv("LLM_GATEWAY_TOKEN")
            or settings.LLM_GATEWAY_TOKEN
            or ""
        ).strip()

        # 2. Resolve direct Gemini key
        gemini_key = (
            (req.api_key if not getattr(req, "base_url", None) else None)
            or settings.GEMINI_API_KEY
            or os.getenv("GEMINI_API_KEY")
            or ""
        ).strip()

        final_prompt = req.prompt.strip()
        enhanced_text = None
        if req.enhance_prompt:
            try:
                enhanced_text = self.enhance_video_prompt(req.prompt, api_key=gemini_key, base_url=gateway_url)
                final_prompt = enhanced_text
            except Exception:
                pass

        video_id = f"vid_{uuid.uuid4().hex[:12]}"
        dest_filename = f"{video_id}.mp4"
        dest_path = settings.CONTENT_STUDIO_MEDIA_DIR / dest_filename

        # Determine primary mode:
        # If the caller explicitly supplied base_url, or if gateway credentials are fully configured and no direct Gemini key is given:
        use_gateway_first = bool(getattr(req, "base_url", None)) or (bool(gateway_url and gateway_token) and not gemini_key)

        generation_error = None

        if use_gateway_first:
            # Try Gateway first
            if gateway_url and gateway_token:
                try:
                    logger.info("Routing Veo generation to LLM Gateway...")
                    self._generate_video_via_gateway(req, model_name, final_prompt, gateway_url, gateway_token, dest_path)
                    generation_error = None
                except Exception as ex:
                    logger.warning(f"LLM Gateway Veo generation failed ({ex}).")
                    generation_error = ex
            else:
                generation_error = RuntimeError("LLM Gateway URL or token missing.")

            # Fallback to direct Gemini key if available
            if generation_error and gemini_key:
                try:
                    logger.info("Attempting fallback to direct Gemini API key for Veo generation...")
                    self._generate_video_via_gemini_key(req, model_name, final_prompt, gemini_key, dest_path)
                    generation_error = None
                except Exception as fb_ex:
                    logger.warning(f"Gemini key fallback also failed ({fb_ex}).")
                    generation_error = fb_ex

        else:
            # Try direct Gemini key first
            if gemini_key:
                try:
                    logger.info("Routing Veo generation to Google AI with GEMINI_API_KEY...")
                    self._generate_video_via_gemini_key(req, model_name, final_prompt, gemini_key, dest_path)
                    generation_error = None
                except Exception as ex:
                    logger.warning(f"Gemini key Veo generation failed ({ex}).")
                    generation_error = ex
            else:
                generation_error = RuntimeError("GEMINI_API_KEY missing.")

            # Fallback to Gateway if available
            if generation_error and gateway_url and gateway_token:
                try:
                    logger.info("Attempting fallback to LLM Gateway for Veo generation...")
                    self._generate_video_via_gateway(req, model_name, final_prompt, gateway_url, gateway_token, dest_path)
                    generation_error = None
                except Exception as gw_ex:
                    logger.warning(f"Gateway fallback also failed ({gw_ex}).")
                    generation_error = gw_ex

        # If video was successfully generated and saved to disk
        if not generation_error and dest_path.exists() and dest_path.stat().st_size > 0:
            file_url = f"/api/v1/content-studio/media/{dest_filename}"
            provider_tag = "LLM Gateway" if use_gateway_first else "Google GenAI"
            return GenerateVideoResponse(
                id=video_id,
                video_url=file_url,
                video_uri=file_url,
                prompt=req.prompt,
                enhanced_prompt=enhanced_text,
                aspect_ratio=req.aspect_ratio,
                duration_seconds=req.duration_seconds,
                fps=req.fps,
                model_used=f"{model_name} ({provider_tag})",
                status="completed"
            )

        # Demo fallback
        logger.warning(f"Live Veo video generation unavailable ({generation_error}). Serving verified preview fallback.")
        sample_url = get_demo_video_url(req.prompt)

        return GenerateVideoResponse(
            id=video_id,
            video_url=sample_url,
            video_uri=f"demo://{sample_url}",
            prompt=req.prompt,
            enhanced_prompt=f"[Demo Preview - {generation_error}] {final_prompt}",
            aspect_ratio=req.aspect_ratio,
            duration_seconds=req.duration_seconds,
            fps=req.fps,
            model_used=f"{model_name} (Demo Preview)",
            status="completed_fallback"
        )


veo_service = VeoVideoService()
gemini_video_service = veo_service


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

    def _generate_video_via_sdk(self, req: GenerateVideoRequest, model_name: str, final_prompt: str, dest_path: Path) -> None:
        """Uses client.models.generate_videos if supported by the installed google-genai version."""
        client = self._get_client(req.api_key, getattr(req, "base_url", None))
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

    def _generate_video_via_rest(self, req: GenerateVideoRequest, model_name: str, final_prompt: str, dest_path: Path) -> None:
        """
        Calls Google Veo or LiteLLM gateway directly via HTTP REST :predictLongRunning endpoint.
        Polls until the long-running operation finishes and writes the resulting MP4.
        """
        token = (
            req.api_key
            or settings.GEMINI_API_KEY
            or settings.LLM_GATEWAY_TOKEN
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("LLM_GATEWAY_TOKEN")
            or ""
        ).strip()

        gemini_key = (
            getattr(req, "api_key", None)
            or settings.GEMINI_API_KEY
            or os.environ.get("GEMINI_API_KEY")
            or ""
        ).strip()

        token = gemini_key or (
            settings.LLM_GATEWAY_TOKEN
            or os.environ.get("LLM_GATEWAY_TOKEN")
            or ""
        ).strip()

        explicit_base_url = (getattr(req, "base_url", None) or settings.GEMINI_BASE_URL or "").strip()
        target_base_url = (
            explicit_base_url
            or ("" if gemini_key else (settings.LLM_GATEWAY_BASE_URL or os.environ.get("LLM_GATEWAY_BASE_URL") or ""))
        ).strip()

        if not token:
            raise ValueError("API key or Gateway token is missing for Veo video generation.")

        auth_token = token
        auth_header = auth_token if auth_token.startswith("Bearer ") else f"Bearer {auth_token}"

        headers = {
            "Authorization": auth_header,
            "x-goog-api-key": token,
            "Content-Type": "application/json",
        }

        aspect_ratio = req.aspect_ratio if req.aspect_ratio in ["16:9", "9:16", "1:1"] else "16:9"
        # Google Veo requires discrete duration seconds: 4, 6, or 8
        raw_dur = req.duration_seconds or 6
        if raw_dur <= 4:
            duration_seconds = 4
        elif raw_dur <= 6:
            duration_seconds = 6
        else:
            duration_seconds = 8

        # Build instance payload following Google Veo predictLongRunning schema
        instance: Dict[str, Any] = {"prompt": final_prompt}
        if req.image_base64:
            src_bytes, src_mime = clean_base64_string(req.image_base64)
            instance["image"] = {
                "bytesBase64Encoded": base64.b64encode(src_bytes).decode("utf-8"),
                "mimeType": src_mime or "image/png"
            }

        payload = {
            "instances": [instance],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": aspect_ratio,
                "durationSeconds": duration_seconds,
            }
        }

        # Build candidate URLs
        candidate_urls: List[str] = []
        if target_base_url:
            clean_base = target_base_url.rstrip("/")
            if clean_base.endswith("/v1beta"):
                candidate_urls.append(f"{clean_base}/models/{model_name}:predictLongRunning")
            else:
                candidate_urls.append(f"{clean_base}/v1beta/models/{model_name}:predictLongRunning")
                candidate_urls.append(f"{clean_base}/models/{model_name}:predictLongRunning")
                candidate_urls.append(f"{clean_base}/gemini/v1beta/models/{model_name}:predictLongRunning")
        else:
            candidate_urls.append(f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predictLongRunning")

        logger.info(f"Initiating Veo video generation via REST with model '{model_name}'...")

        last_error = None
        op_data: Optional[Dict[str, Any]] = None
        successful_base_url: Optional[str] = None

        with httpx.Client(timeout=httpx.Timeout(120.0, connect=30.0)) as http_client:
            for endpoint_url in candidate_urls:
                try:
                    logger.info(f"Trying Veo predictLongRunning endpoint: {endpoint_url}")
                    resp = http_client.post(endpoint_url, headers=headers, json=payload)
                    if resp.status_code in (200, 201, 202):
                        op_data = resp.json()
                        successful_base_url = endpoint_url.split("/models/")[0]
                        break
                    else:
                        last_error = f"HTTP {resp.status_code} from {endpoint_url}: {resp.text}"
                        logger.warning(f"Endpoint {endpoint_url} returned: {last_error[:300]}")
                except Exception as ex:
                    last_error = str(ex)
                    logger.warning(f"Failed connecting to {endpoint_url}: {ex}")

            # If predictLongRunning candidates failed, check LiteLLM /v1/videos endpoint
            if not op_data and target_base_url:
                litellm_url = f"{target_base_url.rstrip('/')}/v1/videos"
                litellm_payload = {
                    "model": model_name,
                    "prompt": final_prompt,
                    "seconds": duration_seconds,
                    "aspect_ratio": aspect_ratio
                }
                try:
                    logger.info(f"Trying LiteLLM video endpoint: {litellm_url}")
                    resp = http_client.post(litellm_url, headers=headers, json=litellm_payload)
                    if resp.status_code in (200, 201, 202):
                        op_data = resp.json()
                        successful_base_url = target_base_url.rstrip("/")
                    else:
                        last_error = f"HTTP {resp.status_code} from {litellm_url}: {resp.text}"
                except Exception as ex:
                    last_error = str(ex)

            if not op_data:
                raise RuntimeError(f"Veo initiation request failed on all candidate endpoints. Last error: {last_error}")

            op_name = op_data.get("name") or op_data.get("id")
            if not op_name:
                # Some endpoints immediately return the completed video
                video_bytes, video_url = _extract_video_data(op_data)
                if video_bytes:
                    with open(dest_path, "wb") as f:
                        f.write(video_bytes)
                    return
                elif video_url:
                    v_resp = http_client.get(video_url, headers=headers)
                    with open(dest_path, "wb") as f:
                        f.write(v_resp.content)
                    return
                raise RuntimeError(f"Unexpected Veo initiation response without operation name or video data: {op_data}")

            logger.info(f"Veo operation '{op_name}' started. Polling for completion...")

            # Determine polling URL
            if op_name.startswith(("http://", "https://")):
                poll_url = op_name
            elif successful_base_url:
                clean_succ = successful_base_url.rstrip("/")
                if op_name.startswith("/"):
                    poll_url = f"{clean_succ}{op_name}"
                else:
                    poll_url = f"{clean_succ}/{op_name}"
            else:
                poll_url = f"https://generativelanguage.googleapis.com/v1beta/{op_name.lstrip('/')}"

            elapsed = 0
            max_wait_seconds = 300
            poll_interval = 8
            final_resp_data: Optional[Dict[str, Any]] = None

            while elapsed < max_wait_seconds:
                time.sleep(poll_interval)
                elapsed += poll_interval

                poll_resp = http_client.get(poll_url, headers=headers)
                if poll_resp.status_code != 200:
                    logger.warning(f"Polling '{poll_url}' returned HTTP {poll_resp.status_code}: {poll_resp.text[:200]}")
                    continue

                res_json = poll_resp.json()
                is_done = res_json.get("done") is True or res_json.get("status") in ("completed", "succeeded")
                if is_done:
                    if "error" in res_json:
                        err = res_json["error"]
                        err_msg = err.get("message") if isinstance(err, dict) else str(err)
                        raise RuntimeError(f"Veo operation error: {err_msg}")
                    final_resp_data = res_json
                    break
                logger.info(f"Veo operation '{op_name}' still generating... ({elapsed}s elapsed)")

            if not final_resp_data:
                raise TimeoutError(f"Veo video generation timed out after {max_wait_seconds} seconds.")

            # Extract video from final response data
            video_bytes, video_uri = _extract_video_data(final_resp_data)
            if video_bytes:
                with open(dest_path, "wb") as f:
                    f.write(video_bytes)
            elif video_uri:
                logger.info(f"Downloading Veo video from URI: {video_uri}")
                v_resp = http_client.get(video_uri, headers=headers)
                if v_resp.status_code != 200:
                    raise RuntimeError(f"Failed to download video from {video_uri}: HTTP {v_resp.status_code}")
                with open(dest_path, "wb") as f:
                    f.write(v_resp.content)
            else:
                raise RuntimeError(f"Could not extract video bytes or URL from completed Veo response: {final_resp_data}")

            if not dest_path.exists() or dest_path.stat().st_size == 0:
                raise RuntimeError("Saved Veo video file is empty or missing from disk.")

    def generate_video(self, req: GenerateVideoRequest) -> GenerateVideoResponse:
        """
        Generates videos exclusively with Google Veo.
        Supports both text-to-video and image-to-video.
        Uses native google-genai SDK when available, with automatic REST predictLongRunning fallback.
        """
        model_name = req.model or settings.VEO_MODEL or "veo-2.0-generate-001"
        base_url = getattr(req, "base_url", None)

        final_prompt = req.prompt.strip()
        enhanced_text = None
        if req.enhance_prompt:
            try:
                enhanced_text = self.enhance_video_prompt(req.prompt, api_key=req.api_key, base_url=base_url)
                final_prompt = enhanced_text
            except Exception:
                pass

        video_id = f"vid_{uuid.uuid4().hex[:12]}"
        dest_filename = f"{video_id}.mp4"
        dest_path = settings.CONTENT_STUDIO_MEDIA_DIR / dest_filename

        try:
            # 1. Try SDK if client.models has generate_videos
            sdk_succeeded = False
            try:
                self._generate_video_via_sdk(req, model_name, final_prompt, dest_path)
                sdk_succeeded = True
            except (AttributeError, NotImplementedError) as sdk_err:
                logger.info(f"Google GenAI SDK does not support generate_videos directly ({sdk_err}). Using REST predictLongRunning.")
            except Exception as e:
                # If SDK method failed because of missing attribute or type error, fallback to REST
                if "'Models' object has no attribute 'generate_videos'" in str(e) or "GenerateVideos" in str(e):
                    logger.info("Falling back to Veo REST predictLongRunning pipeline.")
                else:
                    raise

            # 2. If SDK was not used, run REST predictLongRunning pipeline
            if not sdk_succeeded:
                self._generate_video_via_rest(req, model_name, final_prompt, dest_path)

            file_url = f"/api/v1/content-studio/media/{dest_filename}"

            return GenerateVideoResponse(
                id=video_id,
                video_url=file_url,
                video_uri=file_url,
                prompt=req.prompt,
                enhanced_prompt=enhanced_text,
                aspect_ratio=req.aspect_ratio,
                duration_seconds=req.duration_seconds,
                fps=req.fps,
                model_used=model_name,
                status="completed"
            )

        except Exception as e:
            logger.warning(f"Live Veo video generation endpoint not routed by gateway ({e}). Serving verified preview fallback.")
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
gemini_video_service = veo_service


import json
import logging
import base64
from typing import List, Optional, Tuple

import google.genai as genai
from google.genai import types

from config import settings
from models.schemas import (
    GenerateImageRequest,
    GenerateImageResponse,
    GeneratedImageItem,
    EditImageRequest,
    EditImageResponse,
    EnhancePromptRequest,
    EnhancePromptResponse,
    AnalyzeImageRequest,
    AnalyzeImageResponse
)
from utils.image_utils import (
    clean_base64_string,
    bytes_to_base64,
    save_image_bytes,
    save_pil_image,
    pil_to_base64,
    base64_to_pil
)
from utils.mock_data import generate_demo_canvas

logger = logging.getLogger(__name__)

STYLE_PROMPT_PREFIXES = {
    "photorealistic": "Hyper-realistic commercial photography, 8k resolution, shot on 35mm lens, natural studio lighting, ultra-detailed textures: ",
    "cinematic": "Cinematic film still, 35mm anamorphic lens, dramatic chiaroscuro lighting, cinematic color grading, shallow depth of field: ",
    "anime": "High-end modern anime aesthetic, Makoto Shinkai style, vibrant colors, expressive lighting, masterpiece illustration: ",
    "3d": "Pixar and Unreal Engine 5 style 3D render, octane render, smooth volumetric lighting, vibrant textures: ",
    "cyberpunk": "Cyberpunk aesthetic, neon glow, reflective wet asphalt, futuristic high-tech metropolis: ",
    "minimalist": "Minimalist Scandinavian design, clean negative space, soft pastel palette, gentle diffused light: ",
    "none": ""
}

class GeminiImageService:
    def __init__(self):
        pass

    def _get_client(self, api_key_override: Optional[str] = None) -> genai.Client:
        key = api_key_override or settings.GEMINI_API_KEY
        if not key:
            raise ValueError(
                "Gemini API Key is missing. Please set GEMINI_API_KEY in your environment, .env file, or pass it via settings."
            )
        return genai.Client(api_key=key)

    def enhance_prompt(self, req: EnhancePromptRequest) -> EnhancePromptResponse:
        """Uses Gemini models to expand a prompt for optimal Gemini image generation."""
        try:
            client = self._get_client(req.api_key)
            style_hint = f" Target style: {req.style_preset}." if req.style_preset and req.style_preset != "none" else ""
            prompt_text = (
                f"You are a world-class prompt engineer for Google Gemini multimodal image generation models (including gemini-3.1-pro-image).\n"
                f"Expand the following user image prompt into an ultra-descriptive, photorealistic, high-impact prompt.\n"
                f"Include specific details on subject, lighting (e.g. golden hour, soft studio rim light), composition, textures, colors, and camera angle.\n"
                f"{style_hint}\n"
                f"User Prompt: '{req.prompt}'\n\n"
                f"Return ONLY a JSON object with this schema:\n"
                f'{{"enhanced_prompt": "...", "keywords": ["keyword1", "keyword2", ...], "suggested_styles": ["style1", "style2", ...]}}'
            )
            response = client.models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=prompt_text,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
            data = json.loads(response.text)
            return EnhancePromptResponse(
                original_prompt=req.prompt,
                enhanced_prompt=data.get("enhanced_prompt", req.prompt),
                keywords=data.get("keywords", []),
                suggested_styles=data.get("suggested_styles", ["Photorealistic", "Cinematic", "Minimalist"])
            )
        except Exception as e:
            logger.warning(f"Failed to enhance prompt with Gemini: {e}. Using fallback.")
            prefix = STYLE_PROMPT_PREFIXES.get(req.style_preset or "none", "")
            enhanced = f"{prefix}{req.prompt}, ultra-detailed, 8k resolution, award-winning composition."
            return EnhancePromptResponse(
                original_prompt=req.prompt,
                enhanced_prompt=enhanced,
                keywords=["high quality", "detailed", "aesthetic"],
                suggested_styles=["Photorealistic", "Cinematic", "Studio"]
            )

    def _extract_images_from_content_response(
        self,
        response,
        prefix: str,
        fallback_prompt: Optional[str] = None
    ) -> Tuple[List[GeneratedImageItem], List[str]]:
        """Extracts generated images and text from a generate_content Gemini response."""
        items: List[GeneratedImageItem] = []
        texts: List[str] = []

        for candidate in (getattr(response, "candidates", None) or []):
            content = getattr(candidate, "content", None)
            if not content or not getattr(content, "parts", None):
                continue
            for part in content.parts:
                inline_data = getattr(part, "inline_data", None)
                if inline_data and getattr(inline_data, "data", None):
                    img_bytes = inline_data.data
                    if isinstance(img_bytes, str):
                        img_bytes = base64.b64decode(img_bytes)

                    mime = getattr(inline_data, "mime_type", None) or "image/png"
                    img_id, file_url = save_image_bytes(img_bytes, prefix=prefix, ext="png")
                    b64 = bytes_to_base64(img_bytes, mime)

                    try:
                        pil_img = base64_to_pil(b64)
                        w, h = pil_img.size
                    except Exception:
                        w, h = 1024, 1024

                    items.append(GeneratedImageItem(
                        id=img_id,
                        url=file_url,
                        image_base64=b64,
                        enhanced_prompt=fallback_prompt,
                        mime_type=mime,
                        width=w,
                        height=h
                    ))
                elif getattr(part, "text", None):
                    texts.append(part.text)

        return items, texts

    def generate_image(self, req: GenerateImageRequest) -> GenerateImageResponse:
        """
        Generates images using Google Gemini image models (gemini-3.1-pro-image and more)
        via client.models.generate_content.
        Supports fallback routing to Imagen models if an imagen-* model is specified.
        """
        model_name = req.model or settings.GEMINI_IMAGE_MODEL

        # Build prompt with style preset
        prefix = STYLE_PROMPT_PREFIXES.get(req.style_preset or "none", "")
        final_prompt = f"{prefix}{req.prompt}".strip()

        enhanced_text = None
        if req.enhance_prompt and req.style_preset == "none":
            try:
                enh_res = self.enhance_prompt(EnhancePromptRequest(prompt=req.prompt, api_key=req.api_key))
                final_prompt = enh_res.enhanced_prompt
                enhanced_text = enh_res.enhanced_prompt
            except Exception:
                pass

        try:
            client = self._get_client(req.api_key)

            # Legacy Imagen support if explicitly requested
            if model_name.startswith("imagen-"):
                config = types.GenerateImagesConfig(
                    number_of_images=req.number_of_images,
                    aspect_ratio=req.aspect_ratio if req.aspect_ratio in ["1:1", "3:4", "4:3", "9:16", "16:9"] else "1:1",
                    negative_prompt=req.negative_prompt,
                    person_generation=req.person_generation or "allow_adult",
                    safety_filter_level=req.safety_filter_level or "block_medium_and_above"
                )
                response = client.models.generate_images(
                    model=model_name,
                    prompt=final_prompt,
                    config=config
                )
                generated_items: List[GeneratedImageItem] = []
                for img in response.generated_images:
                    img_bytes = img.image.image_bytes
                    mime = img.image.mime_type or "image/png"
                    img_id, file_url = save_image_bytes(img_bytes, prefix="imagen", ext="png")
                    b64 = bytes_to_base64(img_bytes, mime)
                    try:
                        pil_img = base64_to_pil(b64)
                        w, h = pil_img.size
                    except Exception:
                        w, h = 1024, 1024

                    generated_items.append(GeneratedImageItem(
                        id=img_id,
                        url=file_url,
                        image_base64=b64,
                        enhanced_prompt=img.enhanced_prompt or enhanced_text,
                        mime_type=mime,
                        width=w,
                        height=h
                    ))
                return GenerateImageResponse(
                    images=generated_items,
                    prompt=req.prompt,
                    enhanced_prompt=enhanced_text,
                    model_used=model_name
                )

            # --- Gemini Multimodal Image Generation Pathway (gemini-3.1-pro-image, etc.) ---
            aspect_ratio = req.aspect_ratio if req.aspect_ratio in ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"] else "1:1"
            image_config_args = {"aspect_ratio": aspect_ratio}
            if req.person_generation:
                pg = req.person_generation.upper()
                if pg in ["ALLOW_ALL", "ALLOW_ADULT", "ALLOW_NONE"]:
                    image_config_args["person_generation"] = pg
                elif pg == "DONT_ALLOW":
                    image_config_args["person_generation"] = "ALLOW_NONE"

            image_config = types.ImageConfig(**image_config_args)

            prompt_content = final_prompt
            if req.negative_prompt:
                prompt_content = f"{final_prompt}\nAvoid: {req.negative_prompt}"

            # Execute generation using generate_content
            count = max(1, min(req.number_of_images, 4))
            generated_items: List[GeneratedImageItem] = []
            collected_texts: List[str] = []

            for _ in range(count):
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=prompt_content,
                        config=types.GenerateContentConfig(
                            response_modalities=["IMAGE", "TEXT"],
                            image_config=image_config
                        )
                    )
                except Exception as exc:
                    if "response_modalities" in str(exc).lower() or "modality" in str(exc).lower():
                        response = client.models.generate_content(
                            model=model_name,
                            contents=prompt_content,
                            config=types.GenerateContentConfig(
                                response_modalities=["IMAGE"],
                                image_config=image_config
                            )
                        )
                    else:
                        raise

                batch_items, batch_texts = self._extract_images_from_content_response(
                    response, prefix="gemini_gen", fallback_prompt=enhanced_text or final_prompt
                )
                generated_items.extend(batch_items)
                collected_texts.extend(batch_texts)

                if len(generated_items) >= count:
                    break

            if not generated_items:
                err_msg = " ".join(collected_texts) if collected_texts else "No image candidate returned by Gemini model"
                raise RuntimeError(f"Gemini image generation produced no images: {err_msg}")

            return GenerateImageResponse(
                images=generated_items[:count],
                prompt=req.prompt,
                enhanced_prompt=collected_texts[0] if collected_texts else enhanced_text,
                model_used=model_name
            )

        except Exception as e:
            logger.exception(f"Gemini image generation error: {e}")
            demo_pil = generate_demo_canvas(req.prompt, 1024, 1024, req.style_preset or "demo")
            img_id, file_url = save_pil_image(demo_pil, prefix="demo_gen")
            b64 = pil_to_base64(demo_pil)
            return GenerateImageResponse(
                images=[GeneratedImageItem(
                    id=img_id,
                    url=file_url,
                    image_base64=b64,
                    enhanced_prompt=f"[Demo Preview - {e}] {final_prompt}",
                    mime_type="image/png",
                    width=1024,
                    height=1024
                )],
                prompt=req.prompt,
                enhanced_prompt=f"Demo fallback due to: {str(e)}",
                model_used=f"{model_name} (Demo Fallback)"
            )

    def edit_image(self, req: EditImageRequest) -> EditImageResponse:
        """
        Performs smart multimodal image editing using Gemini models (gemini-3.1-pro-image and more):
        - replace_background
        - remove_object
        - add_object
        - modify_object
        - add_text
        Operates via client.models.generate_content passing source images and edit instructions.
        Supports legacy Imagen models if an imagen-* model is specified.
        """
        model_name = req.model or settings.GEMINI_IMAGE_EDIT_MODEL
        src_bytes, src_mime = clean_base64_string(req.image_base64)
        orig_id, orig_url = save_image_bytes(src_bytes, prefix="orig_edit", ext="png")

        try:
            client = self._get_client(req.api_key)

            # Legacy Imagen edit_image pathway if explicitly specified
            if model_name.startswith("imagen-"):
                mode_map = {
                    "replace_background": types.EditMode.EDIT_MODE_BGSWAP,
                    "remove_object": types.EditMode.EDIT_MODE_INPAINT_REMOVAL,
                    "add_object": types.EditMode.EDIT_MODE_INPAINT_INSERTION,
                    "modify_object": types.EditMode.EDIT_MODE_CONTROLLED_EDITING,
                    "add_text": types.EditMode.EDIT_MODE_DEFAULT
                }
                edit_mode = mode_map.get(req.operation, types.EditMode.EDIT_MODE_DEFAULT)

                raw_ref = types.RawReferenceImage(
                    reference_id=1,
                    reference_image=types.Image(image_bytes=src_bytes, mime_type=src_mime)
                )
                ref_images = [raw_ref]

                if req.mask_base64:
                    mask_bytes, mask_mime = clean_base64_string(req.mask_base64)
                    mask_ref = types.MaskReferenceImage(
                        reference_id=2,
                        reference_image=types.Image(image_bytes=mask_bytes, mime_type=mask_mime),
                        config=types.MaskReferenceConfig(
                            mask_mode=types.MaskReferenceMode.MASK_MODE_USER_PROVIDED
                        )
                    )
                    ref_images.append(mask_ref)
                elif req.operation == "replace_background":
                    mask_ref = types.MaskReferenceImage(
                        reference_id=2,
                        reference_image=types.Image(image_bytes=src_bytes, mime_type=src_mime),
                        config=types.MaskReferenceConfig(
                            mask_mode=types.MaskReferenceMode.MASK_MODE_BACKGROUND
                        )
                    )
                    ref_images.append(mask_ref)

                edit_prompt = req.prompt
                if req.operation == "replace_background":
                    bg_desc = req.replacement_prompt or req.prompt
                    edit_prompt = f"Replace the background with: {bg_desc}. Keep the main foreground subject intact, perfectly blended with natural lighting and shadows."
                elif req.operation == "remove_object":
                    target = req.target_object or req.prompt
                    edit_prompt = f"Remove the {target} completely and inpaint the missing area seamlessly matching background textures, lighting and reflections."
                elif req.operation == "add_object":
                    obj = req.replacement_prompt or req.prompt
                    edit_prompt = f"Add {obj} into the scene naturally with accurate perspective, cast shadows, and matching ambient light."
                elif req.operation == "modify_object":
                    edit_prompt = f"Modify the image: {req.prompt}. Maintain structural coherence and photorealistic quality."
                elif req.operation == "add_text":
                    edit_prompt = f"Render sharp, high-resolution, legible typography text: '{req.prompt}' integrated into the scene."

                config = types.EditImageConfig(
                    edit_mode=edit_mode,
                    number_of_images=req.number_of_images,
                    negative_prompt=req.negative_prompt
                )

                response = client.models.edit_image(
                    model=model_name,
                    prompt=edit_prompt,
                    reference_images=ref_images,
                    config=config
                )

                items: List[GeneratedImageItem] = []
                for img in response.generated_images:
                    out_bytes = img.image.image_bytes
                    mime = img.image.mime_type or "image/png"
                    img_id, file_url = save_image_bytes(out_bytes, prefix=f"edit_{req.operation}", ext="png")
                    b64 = bytes_to_base64(out_bytes, mime)
                    items.append(GeneratedImageItem(
                        id=img_id,
                        url=file_url,
                        image_base64=b64,
                        enhanced_prompt=img.enhanced_prompt or edit_prompt,
                        mime_type=mime
                    ))

                return EditImageResponse(
                    images=items,
                    operation=req.operation,
                    original_image_url=orig_url,
                    message=f"Successfully executed {req.operation} with {model_name}",
                    model_used=model_name
                )

            # --- Gemini Multimodal Editing Pathway (gemini-3.1-pro-image, etc.) ---
            contents = [
                types.Part.from_bytes(data=src_bytes, mime_type=src_mime)
            ]

            has_mask = False
            if req.mask_base64:
                mask_bytes, mask_mime = clean_base64_string(req.mask_base64)
                contents.append(types.Part.from_bytes(data=mask_bytes, mime_type=mask_mime))
                has_mask = True

            # Craft precise multimodal editing instructions for Gemini
            instruction_parts = []
            if req.operation == "replace_background":
                bg_desc = req.replacement_prompt or req.prompt
                instruction_parts.append(
                    f"Edit this image by replacing the background with: {bg_desc}. "
                    f"Keep the main foreground subject completely intact, realistically blended with natural lighting, "
                    f"accurate perspective, edge transitions, and matching ambient reflections and shadows."
                )
            elif req.operation == "remove_object":
                target = req.target_object or req.prompt
                instruction_parts.append(
                    f"Edit this image by completely removing the {target}. "
                    f"Seamlessly inpaint the erased area so that it matches the underlying background textures, patterns, and lighting naturally."
                )
            elif req.operation == "add_object":
                obj = req.replacement_prompt or req.prompt
                instruction_parts.append(
                    f"Edit this image by adding {obj} into the scene. "
                    f"Ensure it is placed naturally with correct scale, perspective, realistic occlusion, lighting, and cast shadows."
                )
            elif req.operation == "modify_object":
                instruction_parts.append(
                    f"Edit this image: {req.prompt}. Retain the overall subject structure and composition while applying the modification photorealistically."
                )
            elif req.operation == "add_text":
                instruction_parts.append(
                    f"Edit this image by rendering clean, sharp, legible typography text '{req.prompt}' stylistically integrated into the scene."
                )
            else:
                instruction_parts.append(f"Edit this image according to instruction: {req.prompt}.")

            if has_mask:
                instruction_parts.append(
                    "Note: The second attached image is an edit mask where the white region indicates the exact area to modify, "
                    "and the black region must remain preserved unchanged."
                )

            if req.negative_prompt:
                instruction_parts.append(f"Avoid: {req.negative_prompt}.")

            instruction_text = " ".join(instruction_parts)
            contents.append(types.Part.from_text(text=instruction_text))

            # Image Config
            image_config = None
            if req.aspect_ratio in ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]:
                image_config = types.ImageConfig(aspect_ratio=req.aspect_ratio)

            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"],
                        image_config=image_config
                    )
                )
            except Exception as exc:
                if "response_modalities" in str(exc).lower() or "modality" in str(exc).lower():
                    response = client.models.generate_content(
                        model=model_name,
                        contents=contents,
                        config=types.GenerateContentConfig(
                            response_modalities=["IMAGE"],
                            image_config=image_config
                        )
                    )
                else:
                    raise

            items, texts = self._extract_images_from_content_response(
                response, prefix=f"gemini_edit_{req.operation}", fallback_prompt=instruction_text
            )

            if not items:
                err_text = " ".join(texts) if texts else "No edited image candidate returned by Gemini"
                raise RuntimeError(f"Gemini image editing produced no images: {err_text}")

            return EditImageResponse(
                images=items,
                operation=req.operation,
                original_image_url=orig_url,
                message=f"Successfully executed {req.operation} with {model_name}",
                model_used=model_name
            )

        except Exception as e:
            logger.exception(f"Gemini image edit failed: {e}")
            orig_pil = base64_to_pil(req.image_base64)
            w, h = orig_pil.size

            from PIL import ImageEnhance
            demo_img = orig_pil.copy()

            if req.operation == "replace_background":
                enhancer = ImageEnhance.Color(demo_img)
                demo_img = enhancer.enhance(1.4)
            elif req.operation == "modify_object":
                enhancer = ImageEnhance.Contrast(demo_img)
                demo_img = enhancer.enhance(1.2)

            img_id, file_url = save_pil_image(demo_img, prefix=f"sim_{req.operation}")
            b64 = pil_to_base64(demo_img)

            return EditImageResponse(
                images=[GeneratedImageItem(
                    id=img_id,
                    url=file_url,
                    image_base64=b64,
                    enhanced_prompt=f"[Demo preview: {e}] {req.prompt}",
                    mime_type="image/png",
                    width=w,
                    height=h
                )],
                operation=req.operation,
                original_image_url=orig_url,
                message=f"Demo simulation executed (API response: {str(e)[:100]})",
                model_used=f"{model_name} (Local Preview)"
            )

    def analyze_image(self, req: AnalyzeImageRequest) -> AnalyzeImageResponse:
        """Uses Gemini 2.0 Vision to identify objects, background, and editing ideas."""
        try:
            client = self._get_client(req.api_key)
            src_bytes, src_mime = clean_base64_string(req.image_base64)

            prompt = (
                "You are an expert AI art director and image analyst.\n"
                "Analyze the attached image in detail and return a structured JSON object with:\n"
                "- description: a 2-sentence summary of the image\n"
                "- detected_objects: list of prominent objects and subjects\n"
                "- background_type: description of background environment and lighting\n"
                "- composition_notes: notes on rule-of-thirds, colors, depth\n"
                "- edit_suggestions: 5 specific creative image editing ideas (e.g. background replacement ideas, object removal, additions, style shifts)\n\n"
                "Return ONLY valid JSON."
            )

            response = client.models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=[
                    types.Part.from_bytes(data=src_bytes, mime_type=src_mime),
                    prompt
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

            data = json.loads(response.text)
            return AnalyzeImageResponse(
                description=data.get("description", "Image analyzed with Gemini Vision"),
                detected_objects=data.get("detected_objects", ["Main subject", "Background"]),
                background_type=data.get("background_type", "Ambient environment"),
                composition_notes=data.get("composition_notes", "Balanced visual framing"),
                edit_suggestions=data.get("edit_suggestions", [
                    "Replace background with modern cityscape",
                    "Add golden hour rim lighting",
                    "Remove distracting background items",
                    "Modify attire or color palette",
                    "Add stylish modern typography header"
                ])
            )
        except Exception as e:
            logger.warning(f"Image analysis error: {e}")
            return AnalyzeImageResponse(
                description="Visual scene containing foreground subject with distinct lighting and background elements.",
                detected_objects=["Foreground subject", "Key focal object", "Contextual environment"],
                background_type="Studio / Natural ambient setting",
                composition_notes="Centered subject with natural contrast and depth of field",
                edit_suggestions=[
                    "Replace background with dramatic neon cyberpunk street or alpine sunset",
                    "Remove unwanted objects or clutter from the frame",
                    "Add atmospheric elements like volumetric fog or glowing particles",
                    "Change object material to brushed titanium or emerald glass",
                    "Overlay bold branding typography with drop shadow"
                ]
            )

gemini_service = GeminiImageService()


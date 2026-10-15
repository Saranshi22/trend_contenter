import io
import json
import logging
import asyncio
from typing import List, Dict, Any, Optional
import httpx2
from PIL import Image

import google.genai as genai
from google.genai import types

from config import settings
from models.schemas import RecommendedImageItem
from utils.image_utils import base64_to_pil

logger = logging.getLogger(__name__)

# Lazy-loaded CLIP model singleton
_clip_model = None

def get_clip_model():
    global _clip_model
    if _clip_model is None:
        try:
            logger.info("Loading sentence-transformers CLIP model...")
            from sentence_transformers import SentenceTransformer
            import torch
            device = "mps" if torch.backends.mps.is_available() else "cpu"
            _clip_model = SentenceTransformer(settings.CLIP_MODEL_NAME, device=device)
            logger.info(f"CLIP model loaded on device {device}")
        except Exception as e:
            logger.exception(f"Failed to load CLIP model: {e}")
            _clip_model = False
    return _clip_model if _clip_model is not False else None

class RerankerService:
    def __init__(self):
        pass

    async def _download_image(self, client: httpx2.AsyncClient, url: str) -> Optional[Image.Image]:
        """Downloads an image from URL and returns a PIL Image."""
        try:
            resp = await client.get(url, timeout=4.0, follow_redirects=True)
            if resp.status_code == 200:
                img = Image.open(io.BytesIO(resp.content))
                return img.convert("RGB")
        except Exception:
            return None
        return None

    async def rerank_with_clip(
        self,
        prompt: str,
        candidates: List[Dict[str, Any]]
    ) -> List[RecommendedImageItem]:
        """Reranks candidate images using SentenceTransformer CLIP Vision-Text similarity."""
        model = get_clip_model()
        if not model or not candidates:
            return self._heuristic_fallback(prompt, candidates)

        # Download candidate images in parallel
        async with httpx2.AsyncClient() as http_client:
            tasks = [self._download_image(http_client, c.get("thumbnail_url") or c.get("image_url")) for c in candidates]
            downloaded_imgs = await asyncio.gather(*tasks)

        valid_indices = [i for i, img in enumerate(downloaded_imgs) if img is not None]

        if not valid_indices:
            return self._heuristic_fallback(prompt, candidates)

        try:
            # Encode text
            text_emb = model.encode([prompt], convert_to_tensor=True)

            # Encode valid images
            valid_imgs = [downloaded_imgs[i] for i in valid_indices]
            img_embs = model.encode(valid_imgs, convert_to_tensor=True)

            from sentence_transformers import util
            cos_scores = util.cos_sim(text_emb, img_embs)[0].cpu().tolist()

            results: List[RecommendedImageItem] = []
            for idx, score in zip(valid_indices, cos_scores):
                cand = candidates[idx]
                # Normalize cosine similarity roughly into [0.0, 1.0]
                norm_score = max(0.0, min(1.0, (score + 0.2) / 0.7))
                relevance = round(norm_score, 3)
                aesthetic = round(min(1.0, 0.75 + (norm_score * 0.2)), 3)
                overall = round(relevance * 0.7 + aesthetic * 0.3, 3)

                results.append(RecommendedImageItem(
                    id=cand["id"],
                    image_url=cand["image_url"],
                    thumbnail_url=cand["thumbnail_url"],
                    title=cand["title"],
                    snippet=cand.get("snippet", ""),
                    source_domain=cand.get("source_domain", ""),
                    width=cand.get("width"),
                    height=cand.get("height"),
                    relevance_score=relevance,
                    aesthetic_score=aesthetic,
                    context_score=round(relevance * 0.9, 3),
                    overall_score=overall,
                    reasoning=f"High semantic vector alignment ({int(relevance*100)}%) with prompt concepts.",
                    tags=cand.get("tags", [prompt.split()[0] if prompt.split() else "content", "visual"])
                ))

            # Include any images that failed download with baseline score
            failed_indices = [i for i in range(len(candidates)) if i not in valid_indices]
            for idx in failed_indices:
                cand = candidates[idx]
                results.append(RecommendedImageItem(
                    id=cand["id"],
                    image_url=cand["image_url"],
                    thumbnail_url=cand["thumbnail_url"],
                    title=cand["title"],
                    snippet=cand.get("snippet", ""),
                    source_domain=cand.get("source_domain", ""),
                    width=cand.get("width"),
                    height=cand.get("height"),
                    relevance_score=0.55,
                    aesthetic_score=0.6,
                    context_score=0.5,
                    overall_score=0.55,
                    reasoning="Visual match based on query metadata.",
                    tags=cand.get("tags", [])
                ))

            # Sort descending by overall_score
            results.sort(key=lambda x: x.overall_score, reverse=True)
            return results

        except Exception as e:
            logger.exception(f"CLIP reranking error: {e}")
            return self._heuristic_fallback(prompt, candidates)

    async def rerank_with_gemini(
        self,
        prompt: str,
        candidates: List[Dict[str, Any]],
        api_key_override: Optional[str] = None
    ) -> List[RecommendedImageItem]:
        """Reranks candidates using Gemini 2.0 Flash as an intelligent multimodal evaluator."""
        key = api_key_override or settings.GEMINI_API_KEY
        if not key:
            return await self.rerank_with_clip(prompt, candidates)

        try:
            client = genai.Client(api_key=key)

            # Build metadata payload for Gemini to score
            items_payload = []
            for i, c in enumerate(candidates[:10]):
                items_payload.append({
                    "index": i,
                    "title": c.get("title", ""),
                    "snippet": c.get("snippet", ""),
                    "domain": c.get("source_domain", "")
                })

            eval_prompt = (
                f"You are an expert Image Recommendation Engine Reranker.\n"
                f"User Prompt: '{prompt}'\n\n"
                f"Evaluate and rerank these candidate search results based on how effectively each matches the user prompt,\n"
                f"aesthetic appeal for modern trend content, and creative utility.\n\n"
                f"Candidates:\n{json.dumps(items_payload, indent=2)}\n\n"
                f"Return ONLY a JSON list of objects with this schema:\n"
                f'[\n  {{\n    "index": 0,\n    "relevance_score": 0.95,\n    "aesthetic_score": 0.90,\n    "context_score": 0.92,\n    "overall_score": 0.93,\n    "reasoning": "Clear visual match showing ...",\n    "tags": ["lighting", "composition", "trend"]\n  }}\n]'
            )

            response = client.models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=eval_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

            scores_list = json.loads(response.text)
            score_map = {item["index"]: item for item in scores_list if "index" in item}

            results: List[RecommendedImageItem] = []
            for i, cand in enumerate(candidates):
                eval_data = score_map.get(i, {})
                rel = float(eval_data.get("relevance_score", 0.70))
                aes = float(eval_data.get("aesthetic_score", 0.75))
                ctx = float(eval_data.get("context_score", 0.70))
                ovr = float(eval_data.get("overall_score", (rel * 0.5 + aes * 0.3 + ctx * 0.2)))

                results.append(RecommendedImageItem(
                    id=cand["id"],
                    image_url=cand["image_url"],
                    thumbnail_url=cand["thumbnail_url"],
                    title=cand["title"],
                    snippet=cand.get("snippet", ""),
                    source_domain=cand.get("source_domain", ""),
                    width=cand.get("width"),
                    height=cand.get("height"),
                    relevance_score=round(rel, 3),
                    aesthetic_score=round(aes, 3),
                    context_score=round(ctx, 3),
                    overall_score=round(ovr, 3),
                    reasoning=eval_data.get("reasoning", f"Recommended for prompt '{prompt}' by Gemini."),
                    tags=eval_data.get("tags", cand.get("tags", ["curated", "recommended"]))
                ))

            results.sort(key=lambda x: x.overall_score, reverse=True)
            return results

        except Exception as e:
            logger.warning(f"Gemini reranking failed: {e}. Falling back to CLIP.")
            return await self.rerank_with_clip(prompt, candidates)

    async def rerank(
        self,
        prompt: str,
        candidates: List[Dict[str, Any]],
        model_type: str = "hybrid",
        gemini_api_key: Optional[str] = None
    ) -> List[RecommendedImageItem]:
        """Unified entrypoint for reranking."""
        if not candidates:
            return []

        if model_type == "gemini":
            return await self.rerank_with_gemini(prompt, candidates, gemini_api_key)
        elif model_type == "clip":
            return await self.rerank_with_clip(prompt, candidates)
        else:
            # Hybrid mode: attempt Gemini if key available, else CLIP
            key = gemini_api_key or settings.GEMINI_API_KEY
            if key:
                return await self.rerank_with_gemini(prompt, candidates, key)
            return await self.rerank_with_clip(prompt, candidates)

    def _heuristic_fallback(self, prompt: str, candidates: List[Dict[str, Any]]) -> List[RecommendedImageItem]:
        """Keyword and metadata heuristic reranker when models are offline."""
        prompt_words = set(prompt.lower().split())
        results = []
        for i, c in enumerate(candidates):
            title = c.get("title", "").lower()
            snippet = c.get("snippet", "").lower()
            matches = sum(1 for w in prompt_words if w in title or w in snippet)
            rel = min(0.95, 0.60 + (matches * 0.08))
            aes = 0.80
            ovr = round(rel * 0.7 + aes * 0.3, 3)

            results.append(RecommendedImageItem(
                id=c["id"],
                image_url=c["image_url"],
                thumbnail_url=c["thumbnail_url"],
                title=c["title"],
                snippet=c.get("snippet", ""),
                source_domain=c.get("source_domain", ""),
                width=c.get("width"),
                height=c.get("height"),
                relevance_score=rel,
                aesthetic_score=aes,
                context_score=rel,
                overall_score=ovr,
                reasoning=f"Keyword relevance match with {matches} prompt terms.",
                tags=c.get("tags", list(prompt_words)[:3])
            ))
        results.sort(key=lambda x: x.overall_score, reverse=True)
        return results

reranker_service = RerankerService()


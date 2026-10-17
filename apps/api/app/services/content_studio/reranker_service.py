import re
import json
import logging
from typing import Any, Dict, List, Optional
from google.genai import types

from ...config import settings
from ...domain.models.content_studio import RecommendedImageItem
from .gemini_client import get_gemini_client, has_gemini_credentials

logger = logging.getLogger(__name__)


class RerankerService:
    def __init__(self):
        pass

    async def rerank_with_gemini(
        self,
        prompt: str,
        candidates: List[Dict[str, Any]],
        api_key_override: Optional[str] = None,
        base_url_override: Optional[str] = None,
    ) -> List[RecommendedImageItem]:
        """Reranks image candidates using Gemini with gateway / http_options support."""
        client = get_gemini_client(api_key=api_key_override, base_url=base_url_override)

        # Build candidate payload for Gemini evaluation
        items_payload = []
        for i, c in enumerate(candidates[:12]):
            items_payload.append({
                "index": i,
                "title": c.get("title", ""),
                "snippet": c.get("snippet", ""),
                "domain": c.get("source_domain", ""),
            })

        eval_prompt = (
            f"You are an expert AI Art Director and Visual Content Reranker.\n"
            f"User Search Prompt: '{prompt}'\n\n"
            f"Evaluate each candidate image based on:\n"
            f"1. relevance_score (0.0 to 1.0): semantic match with user prompt\n"
            f"2. aesthetic_score (0.0 to 1.0): photographic & compositional quality\n"
            f"3. context_score (0.0 to 1.0): utility for editorial or social trend content\n"
            f"4. overall_score (0.0 to 1.0): weighted overall suitability\n"
            f"5. reasoning: 1 concise sentence explaining the match\n"
            f"6. tags: 2-4 keywords (e.g. ['cinematic', 'minimalist', 'high-contrast'])\n\n"
            f"Candidate Visuals:\n{json.dumps(items_payload, indent=2)}\n\n"
            f"Return ONLY valid JSON as a list of objects with this schema:\n"
            f'[\n  {{\n    "index": 0,\n    "relevance_score": 0.95,\n    "aesthetic_score": 0.90,\n    "context_score": 0.92,\n    "overall_score": 0.93,\n    "reasoning": "Clear visual match with rich atmospheric lighting.",\n    "tags": ["lighting", "trend"]\n  }}\n]'
        )

        response = client.models.generate_content(
            model=settings.GEMINI_TEXT_MODEL,
            contents=eval_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        raw_text = (response.text or "").strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        elif raw_text.startswith("```"):
            raw_text = raw_text[3:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
        scores_list = json.loads(raw_text.strip(), strict=False)
        score_map = {item["index"]: item for item in scores_list if "index" in item}

        results: List[RecommendedImageItem] = []
        for i, cand in enumerate(candidates):
            eval_data = score_map.get(i, {})
            rel = float(eval_data.get("relevance_score", 0.75))
            aes = float(eval_data.get("aesthetic_score", 0.80))
            ctx = float(eval_data.get("context_score", 0.75))
            ovr = float(eval_data.get("overall_score", round(rel * 0.5 + aes * 0.3 + ctx * 0.2, 3)))

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
                reasoning=eval_data.get("reasoning", f"Ranked high for '{prompt}' by Gemini."),
                tags=eval_data.get("tags", ["curated", "recommended"]),
            ))

        results.sort(key=lambda x: x.overall_score, reverse=True)
        return results

    def _heuristic_fallback(self, prompt: str, candidates: List[Dict[str, Any]]) -> List[RecommendedImageItem]:
        """Keyword and metadata heuristic reranker when LLM is unavailable."""
        prompt_words = set(re.findall(r"\w+", prompt.lower()))
        results = []
        for i, c in enumerate(candidates):
            title = c.get("title", "").lower()
            snippet = c.get("snippet", "").lower()
            matches = sum(1 for w in prompt_words if w in title or w in snippet)
            rel = min(0.96, 0.60 + (matches * 0.08))
            aes = 0.82
            ctx = 0.78
            ovr = round(rel * 0.5 + aes * 0.3 + ctx * 0.2, 3)

            results.append(RecommendedImageItem(
                id=c["id"],
                image_url=c["image_url"],
                thumbnail_url=c["thumbnail_url"],
                title=c["title"],
                snippet=c.get("snippet", ""),
                source_domain=c.get("source_domain", ""),
                width=c.get("width"),
                height=c.get("height"),
                relevance_score=round(rel, 3),
                aesthetic_score=aes,
                context_score=ctx,
                overall_score=ovr,
                reasoning=f"Visual metadata match with {matches} query concepts.",
                tags=list(prompt_words)[:3] or ["trend", "visual"],
            ))
        results.sort(key=lambda x: x.overall_score, reverse=True)
        return results

    async def rerank(
        self,
        prompt: str,
        candidates: List[Dict[str, Any]],
        model_type: str = "hybrid",
        gemini_api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> List[RecommendedImageItem]:
        """Unified entrypoint for reranking candidate visuals."""
        if not candidates:
            return []

        if has_gemini_credentials(gemini_api_key):
            try:
                return await self.rerank_with_gemini(prompt, candidates, gemini_api_key, base_url)
            except Exception as e:
                logger.warning(f"Gemini reranking failed: {e}. Falling back to heuristic reranker.")
                return self._heuristic_fallback(prompt, candidates)

        return self._heuristic_fallback(prompt, candidates)


reranker_service = RerankerService()


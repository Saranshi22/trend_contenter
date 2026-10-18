import re
import json
import logging
from typing import Any, Dict, List, Optional
from google.genai import types

from ...config import settings
from ...domain.models.content_studio import RecommendedImageItem
from .gemini_client import get_gemini_client, has_gemini_credentials
from .search_service import deduplicate_image_candidates

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
        visual_direction: Optional[str] = None,
        headline: Optional[str] = None,
    ) -> List[RecommendedImageItem]:
        """Reranks image candidates using Gemini with gateway / http_options support."""
        client = get_gemini_client(api_key=api_key_override, base_url=base_url_override)

        # Ensure deduplicated candidates
        unique_candidates = deduplicate_image_candidates(candidates)
        if not unique_candidates:
            return []

        # Build candidate payload for Gemini evaluation (evaluating up to 12 items)
        items_payload = []
        for i, c in enumerate(unique_candidates[:12]):
            items_payload.append({
                "index": i,
                "title": c.get("title", ""),
                "snippet": c.get("snippet", ""),
                "domain": c.get("source_domain", ""),
            })

        context_lines = [f"Campaign Prompt: '{prompt}'"]
        if headline:
            context_lines.append(f"Campaign Headline/Concept: '{headline}'")
        if visual_direction:
            context_lines.append(f"Visual Art Direction: '{visual_direction}'")
        campaign_context = "\n".join(context_lines)

        eval_prompt = (
            f"You are an expert AI Art Director and Visual Content Reranker.\n"
            f"{campaign_context}\n\n"
            f"Evaluate each candidate image strictly based on authentic relevance to this specific campaign:\n"
            f"1. relevance_score (0.0 to 1.0): semantic & topical match with campaign concept\n"
            f"2. aesthetic_score (0.0 to 1.0): photographic, compositional, or conceptual visual quality\n"
            f"3. context_score (0.0 to 1.0): utility as an authentic inspiration aid for editorial/social trend content\n"
            f"4. overall_score (0.0 to 1.0): weighted overall suitability (relevance * 0.5 + aesthetic * 0.3 + context * 0.2)\n"
            f"5. reasoning: 1 concise sentence explaining genuine relevance or lack thereof\n"
            f"6. tags: 2-4 keywords (e.g. ['automotive', 'concept-art', 'lighting'])\n\n"
            f"Candidate Visuals:\n{json.dumps(items_payload, indent=2)}\n\n"
            f"Return ONLY valid JSON as a list of objects with this schema:\n"
            f'[\n  {{\n    "index": 0,\n    "relevance_score": 0.95,\n    "aesthetic_score": 0.90,\n    "context_score": 0.92,\n    "overall_score": 0.93,\n    "reasoning": "Direct match for flying-car aerospace concept.",\n    "tags": ["aerospace", "concept"]\n  }}\n]'
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

        score_map = {}
        try:
            scores_list = json.loads(raw_text.strip(), strict=False)
            score_map = {item["index"]: item for item in scores_list if isinstance(item, dict) and "index" in item}
        except Exception as e:
            logger.warning(f"Failed to parse Gemini reranker JSON response: {e}")

        # Build prompt words for honest fallback scoring if an item was missing from Gemini's output
        query_words = set(re.findall(r"\w+", f"{prompt} {headline or ''}".lower()))
        stop_words = {"the", "a", "an", "and", "or", "for", "with", "in", "of", "to", "on", "at", "is"}
        meaningful_words = {w for w in query_words if len(w) > 2 and w not in stop_words}

        results: List[RecommendedImageItem] = []
        for i, cand in enumerate(unique_candidates):
            if i in score_map:
                eval_data = score_map[i]
                rel = float(eval_data.get("relevance_score", 0.50))
                aes = float(eval_data.get("aesthetic_score", 0.50))
                ctx = float(eval_data.get("context_score", 0.50))
                ovr = float(eval_data.get("overall_score", round(rel * 0.5 + aes * 0.3 + ctx * 0.2, 3)))
                reasoning = eval_data.get("reasoning", "Ranked by AI visual director.")
                tags = eval_data.get("tags", ["visual-reference"])
            else:
                # Honest fallback: do not fabricate high relevance scores
                title_text = f"{cand.get('title', '')} {cand.get('snippet', '')}".lower()
                matches = sum(1 for w in meaningful_words if w in title_text)
                if matches > 0:
                    match_ratio = matches / max(len(meaningful_words), 1)
                    rel = round(min(0.85, 0.40 + match_ratio * 0.45), 3)
                    aes = 0.70
                    ctx = 0.65
                    reasoning = f"Matched {matches} campaign keyword(s) in reference metadata."
                    tags = list(meaningful_words)[:3]
                else:
                    rel = 0.30
                    aes = 0.50
                    ctx = 0.35
                    reasoning = "Retrieved candidate; pending AI art director evaluation."
                    tags = ["reference"]
                ovr = round(rel * 0.5 + aes * 0.3 + ctx * 0.2, 3)

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
                aesthetic_score=round(aes, 3) if aes is not None else None,
                context_score=round(ctx, 3) if ctx is not None else None,
                overall_score=round(ovr, 3),
                reasoning=reasoning,
                tags=tags,
            ))

        results.sort(key=lambda x: x.overall_score, reverse=True)
        return results

    def _heuristic_fallback(
        self,
        prompt: str,
        candidates: List[Dict[str, Any]],
        visual_direction: Optional[str] = None,
        headline: Optional[str] = None,
    ) -> List[RecommendedImageItem]:
        """Keyword and metadata heuristic reranker when LLM is unavailable."""
        unique_candidates = deduplicate_image_candidates(candidates)
        if not unique_candidates:
            return []

        all_text = f"{prompt} {headline or ''} {visual_direction or ''}".lower()
        words = set(re.findall(r"\w+", all_text))
        stop_words = {"the", "a", "an", "and", "or", "for", "with", "in", "of", "to", "on", "at", "is", "this", "that"}
        meaningful_words = {w for w in words if len(w) > 2 and w not in stop_words}

        results: List[RecommendedImageItem] = []
        for c in unique_candidates:
            title = c.get("title", "").lower()
            snippet = c.get("snippet", "").lower()
            text_corpus = f"{title} {snippet}"

            matches = sum(1 for w in meaningful_words if w in text_corpus)
            if matches > 0:
                match_ratio = matches / max(len(meaningful_words), 1)
                rel = round(min(0.92, 0.45 + match_ratio * 0.45), 3)
                # Estimate aesthetic score mildly based on resolution availability
                aes = 0.80 if (c.get("width") and c.get("width") >= 800) else 0.70
                ctx = round(min(0.85, 0.50 + match_ratio * 0.35), 3)
                reasoning = f"Visual metadata matched {matches} campaign keyword(s)."
                tags = [w for w in meaningful_words if w in text_corpus][:4] or ["visual-reference"]
            else:
                rel = 0.30
                aes = 0.55
                ctx = 0.35
                reasoning = "Retrieved reference candidate with modest direct text keyword overlap."
                tags = ["reference"]

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
                aesthetic_score=round(aes, 3),
                context_score=round(ctx, 3),
                overall_score=round(ovr, 3),
                reasoning=reasoning,
                tags=tags,
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
        visual_direction: Optional[str] = None,
        headline: Optional[str] = None,
    ) -> List[RecommendedImageItem]:
        """Unified entrypoint for reranking candidate visuals."""
        if not candidates:
            return []

        if has_gemini_credentials(gemini_api_key):
            try:
                return await self.rerank_with_gemini(
                    prompt=prompt,
                    candidates=candidates,
                    api_key_override=gemini_api_key,
                    base_url_override=base_url,
                    visual_direction=visual_direction,
                    headline=headline,
                )
            except Exception as e:
                logger.warning(f"Gemini reranking failed ({type(e).__name__}). Falling back to heuristic reranker.")
                return self._heuristic_fallback(
                    prompt=prompt,
                    candidates=candidates,
                    visual_direction=visual_direction,
                    headline=headline,
                )

        return self._heuristic_fallback(
            prompt=prompt,
            candidates=candidates,
            visual_direction=visual_direction,
            headline=headline,
        )


reranker_service = RerankerService()

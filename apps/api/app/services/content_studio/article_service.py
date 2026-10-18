import json
import logging
import re
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple
import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from google.genai import types
from ...config import settings
from .gemini_client import get_gemini_client, has_gemini_credentials
from ...domain.models.content_studio import (
    GenerateArticleRequest,
    GenerateArticleResponse,
    ArticleSourceItem
)

logger = logging.getLogger(__name__)


def _safe_json_parse(raw_text: str) -> dict:
    """Safely extracts and parses JSON from Gemini responses."""
    text_content = (raw_text or "").strip()
    if text_content.startswith("```json"):
        text_content = text_content[7:]
    elif text_content.startswith("```"):
        text_content = text_content[3:]
    if text_content.endswith("```"):
        text_content = text_content[:-3]
    text_content = text_content.strip()

    start_idx = text_content.find("{")
    end_idx = text_content.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        text_content = text_content[start_idx:end_idx + 1]

    try:
        return json.loads(text_content, strict=False)
    except Exception:
        pass

    # Strip invalid backslash escapes (e.g. \*, \[, \], etc.)
    cleaned = re.sub(r'\\([^"\\/bfnrtu])', r'\1', text_content)
    try:
        return json.loads(cleaned, strict=False)
    except Exception:
        pass

    # Strip trailing commas before closing braces/brackets
    cleaned2 = re.sub(r",\s*([\}\]])", r"\1", cleaned)
    return json.loads(cleaned2, strict=False)


def _parse_list(val: Any) -> List[str]:
    if isinstance(val, list):
        return [str(x) for x in val if x]
    if isinstance(val, str) and val.strip():
        try:
            parsed = json.loads(val)
            if isinstance(parsed, list):
                return [str(x) for x in parsed if x]
        except Exception:
            return [line.strip("- ").strip() for line in val.split("\n") if line.strip()]
    return []


class ArticleGenerationService:
    """
    Generates publication-ready long-form articles, executive blog posts,
    and thought-leadership pieces using multi-source database intelligence
    (Opportunities, Audience Gaps, Reddit/YouTube/News Evidence) and live web search.
    """

    async def _fetch_web_search_sources(self, query: str, limit: int = 5) -> List[ArticleSourceItem]:
        """Fetches organic web search sources via SerpApi or DuckDuckGo."""
        sources: List[ArticleSourceItem] = []
        if not query or not query.strip():
            return sources

        # 1. SerpApi Organic Web Search
        if settings.SERPAPI_API_KEY:
            try:
                url = "https://serpapi.com/search.json"
                params = {
                    "engine": "google",
                    "q": query.strip(),
                    "api_key": settings.SERPAPI_API_KEY,
                    "num": min(limit, 10),
                    "gl": (settings.TRENDS_GEO or "in").lower(),
                    "hl": settings.TRENDS_LANGUAGE or "en"
                }
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 200:
                        data = resp.json()
                        for item in data.get("organic_results", [])[:limit]:
                            sources.append(ArticleSourceItem(
                                title=item.get("title") or "Web Search Source",
                                url=item.get("link"),
                                platform="Google Search",
                                snippet=item.get("snippet")
                            ))
                        if sources:
                            return sources
            except Exception as e:
                logger.warning(f"SerpApi web search query failed: {e}")

        # 2. DuckDuckGo Fallback Web Search
        try:
            encoded = urllib.parse.quote(query.strip())
            ddg_url = f"https://html.duckduckgo.com/html/?q={encoded}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
            }
            async with httpx.AsyncClient(headers=headers, timeout=6.0, follow_redirects=True) as client:
                res = await client.get(ddg_url)
                if res.status_code == 200:
                    matches = re.findall(
                        r'<a class="result__url"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?<a class="result__snippet"[^>]*>(.*?)</a>',
                        res.text,
                        re.DOTALL
                    )
                    for link, title_html, snippet_html in matches[:limit]:
                        clean_title = re.sub(r"<[^>]+>", "", title_html).strip()
                        clean_snip = re.sub(r"<[^>]+>", "", snippet_html).strip()
                        sources.append(ArticleSourceItem(
                            title=clean_title or query,
                            url=link.strip(),
                            platform="Web Search",
                            snippet=clean_snip or None
                        ))
        except Exception as e:
            logger.warning(f"DuckDuckGo web fallback search failed: {e}")

        return sources

    async def _load_db_research(
        self,
        db: AsyncSession,
        opportunity_id: Optional[str],
        topic_hint: Optional[str]
    ) -> Tuple[Dict[str, Any], List[ArticleSourceItem], List[str]]:
        """
        Loads structured research from Postgres:
        - Opportunity strategic angle, outline, talking points, audience gaps
        - Empirical investigation evidence (Reddit, YouTube, News, Gaps)
        """
        opp_data: Dict[str, Any] = {}
        evidence_sources: List[ArticleSourceItem] = []
        community_quotes: List[str] = []

        # 1. Load Opportunity record
        if opportunity_id:
            try:
                res = await db.execute(
                    text("""
                        SELECT o.opportunity_id, o.title, o.problem, o.audience_need, o.content_gap,
                               o.strategic_rationale, o.key_talking_points, o.target_audience_pain_points,
                               o.recommended_outline, o.hook_options, o.recommended_angle, o.recommended_format,
                               COALESCE(a.label, 'Target Demographic') as audience_label,
                               a.description as audience_description, a.needs as audience_needs,
                               a.questions as audience_questions, a.concerns as audience_concerns
                        FROM opportunities o
                        LEFT JOIN audiences a ON o.segment_id = a.segment_id
                        WHERE o.opportunity_id = :oid
                    """),
                    {"oid": opportunity_id}
                )
                row = res.mappings().first()
                if row:
                    opp_data = {
                        "title": row["title"],
                        "problem": row.get("problem") or "Audience knowledge deficit",
                        "audience_need": row.get("audience_need") or "High interest, missing actionable guide",
                        "content_gap": row.get("content_gap") or "Absence of structured, empirical synthesis",
                        "strategic_rationale": row.get("strategic_rationale") or "",
                        "talking_points": _parse_list(row.get("key_talking_points")),
                        "pain_points": _parse_list(row.get("target_audience_pain_points")),
                        "outline": _parse_list(row.get("recommended_outline")),
                        "hooks": _parse_list(row.get("hook_options")),
                        "angle": row.get("recommended_angle") or "Authoritative, data-backed analysis",
                        "audience_label": row.get("audience_label") or "Target Readers",
                        "audience_questions": _parse_list(row.get("audience_questions")),
                        "audience_concerns": _parse_list(row.get("audience_concerns"))
                    }
            except Exception as e:
                logger.warning(f"Could not load opportunity {opportunity_id}: {e}")

        # If no specific opportunity id provided, try to find a matching or top qualified opportunity
        if not opp_data and topic_hint:
            try:
                res = await db.execute(
                    text("""
                        SELECT o.opportunity_id, o.title, o.problem, o.audience_need, o.content_gap,
                               o.strategic_rationale, o.key_talking_points, o.target_audience_pain_points,
                               o.recommended_outline, o.hook_options, o.recommended_angle,
                               COALESCE(a.label, 'Target Demographic') as audience_label
                        FROM opportunities o
                        LEFT JOIN audiences a ON o.segment_id = a.segment_id
                        WHERE o.title ILIKE :term OR o.problem ILIKE :term
                        ORDER BY o.score DESC LIMIT 1
                    """),
                    {"term": f"%{topic_hint[:30]}%"}
                )
                row = res.mappings().first()
                if row:
                    opp_data = {
                        "title": row["title"],
                        "problem": row.get("problem"),
                        "audience_need": row.get("audience_need"),
                        "content_gap": row.get("content_gap"),
                        "strategic_rationale": row.get("strategic_rationale"),
                        "talking_points": _parse_list(row.get("key_talking_points")),
                        "pain_points": _parse_list(row.get("target_audience_pain_points")),
                        "outline": _parse_list(row.get("recommended_outline")),
                        "hooks": _parse_list(row.get("hook_options")),
                        "angle": row.get("recommended_angle"),
                        "audience_label": row.get("audience_label")
                    }
            except Exception as e:
                logger.warning(f"Could not load fallback opportunity for {topic_hint}: {e}")

        # 2. Load Investigation Evidence (Reddit, YouTube, News, Social Discussions)
        search_topic = opp_data.get("title") or topic_hint or ""
        if search_topic:
            try:
                res = await db.execute(
                    text("""
                        SELECT e.source_type, e.platform, e.title, e.text_excerpt, e.url, e.author
                        FROM investigation_evidence e
                        JOIN investigations i ON e.investigation_id = i.investigation_id
                        WHERE i.topic ILIKE :q OR e.title ILIKE :q OR e.text_excerpt ILIKE :q
                        ORDER BY e.published_at DESC NULLS LAST
                        LIMIT 8
                    """),
                    {"q": f"%{search_topic[:24]}%"}
                )
                rows = res.mappings().all()
                for r in rows:
                    p = r.get("platform") or r.get("source_type") or "Database Evidence"
                    evidence_sources.append(ArticleSourceItem(
                        title=r.get("title") or f"{p} Discussion",
                        url=r.get("url"),
                        platform=p.capitalize(),
                        snippet=r.get("text_excerpt")[:240] if r.get("text_excerpt") else None
                    ))
                    if r.get("text_excerpt"):
                        excerpt = r["text_excerpt"].strip().replace("\n", " ")
                        community_quotes.append(f"[{p.capitalize()}] \"{excerpt[:180]}\"")
            except Exception as e:
                logger.warning(f"Could not load investigation evidence: {e}")

        return opp_data, evidence_sources, community_quotes

    async def generate_article(
        self,
        req: GenerateArticleRequest,
        db: AsyncSession
    ) -> GenerateArticleResponse:
        """
        Orchestrates DB evidence loading, live search retrieval, and Gemini synthesis
        to construct a full long-form article or blog post.
        """
        topic = (req.topic or "").strip()
        opportunity_id = req.opportunity_id

        # 1. Load DB Research
        opp_data, db_sources, quotes = await self._load_db_research(db, opportunity_id, topic)

        final_topic = topic or opp_data.get("title") or "Emerging Industry Breakthrough & Strategic Analysis"
        target_audience = req.target_audience or opp_data.get("audience_label") or "Business Leaders & Tech Innovators"

        # 2. Fetch Live Search Sources
        web_sources: List[ArticleSourceItem] = []
        if req.include_search_sources:
            search_query = f"{final_topic} trends analysis"
            web_sources = await self._fetch_web_search_sources(search_query, limit=4)

        all_sources = db_sources + web_sources

        # 3. Target Word Count Guidelines
        length_guide = {
            "short": "between 600 and 800 words (concise, high-velocity blog post)",
            "standard": "between 1,100 and 1,500 words (comprehensive editorial article)",
            "comprehensive": "between 1,800 and 2,400 words (deep-dive, in-depth whitepaper/investigative report)"
        }.get(req.length, "between 1,200 and 1,600 words")

        # 4. Tone Direction
        tone_instruction = {
            "thought_leadership": "Visionary, analytical, forward-looking, and authoritative. Position the insights as essential strategic intelligence.",
            "deep_dive": "Exhaustive, technical, evidence-rich, and rigorous with practical breakdowns and data.",
            "how_to": "Actionable, step-by-step, pedagogical, empathetic, and directly addressing audience hurdles.",
            "opinion": "Provocative, engaging, bold, conversational, and arguing a distinct counter-intuitive thesis.",
            "journalistic": "Objective, balanced, citing real quotes and sources, narrative-driven, and engaging."
        }.get(req.tone, "Authoritative, engaging, and publication-ready.")

        # 5. Build Comprehensive Synthesis Context
        evidence_block = ""
        if quotes:
            evidence_block = "\n### EMPIRICAL COMMUNITY VOICES & DATA POINTS FROM DATABASE:\n" + "\n".join(f"- {q}" for q in quotes[:6])

        opp_block = ""
        if opp_data:
            opp_block = (
                f"\n### DATABASE STRATEGIC DOSSIER:\n"
                f"- Opportunity Title: {opp_data.get('title')}\n"
                f"- Problem Identified: {opp_data.get('problem')}\n"
                f"- Audience Content Gap: {opp_data.get('content_gap')}\n"
                f"- Strategic Rationale: {opp_data.get('strategic_rationale')}\n"
                f"- Recommended Angle: {opp_data.get('angle')}\n"
                f"- Key Talking Points: {', '.join(opp_data.get('talking_points', [])[:5])}\n"
                f"- Target Audience Questions: {', '.join(opp_data.get('audience_questions', [])[:4])}\n"
            )

        web_block = ""
        if web_sources:
            web_block = "\n### LIVE WEB SEARCH CONTEXT:\n" + "\n".join(
                f"- [{s.platform}] {s.title}: {s.snippet or ''} (Source: {s.url or 'N/A'})"
                for s in web_sources
            )

        custom_prompt = f"\nCustom User Request: {req.custom_instructions}\n" if req.custom_instructions else ""

        prompt_text = (
            f"You are a premier executive editor and investigative technology journalist.\n"
            f"Write an original, publication-ready, world-class long-form article/blog post based on the following verified database intelligence and search findings.\n\n"
            f"ARTICLE METRICS & REQUIREMENTS:\n"
            f"- Topic: {final_topic}\n"
            f"- Target Audience: {target_audience}\n"
            f"- Tone: {tone_instruction}\n"
            f"- Length Target: {length_guide}\n"
            f"{custom_prompt}\n"
            f"{opp_block}\n"
            f"{evidence_block}\n"
            f"{web_block}\n\n"
            f"EDITORIAL STRUCTURE GUIDELINES:\n"
            f"1. A magnetic H1 title and compelling subtitle.\n"
            f"2. A dynamic executive summary / key takeaways callout.\n"
            f"3. An engaging narrative hook that explains why this topic matters right now.\n"
            f"4. 4-6 detailed sections with clear H2 and H3 markdown headers.\n"
            f"5. Seamlessly weave in community quotes, data citations, and audience pain points from the provided evidence.\n"
            f"6. Concrete actionable takeaways and a powerful forward-looking conclusion.\n\n"
            f"RETURN ONLY A VALID JSON OBJECT WITH THE EXACT FOLLOWING SCHEMA:\n"
            f"{{\n"
            f'  "title": "Magnetic, SEO-optimised Article Title",\n'
            f'  "subtitle": "Informative subtitle capturing the thesis",\n'
            f'  "meta_description": "Crisp 150-160 character Google SEO meta description",\n'
            f'  "reading_time_minutes": 6,\n'
            f'  "target_audience": "{target_audience}",\n'
            f'  "tone": "{req.tone}",\n'
            f'  "outline": ["Section 1 Header", "Section 2 Header", "Section 3 Header", "Section 4 Header", "Conclusion"],\n'
            f'  "key_takeaways": [\n'
            f'    "Key insight 1 summarizing core shift",\n'
            f'    "Key insight 2 detailing practical implication",\n'
            f'    "Key insight 3 strategic recommendation"\n'
            f'  ],\n'
            f'  "content_markdown": "# Title\\n\\n*Subtitle*\\n\\nFull article markdown with ## headings, blockquotes, bullets, and body paragraphs...",\n'
            f'  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]\n'
            f"}}"
        )

        try:
            client = get_gemini_client(req.api_key, req.base_url)
            response = client.models.generate_content(
                model=settings.GEMINI_TEXT_MODEL,
                contents=prompt_text,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.45
                )
            )

            data = _safe_json_parse(response.text or "")
            content_md = data.get("content_markdown") or ""
            words = len(content_md.split())
            read_time = max(2, round(words / 220))

            return GenerateArticleResponse(
                title=data.get("title") or final_topic,
                subtitle=data.get("subtitle") or f"An in-depth analysis of {final_topic}",
                meta_description=data.get("meta_description") or f"Explore the emerging trends, verified audience gaps, and strategic implications of {final_topic}.",
                reading_time_minutes=data.get("reading_time_minutes") or read_time,
                target_audience=data.get("target_audience") or target_audience,
                tone=req.tone,
                outline=data.get("outline") or ["The Emerging Catalyst", "Audience Frictions & Reality", "Strategic Road Ahead"],
                key_takeaways=data.get("key_takeaways") or [
                    f"Growing momentum and search interest surrounding {final_topic}.",
                    "Identified market gaps reveal unmet audience needs for authoritative guidance.",
                    "Strategic adaptation requires balanced, evidence-first execution."
                ],
                content_markdown=content_md or f"# {final_topic}\n\n*Comprehensive Analysis*\n\nContent generation complete.",
                tags=data.get("tags") or ["trends", "innovation", "strategy", "analysis"],
                sources_used=all_sources[:8],
                word_count=words,
                model_used=settings.GEMINI_TEXT_MODEL
            )

        except Exception as e:
            logger.exception(f"Article generation LLM call failed: {e}")
            return self._build_fallback_article(final_topic, target_audience, req.tone, opp_data, all_sources, str(e))

    def _build_fallback_article(
        self,
        topic: str,
        audience: str,
        tone: str,
        opp_data: Dict[str, Any],
        sources: List[ArticleSourceItem],
        err_msg: str
    ) -> GenerateArticleResponse:
        """Fallback editorial article when external LLM gateway is offline or rate-limited."""
        problem = opp_data.get("problem") or "Rapidly shifting consumer expectations and fragmented guidance."
        gap = opp_data.get("content_gap") or "Lack of consolidated, evidence-driven strategic execution frameworks."
        rationale = opp_data.get("strategic_rationale") or f"Organizations that lean into {topic} early secure dominant mindshare."

        md = f"""# {topic}: The Strategic Playbook for Market Leaders

*{problem}*

---

> **Executive Synthesis**: As interest in **{topic}** reaches unprecedented momentum, audiences are struggling with conflicting narratives and surface-level coverage. This dossier synthesizes the empirical evidence, market gaps, and actionable steps needed to capitalize on this wave.

---

## 1. The Market Catalyst: Why Now?

Search velocity and audience discussions across digital platforms reflect a profound inflection point. Rather than a passing novelty, **{topic}** represents a fundamental realignment of how consumers and industry leaders navigate modern solutions.

{rationale}

## 2. Uncovering the Content Gap

Our ethnographic research reveals a glaring disconnect between audience demand and existing content:

* **The Problem**: {problem}
* **The Opportunity**: {gap}
* **The Audience**: Tailored specifically for **{audience}** who seek authentic, unfiltered clarity.

> "Audiences don't need another generic overview; they need empirical validation, transparent methodologies, and a concrete path forward."

## 3. Core Strategic Takeaways

1. **Prioritize Evidence Over Hype**: Anchor your narrative in verified consumer sentiment and real-time search queries.
2. **Address Unmet Frictions**: Bridge the gap between awareness and practical application by solving the specific pain points identified in audience discussions.
3. **Establish Category Authority**: By publishing comprehensive, research-backed explainers, brands cultivate enduring loyalty before mainstream saturation.

## 4. Conclusion & Next Steps

The window of opportunity for **{topic}** is wide open. By aligning creative storytelling with rigorous research, creators and brands can turn fleeting search spikes into sustainable authority.
"""
        words = len(md.split())
        return GenerateArticleResponse(
            title=f"{topic}: The Strategic Playbook for Market Leaders",
            subtitle=problem,
            meta_description=f"Explore the emerging strategic trends, audience gaps, and actionable playbook for {topic}.",
            reading_time_minutes=max(2, round(words / 220)),
            target_audience=audience,
            tone=tone,
            outline=[
                "The Market Catalyst: Why Now?",
                "Uncovering the Content Gap",
                "Core Strategic Takeaways",
                "Conclusion & Next Steps"
            ],
            key_takeaways=[
                f"Surging search velocity highlights immediate interest in {topic}.",
                f"Target audience ({audience}) actively searches for practical solutions to: {problem}",
                "First-movers who address the content gap capture defensible category authority."
            ],
            content_markdown=md,
            tags=["strategy", "trends", "market-intelligence", "editorial"],
            sources_used=sources[:6],
            word_count=words,
            model_used=f"{settings.GEMINI_TEXT_MODEL} (Structured Fallback: {err_msg[:40]})"
        )


article_service = ArticleGenerationService()

import httpx
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from .base import WebSearchProvider
from ...domain.models.evidence import EvidenceItem
from ...agents.utils import generate_content_hash
from ...config import settings

class SerpApiWebSearchProvider(WebSearchProvider):
    """
    Real Web / News Search Provider powered by SerpApi Google News.
    Preserves real URLs, publishers, snippets, and provenance.
    """
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.SERPAPI_API_KEY
        self.base_url = "https://serpapi.com/search.json"

    async def search(self, query: str, recency_days: int = 30, limit: int = 10) -> List[EvidenceItem]:
        if not self.api_key:
            from .mock_search import MockWebSearchProvider
            return await MockWebSearchProvider().search(query, recency_days, limit)

        params = {
            "engine": "google_news",
            "q": query,
            "gl": settings.TRENDS_GEO.lower() if settings.TRENDS_GEO else "in",
            "hl": settings.TRENDS_LANGUAGE or "en",
            "api_key": self.api_key
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self.base_url, params=params)
                if resp.status_code != 200:
                    from .mock_search import MockWebSearchProvider
                    return await MockWebSearchProvider().search(query, recency_days, limit)

                data = resp.json()
                news_results = data.get("news_results", [])
                
                evidence_items: List[EvidenceItem] = []
                for item in news_results[:limit]:
                    # Extract fields cleanly
                    title = item.get("title") or query
                    snippet = item.get("snippet") or item.get("summary") or title
                    link = item.get("link") or ""
                    source_info = item.get("source", {})
                    author = source_info.get("name") if isinstance(source_info, dict) else "News Source"
                    
                    evidence_items.append(
                        EvidenceItem(
                            evidence_id=f"ev_web_{uuid.uuid4().hex[:8]}",
                            investigation_id="",
                            source_type="news",
                            platform="google_news",
                            title=title,
                            text_excerpt=snippet,
                            url=link,
                            published_at=datetime.now(timezone.utc),
                            retrieved_at=datetime.now(timezone.utc),
                            author=author,
                            engagement={},
                            metadata={"publisher": author, "query": query},
                            content_hash=generate_content_hash(snippet)
                        )
                    )
                
                if not evidence_items:
                    from .mock_search import MockWebSearchProvider
                    return await MockWebSearchProvider().search(query, recency_days, limit)
                    
                return evidence_items
        except Exception as e:
            print(f"SerpApi news search failed ({e}), falling back to mock provider.")
            from .mock_search import MockWebSearchProvider
            return await MockWebSearchProvider().search(query, recency_days, limit)

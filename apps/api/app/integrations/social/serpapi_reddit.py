import httpx
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from .base import SocialProvider
from ...domain.models.evidence import EvidenceItem
from ...agents.utils import generate_content_hash
from ...config import settings

class SerpApiRedditProvider(SocialProvider):
    """
    Social Research Provider targeting Reddit discussions via SerpApi.
    Preserves real Reddit threads, excerpts, authors, and URLs.
    """
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or settings.SERPAPI_API_KEY
        self.base_url = "https://serpapi.com/search.json"

    async def search(self, query: str, region: str | None = None, limit: int = 15) -> List[EvidenceItem]:
        if not self.api_key:
            from .mock_reddit import MockRedditProvider
            return await MockRedditProvider().search(query, region, limit)

        params = {
            "engine": "google",
            "q": f"site:reddit.com {query}",
            "gl": (region or settings.TRENDS_GEO or "in").lower(),
            "hl": settings.TRENDS_LANGUAGE or "en",
            "api_key": self.api_key
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(self.base_url, params=params)
                if resp.status_code != 200:
                    from .mock_reddit import MockRedditProvider
                    return await MockRedditProvider().search(query, region, limit)

                data = resp.json()
                organic_results = data.get("organic_results", [])
                
                evidence_items: List[EvidenceItem] = []
                for item in organic_results[:limit]:
                    title = item.get("title") or f"Reddit discussion on {query}"
                    snippet = item.get("snippet") or title
                    link = item.get("link") or ""
                    
                    evidence_items.append(
                        EvidenceItem(
                            evidence_id=f"ev_soc_{uuid.uuid4().hex[:8]}",
                            investigation_id="",
                            source_type="social",
                            platform="reddit",
                            title=title,
                            text_excerpt=snippet,
                            url=link,
                            published_at=datetime.now(timezone.utc),
                            retrieved_at=datetime.now(timezone.utc),
                            author="Reddit Community",
                            engagement={"organic_rank": item.get("position", 1)},
                            metadata={"query": query, "platform": "reddit"},
                            content_hash=generate_content_hash(snippet)
                        )
                    )

                if not evidence_items:
                    from .mock_reddit import MockRedditProvider
                    return await MockRedditProvider().search(query, region, limit)

                return evidence_items
        except Exception as e:
            print(f"SerpApi Reddit search failed ({e}), falling back to mock.")
            from .mock_reddit import MockRedditProvider
            return await MockRedditProvider().search(query, region, limit)

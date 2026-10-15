import uuid
from datetime import datetime, timezone
from typing import List
from .base import WebSearchProvider
from ...domain.models.evidence import EvidenceItem
from ...agents.utils import generate_content_hash

class MockWebSearchProvider(WebSearchProvider):
    async def search(self, query: str, recency_days: int = 30, limit: int = 10) -> List[EvidenceItem]:
        text = f"Recent news article explaining the basics of {query} and its adoption in schools."
        return [
            EvidenceItem(
                evidence_id=f"ev_web_{uuid.uuid4().hex[:8]}",
                investigation_id="", 
                source_type="web",
                platform="mock_search",
                title=f"The Rise of {query}",
                text_excerpt=text,
                url=f"https://news.mock.com/article/{query.replace(' ', '_')}",
                published_at=datetime.now(timezone.utc),
                retrieved_at=datetime.now(timezone.utc),
                author="Tech Reporter",
                content_hash=generate_content_hash(text)
            )
        ]

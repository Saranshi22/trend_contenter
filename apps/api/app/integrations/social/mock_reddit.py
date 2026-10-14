import uuid
from datetime import datetime, timezone
from typing import List
from .base import SocialProvider
from ...domain.models.evidence import EvidenceItem
from ...agents.utils import generate_content_hash

class MockRedditProvider(SocialProvider):
    async def search(self, query: str, region: str | None = None, limit: int = 50) -> List[EvidenceItem]:
        # Return mock data for demo purposes
        text = f"Mock reddit discussion about {query}. Users are expressing concerns over accuracy and how to use it practically."
        return [
            EvidenceItem(
                evidence_id=f"ev_soc_{uuid.uuid4().hex[:8]}",
                investigation_id="", # Assigned by the graph
                source_type="social",
                platform="reddit",
                title=f"Discussion: {query}",
                text_excerpt=text,
                url=f"https://reddit.com/r/technology/comments/mock/{query.replace(' ', '_')}",
                published_at=datetime.now(timezone.utc),
                retrieved_at=datetime.now(timezone.utc),
                author="mock_user_123",
                engagement={"upvotes": 450, "comments": 89},
                content_hash=generate_content_hash(text)
            )
        ]

from typing import Protocol, List
from ...domain.models.evidence import EvidenceItem

class WebSearchProvider(Protocol):
    async def search(
        self,
        query: str,
        recency_days: int = 30,
        limit: int = 10
    ) -> List[EvidenceItem]:
        ...

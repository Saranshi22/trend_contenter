from typing import Protocol, List
from ...domain.models.evidence import EvidenceItem

class SocialProvider(Protocol):
    async def search(
        self,
        query: str,
        region: str | None = None,
        limit: int = 50
    ) -> List[EvidenceItem]:
        ...

from typing import Protocol, List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone

class CitationItem(BaseModel):
    url: str
    domain: str
    position: int

class LLMObservation(BaseModel):
    observation_id: str
    investigation_id: str = ""
    topic: str = ""
    probe: str = ""
    provider: str = ""
    model: str = ""
    response_text: str = ""
    citations: List[Dict[str, Any]] = Field(default_factory=list)
    observed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "success"  # "success" | "empty" | "failed" | "unconfigured"
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    confidence: Optional[float] = 0.85
    sentiment: Optional[str] = None

    # Backward compatibility properties
    @property
    def platform(self) -> str:
        return self.provider

    @property
    def query(self) -> str:
        return self.probe

    @property
    def answer(self) -> str:
        return self.response_text

    @property
    def cited_sources(self) -> List[str]:
        return [c["url"] if isinstance(c, dict) and "url" in c else str(c) for c in self.citations]

    @property
    def entities(self) -> List[str]:
        return self.metadata.get("entities", [])

    @property
    def topics(self) -> List[str]:
        return self.metadata.get("topics", [])


class LLMMonitoringProvider(Protocol):
    async def evaluate_queries(
        self,
        queries: List[str],
        models: Optional[List[str]] = None,
        investigation_id: Optional[str] = None,
        topic: Optional[str] = None
    ) -> List[LLMObservation]:
        ...

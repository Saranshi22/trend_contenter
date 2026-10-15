import uuid
from datetime import datetime, timezone
from typing import List, Optional
from .base import LLMMonitoringProvider, LLMObservation

class MockLLMMonitoringProvider(LLMMonitoringProvider):
    async def evaluate_queries(self, queries: List[str], models: Optional[List[str]] = None) -> List[LLMObservation]:
        observations = []
        for query in queries:
            observations.append(
                LLMObservation(
                    observation_id=f"obs_{uuid.uuid4().hex[:8]}",
                    platform="chatgpt",
                    model="gpt-4o",
                    query=query,
                    answer=f"AI model high-level answer for {query}. Missing practical step-by-step guidance.",
                    observed_at=datetime.now(timezone.utc),
                    cited_sources=["https://wikipedia.org/wiki/AI"],
                    entities=["AI", "Education"],
                    topics=["Technology", "Learning"],
                    confidence=0.85
                )
            )
        return observations

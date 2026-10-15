import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from .base import LLMMonitoringProvider, LLMObservation
from .execution_engine import run_research_probes

class EngineLLMMonitoringProvider(LLMMonitoringProvider):
    """
    Real multi-provider LLM Monitoring Provider.
    Replaces simulated AI engine monitoring by directly querying configured LLMs
    (OpenAI, Gemini, Claude, LiteLLM) via Brand Radar execution adapters.
    """
    async def evaluate_queries(
        self,
        queries: List[str],
        models: Optional[List[str]] = None,
        investigation_id: Optional[str] = None,
        topic: Optional[str] = None
    ) -> List[LLMObservation]:
        """
        Executes dynamically generated research probes across configured LLMs.
        Preserves provenance, extracted citations, raw model text, and errors.
        """
        providers_config: Optional[List[Dict[str, str]]] = None
        if models:
            providers_config = []
            for m in models:
                if "gemini" in m.lower():
                    providers_config.append({"platform": "gemini", "model": m})
                elif "claude" in m.lower():
                    providers_config.append({"platform": "claude", "model": m})
                elif "/" in m:
                    # e.g. "openai/gpt-4o" via litellm
                    providers_config.append({"platform": "litellm", "model": m})
                else:
                    providers_config.append({"platform": "openai", "model": m})

        observations = await run_research_probes(
            probes=queries,
            providers=providers_config,
            investigation_id=investigation_id or "",
            topic=topic or "",
        )

        return observations

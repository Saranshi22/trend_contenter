import asyncio
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from .adapters.factory import LLMAdapterFactory
from .nlp_utils import NLPExtractor
from .base import LLMObservation
from ...config import settings

def get_default_configured_providers() -> List[Dict[str, str]]:
    """
    Determines which model platforms to probe based on available API credentials in settings.
    """
    providers = []
    
    # 1. OpenAI direct adapter
    if settings.OPENAI_API_KEY:
        providers.append({
            "platform": "openai",
            "model": settings.OPENAI_TEXT_MODEL or "gpt-4o-mini"
        })
    
    # 2. Gemini adapter
    if settings.GEMINI_API_KEY:
        providers.append({
            "platform": "gemini",
            "model": settings.GEMINI_TEXT_MODEL or "gemini-1.5-pro"
        })
        
    # 3. LiteLLM proxy adapter (routes through LiteLLM with fallback)
    if settings.OPENAI_API_KEY:
        providers.append({
            "platform": "litellm",
            "model": "gpt-4o-mini"
        })

    # 4. Anthropic Claude (if configured)
    if settings.ANTHROPIC_API_KEY:
        providers.append({
            "platform": "claude",
            "model": "claude-3-opus-20240229"
        })

    # If nothing is configured, at least provide an entry for graceful unconfigured reporting
    if not providers:
        providers.append({
            "platform": "openai",
            "model": "gpt-4o-mini"
        })

    return providers


async def run_single_probe(
    probe: str,
    platform: str,
    model: str,
    investigation_id: str,
    topic: str,
    semaphore: asyncio.Semaphore,
    timeout_seconds: float = 30.0
) -> LLMObservation:
    """
    Executes a single research probe against a specific LLM platform adapter.
    """
    obs_id = f"obs_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)

    async with semaphore:
        try:
            # Instantiate adapter via factory
            adapter = LLMAdapterFactory.get_adapter(platform, model=model)
        except ValueError as val_err:
            return LLMObservation(
                observation_id=obs_id,
                investigation_id=investigation_id,
                topic=topic,
                probe=probe,
                provider=platform,
                model=model,
                response_text="",
                citations=[],
                observed_at=now,
                status="unconfigured",
                error_message=str(val_err),
                metadata={"platform": platform, "model": model, "configured": False}
            )
        except Exception as init_err:
            return LLMObservation(
                observation_id=obs_id,
                investigation_id=investigation_id,
                topic=topic,
                probe=probe,
                provider=platform,
                model=model,
                response_text="",
                citations=[],
                observed_at=now,
                status="failed",
                error_message=f"Adapter init failed: {init_err}",
                metadata={"platform": platform, "model": model}
            )

        try:
            # Execute actual model call with timeout
            response_data = await asyncio.wait_for(
                adapter.fetch_response(probe),
                timeout=timeout_seconds
            )
            
            response_text = response_data.get("response_text", "")
            if not response_text.strip():
                return LLMObservation(
                    observation_id=obs_id,
                    investigation_id=investigation_id,
                    topic=topic,
                    probe=probe,
                    provider=platform,
                    model=model,
                    response_text="",
                    citations=[],
                    observed_at=now,
                    status="empty",
                    error_message="Model returned empty response text",
                    metadata={"platform": platform, "model": model}
                )

            # Extract real citations from text
            citations = NLPExtractor.extract_citations(response_text)
            sentiment = NLPExtractor.analyze_sentiment(response_text)

            return LLMObservation(
                observation_id=obs_id,
                investigation_id=investigation_id,
                topic=topic,
                probe=probe,
                provider=platform,
                model=model,
                response_text=response_text,
                citations=citations,
                observed_at=now,
                status="success",
                error_message=None,
                confidence=0.90 if citations else 0.82,
                sentiment=sentiment,
                metadata={
                    "platform": platform,
                    "model": model,
                    "citation_count": len(citations),
                    "token_estimate": len(response_text.split())
                }
            )

        except asyncio.TimeoutError:
            return LLMObservation(
                observation_id=obs_id,
                investigation_id=investigation_id,
                topic=topic,
                probe=probe,
                provider=platform,
                model=model,
                response_text="",
                citations=[],
                observed_at=now,
                status="failed",
                error_message=f"Request timed out after {timeout_seconds}s",
                metadata={"platform": platform, "model": model, "timeout": True}
            )
        except Exception as exec_err:
            return LLMObservation(
                observation_id=obs_id,
                investigation_id=investigation_id,
                topic=topic,
                probe=probe,
                provider=platform,
                model=model,
                response_text="",
                citations=[],
                observed_at=now,
                status="failed",
                error_message=str(exec_err),
                metadata={"platform": platform, "model": model}
            )


async def run_research_probes(
    probes: List[str],
    providers: Optional[List[Dict[str, str]]] = None,
    investigation_id: str = "",
    topic: str = "",
    context: Optional[Dict[str, Any]] = None
) -> List[LLMObservation]:
    """
    Executes a bounded batch of research probes across configured LLM providers.
    Replaces simulated AI engine monitoring with actual multi-model querying.
    """
    if not probes:
        return []

    # Bounded probes limit from settings
    max_probes = getattr(settings, "LLM_PROBE_MAX_QUERIES", 4)
    active_probes = probes[:max_probes]

    target_providers = providers or get_default_configured_providers()
    timeout = float(getattr(settings, "LLM_REQUEST_TIMEOUT_SECONDS", 30))

    # Concurrency limiter to protect against rate limits
    semaphore = asyncio.Semaphore(3)

    tasks = []
    for probe in active_probes:
        for provider_cfg in target_providers:
            platform = provider_cfg.get("platform", "openai")
            model = provider_cfg.get("model", "gpt-4o-mini")
            tasks.append(
                run_single_probe(
                    probe=probe,
                    platform=platform,
                    model=model,
                    investigation_id=investigation_id,
                    topic=topic,
                    semaphore=semaphore,
                    timeout_seconds=timeout
                )
            )

    results = await asyncio.gather(*tasks, return_exceptions=False)
    return results

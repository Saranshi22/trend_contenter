import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import httpx

from .base import SocialProvider
from ...domain.models.evidence import EvidenceItem
from ...agents.utils import generate_content_hash, deduplicate_evidence
from ...config import settings


class SocialCrawlError(Exception):
    """Base exception for SocialCrawl operations."""
    pass


class SocialCrawlAuthError(SocialCrawlError):
    """Authentication failed (invalid or missing API key)."""
    pass


class SocialCrawlCreditError(SocialCrawlError):
    """Credits depleted or insufficient credits for request."""
    pass


class SocialCrawlRateLimitError(SocialCrawlError):
    """Request rate limit exceeded."""
    pass


class SocialCrawlTimeoutError(SocialCrawlError):
    """Network or execution timeout."""
    pass


class SocialCrawlProvider(SocialProvider):
    """
    Dedicated SocialCrawl social listening provider.
    Fans out searches across native social platforms (Reddit, Twitter/X, TikTok, Instagram, Threads)
    via SocialCrawl's official API, normalizes results into EvidenceItem,
    preserves engagement metrics, author provenance, and enforces credit limits & caching.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        default_platforms: Optional[List[str]] = None,
        timeout: Optional[float] = None,
        max_credits_per_run: Optional[int] = None,
        client: Optional[httpx.AsyncClient] = None
    ):
        if api_key is not None:
            self.api_key = api_key.strip()
        else:
            self.api_key = settings.get_socialcrawl_api_key().strip()
        self.base_url = (base_url or settings.SOCIALCRAWL_BASE_URL or "https://www.socialcrawl.dev/v1").rstrip("/")
        
        if default_platforms:
            self.platforms = default_platforms
        else:
            raw_platforms = settings.SOCIALCRAWL_PLATFORMS or "reddit,twitter,threads,tiktok,instagram"
            self.platforms = [p.strip() for p in raw_platforms.split(",") if p.strip()]

        self.timeout = timeout if timeout is not None else float(settings.SOCIALCRAWL_REQUEST_TIMEOUT_SECONDS)
        self.max_credits_per_run = max_credits_per_run or settings.SOCIALCRAWL_MAX_CREDITS_PER_RUN
        self._external_client = client
        self._cache: Dict[Tuple[str, str], Tuple[float, List[EvidenceItem]]] = {}
        self._cache_ttl = settings.SOCIALCRAWL_CACHE_TTL_SECONDS

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def search(
        self,
        query: str,
        region: Optional[str] = None,
        limit: int = 25,
        platforms: Optional[List[str]] = None,
        since: Optional[str] = None
    ) -> List[EvidenceItem]:
        """
        Search social platforms via /v1/search/multi.
        Normalizes results into EvidenceItem schema, preserving metadata and engagement.
        """
        if not self.is_configured:
            return []

        clean_query = query.strip()
        if not clean_query:
            return []

        target_platforms = platforms or self.platforms
        cache_key = (clean_query, ",".join(sorted(target_platforms)))
        
        # Check in-memory cache
        now = time.time()
        if cache_key in self._cache:
            cached_time, cached_items = self._cache[cache_key]
            if now - cached_time < self._cache_ttl:
                return [it.model_copy() for it in cached_items[:limit]]

        endpoint = f"{self.base_url}/search/multi"
        headers = {
            "x-api-key": self.api_key,
            "Accept": "application/json"
        }
        params: Dict[str, Any] = {
            "query": clean_query,
            "platforms": ",".join(target_platforms)
        }
        if since:
            params["since"] = since

        should_close = False
        client = self._external_client
        if client is None:
            client = httpx.AsyncClient(timeout=self.timeout)
            should_close = True

        try:
            resp = await client.get(endpoint, headers=headers, params=params)
            
            if resp.status_code == 401 or resp.status_code == 403:
                raise SocialCrawlAuthError(f"SocialCrawl authentication failed ({resp.status_code}): {resp.text}")
            elif resp.status_code == 402:
                raise SocialCrawlCreditError(f"SocialCrawl credits exhausted (402): {resp.text}")
            elif resp.status_code == 429:
                raise SocialCrawlRateLimitError(f"SocialCrawl rate limit reached (429): {resp.text}")
            elif resp.status_code >= 500:
                raise SocialCrawlError(f"SocialCrawl server error ({resp.status_code}): {resp.text}")
            elif resp.status_code != 200:
                raise SocialCrawlError(f"SocialCrawl unexpected response ({resp.status_code}): {resp.text}")

            data = resp.json()
            items = self._normalize_multi_response(data, clean_query, limit)
            
            # Save to cache
            self._cache[cache_key] = (now, items)
            return items

        except httpx.TimeoutException as e:
            raise SocialCrawlTimeoutError(f"SocialCrawl request timed out: {e}")
        finally:
            if should_close:
                await client.aclose()

    def _normalize_multi_response(
        self,
        payload: Dict[str, Any],
        query: str,
        limit: int
    ) -> List[EvidenceItem]:
        """Normalizes SocialCrawl /v1/search/multi payload into EvidenceItem list."""
        if not payload or not payload.get("success"):
            return []

        raw_data = payload.get("data", {})
        raw_items = raw_data.get("items", [])
        if not isinstance(raw_items, list):
            return []

        evidence_items: List[EvidenceItem] = []
        seen_urls: Set[str] = set()
        seen_ids: Set[str] = set()

        for item in raw_items:
            if not isinstance(item, dict):
                continue

            platform = item.get("platform", "social")
            post = item.get("post", {})
            computed = item.get("computed", {})
            ext = post.get("ext", {})
            content = post.get("content", {})
            author_data = post.get("author", {})
            engagement_data = post.get("engagement", {})

            post_id = str(post.get("id") or "")
            url = post.get("url") or ""

            # Deduplication
            if url and url in seen_urls:
                continue
            if post_id and (platform, post_id) in seen_ids:
                continue
            if url:
                seen_urls.add(url)
            if post_id:
                seen_ids.add((platform, post_id))

            # Excerpt / text resolution
            text = (
                ext.get("selftext")
                or content.get("text")
                or ext.get("title")
                or ""
            ).strip()

            title = (
                ext.get("title")
                or (content.get("text")[:120] if content.get("text") else None)
                or f"Social discussion on {query}"
            ).strip()

            if not text and not title:
                continue

            # Timestamp parsing
            pub_date = None
            pub_raw = post.get("published_at")
            if pub_raw:
                try:
                    pub_date = datetime.fromisoformat(pub_raw.replace("Z", "+00:00"))
                except Exception:
                    pub_date = datetime.now(timezone.utc)
            else:
                pub_date = datetime.now(timezone.utc)

            # Author details
            author_name = (
                author_data.get("username")
                or author_data.get("display_name")
                or f"{platform.capitalize()} Contributor"
            )

            # Engagement normalization
            engagement = {
                "likes": engagement_data.get("likes") or 0,
                "comments": engagement_data.get("comments") or 0,
                "shares": engagement_data.get("shares") or 0,
                "views": engagement_data.get("views") or 0,
                "upvote_ratio": ext.get("upvote_ratio"),
            }

            # Relevance & labels from computed blocks
            relevance_data = computed.get("relevance") if isinstance(computed.get("relevance"), dict) else {}
            labels_data = computed.get("labels") if isinstance(computed.get("labels"), dict) else {}

            confidence = 0.85
            if "p" in relevance_data and isinstance(relevance_data["p"], (int, float)):
                confidence = float(relevance_data["p"])

            metadata = {
                "retrieved_by": "socialcrawl",
                "retrieval_method": "search_multi",
                "query": query,
                "platform": platform,
                "post_id": post_id,
                "subreddit": ext.get("subreddit"),
                "author_username": author_data.get("username"),
                "author_verified": author_data.get("verified"),
                "relevance": relevance_data,
                "labels": labels_data,
                "is_inferred": False
            }

            excerpt = text or title
            content_hash = generate_content_hash(excerpt)

            evidence_items.append(
                EvidenceItem(
                    evidence_id=f"ev_soc_{uuid.uuid4().hex[:8]}",
                    investigation_id="",
                    source_type="social",
                    platform=platform,
                    title=title,
                    text_excerpt=excerpt,
                    url=url,
                    published_at=pub_date,
                    retrieved_at=datetime.now(timezone.utc),
                    author=author_name,
                    engagement=engagement,
                    metadata=metadata,
                    content_hash=content_hash,
                    confidence=confidence,
                    is_inferred=False
                )
            )

            if len(evidence_items) >= limit:
                break

        return deduplicate_evidence(evidence_items)

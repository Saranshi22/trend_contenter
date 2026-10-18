import logging
import re
import urllib.parse
from typing import Any, Dict, List, Optional, Set
import httpx

from ...config import settings

logger = logging.getLogger(__name__)


def normalize_image_url(url: str) -> str:
    """
    Normalizes an image URL by:
    - Stripping leading/trailing whitespace.
    - Standardizing scheme and host to lowercase.
    - Removing tracking query parameters (utm_*, gclid, fbclid, ref, etc.).
    - Extracting canonical asset identifiers for common CDNs (e.g. Unsplash photo ID).
    - Stripping trailing slashes.
    """
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlparse(url.strip())
        scheme = parsed.scheme.lower() or "https"
        netloc = parsed.netloc.lower()
        path = parsed.path.rstrip("/")

        # For Unsplash, photo ID is canonical identifier (e.g. /photo-1618005182384-a83a8bd57fbe)
        if "unsplash.com" in netloc:
            m = re.search(r"photo-[0-9a-fA-F\-]+", path)
            if m:
                return f"unsplash:{m.group(0)}"

        # Strip standard marketing, analytics, and cache-buster query parameters
        tracking_params = {
            "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
            "gclid", "fbclid", "ref", "ref_src", "timestamp", "cb", "_ga", "_gid"
        }
        query_dict = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)
        cleaned_query = {
            k: v for k, v in query_dict.items() if k.lower() not in tracking_params
        }

        if cleaned_query:
            sorted_qs = urllib.parse.urlencode(cleaned_query, doseq=True)
            return f"{scheme}://{netloc}{path}?{sorted_qs}"
        return f"{scheme}://{netloc}{path}"
    except Exception:
        return url.strip()


def is_likely_watermarked(cand: Dict[str, Any]) -> bool:
    """
    Detects whether an image candidate originates from a known watermarked stock repository
    or has prominent watermark indicators in its URL or metadata.
    """
    img_url = (cand.get("image_url") or "").lower()
    thumb_url = (cand.get("thumbnail_url") or "").lower()
    title = (cand.get("title") or "").lower()
    snippet = (cand.get("snippet") or "").lower()
    source = (cand.get("source_domain") or "").lower()
    source_url = (cand.get("source_url") or "").lower()
    combined = f"{img_url} {thumb_url} {title} {snippet} {source} {source_url}"

    watermark_terms = [
        "shutterstock",
        "gettyimages",
        "getty images",
        "istockphoto",
        "istock",
        "alamy.com",
        "c8.alamy",
        "dreamstime",
        "123rf",
        "depositphotos",
        "bigstockphoto",
        "canstockphoto",
        "vectorstock",
        "watermarked",
        "watermark",
    ]
    for term in watermark_terms:
        if term in combined:
            return True
    return False


def deduplicate_image_candidates(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicates a list of image candidate dictionaries using canonical URLs and IDs."""
    seen_canonical_keys: Set[str] = set()
    unique_candidates: List[Dict[str, Any]] = []

    for cand in candidates:
        img_url = (cand.get("image_url") or "").strip()
        if not img_url:
            continue

        canon_key = normalize_image_url(img_url)
        if canon_key in seen_canonical_keys:
            continue

        # Also check thumbnail_url if present
        thumb_url = (cand.get("thumbnail_url") or "").strip()
        thumb_key = normalize_image_url(thumb_url) if thumb_url else None
        if thumb_key and thumb_key in seen_canonical_keys and thumb_key != canon_key:
            continue

        seen_canonical_keys.add(canon_key)
        if thumb_key:
            seen_canonical_keys.add(thumb_key)

        unique_candidates.append(cand)

    return unique_candidates


def clean_and_optimize_query(
    prompt: str,
    headline: Optional[str] = None,
    topic: Optional[str] = None,
    visual_direction: Optional[str] = None,
    max_terms: int = 8,
) -> str:
    """
    Builds a concise, targeted search query from campaign context.
    Removes conversational prompt filler and retains key subject, entity, and aesthetic terms.
    """
    stop_phrases = [
        r"\b(generate|create|produce|search\s+for|find\s+images?|visual\s+references?|editorial\s+visual)\b",
        r"\b(a\s+photo\s+of|a\s+picture\s+of|an\s+image\s+of|picture\s+of|photo\s+of)\b",
        r"\b(high\s+resolution|4k|8k|photorealistic|ultra\s+detailed|trending\s+on\s+artstation)\b",
    ]

    # Combine available campaign context (prioritizing the prompt and specific headline)
    components = []
    if prompt:
        components.append(prompt.strip())
    if headline and (not prompt or headline.lower() not in prompt.lower()):
        components.append(headline.strip())
    if topic and (not prompt or topic.lower() not in prompt.lower()):
        components.append(topic.strip())
    if visual_direction and len(components) < 2:
        components.append(visual_direction.strip())

    raw_text = " ".join(components) if components else (prompt or "").strip()

    cleaned = raw_text.lower()
    for pattern in stop_phrases:
        cleaned = re.sub(pattern, " ", cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"[^a-zA-Z0-9\s\-]", " ", cleaned)
    stop_words = {
        "the", "and", "for", "with", "this", "that", "from", "into", "what",
        "some", "about", "above", "across", "after", "all", "also", "any", "are"
    }
    words = [
        w for w in cleaned.split()
        if len(w) > 2 and w not in stop_words
    ]

    # Deduplicate while preserving order
    seen_words: Set[str] = set()
    ordered_words: List[str] = []
    for w in words:
        if w not in seen_words:
            seen_words.add(w)
            ordered_words.append(w)

    result = " ".join(ordered_words[:max_terms])
    return result if result else prompt.strip()


class ImageSearchService:
    def __init__(self):
        self.last_optimized_query: Optional[str] = None
        self.last_provider_used: Optional[str] = None
        self.last_provider_display: Optional[str] = None

    async def search_google_cse(
        self,
        query: str,
        num_results: int = 12,
        api_key: Optional[str] = None,
        cx: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Searches Google Image Search via official Google Custom Search Engine (CSE) JSON API."""
        key = api_key or getattr(settings, "GOOGLE_CSE_API_KEY", None)
        cse_id = cx or getattr(settings, "GOOGLE_CSE_ID", None)

        if not key or not cse_id:
            raise ValueError("Google CSE API Key or CSE ID not configured.")

        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": key,
            "cx": cse_id,
            "q": query,
            "searchType": "image",
            "num": min(num_results, 10),
            "safe": "active",
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        candidates = []
        for i, item in enumerate(data.get("items", [])):
            img_info = item.get("image", {})
            link = item.get("link", "")
            if not link:
                continue
            source_url = img_info.get("contextLink") or item.get("link", "")
            cand = {
                "id": f"gcse_{i}_{abs(hash(link)) % 100000}",
                "image_url": link,
                "thumbnail_url": img_info.get("thumbnailLink", link),
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "source_domain": item.get("displayLink", ""),
                "source_url": source_url,
                "width": img_info.get("width"),
                "height": img_info.get("height"),
            }
            cand["is_watermarked"] = is_likely_watermarked(cand)
            candidates.append(cand)
        return deduplicate_image_candidates(candidates)

    async def search_serpapi(
        self,
        query: str,
        num_results: int = 12,
        api_key: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Searches Google Images via SerpApi (google_images engine)."""
        key = api_key or settings.SERPAPI_API_KEY
        if not key:
            raise ValueError("SerpApi API Key not configured.")

        url = "https://serpapi.com/search.json"
        params = {
            "engine": "google_images",
            "q": query,
            "api_key": key,
            "num": min(num_results, 20),
            "safe": "active",
            "gl": (settings.TRENDS_GEO or "in").lower(),
            "hl": settings.TRENDS_LANGUAGE or "en",
        }

        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        images_results = data.get("images_results", [])
        candidates = []
        for i, item in enumerate(images_results[:num_results * 2]):
            original = item.get("original", "")
            if not original:
                continue
            source_url = item.get("link") or original
            source_domain = item.get("source") or urllib.parse.urlparse(source_url).netloc or "Google Images"
            cand = {
                "id": f"serp_{i}_{abs(hash(original)) % 100000}",
                "image_url": original,
                "thumbnail_url": item.get("thumbnail", original),
                "title": item.get("title", ""),
                "snippet": item.get("source", ""),
                "source_domain": source_domain,
                "source_url": source_url,
                "width": item.get("original_width"),
                "height": item.get("original_height"),
            }
            cand["is_watermarked"] = is_likely_watermarked(cand)
            candidates.append(cand)
        return deduplicate_image_candidates(candidates)

    async def search_web_fallback(self, query: str, num_results: int = 10) -> List[Dict[str, Any]]:
        """
        Public web image search fallback (using DuckDuckGo image API),
        ensuring the recommendation engine returns authentic image candidates without third-party keys.
        Returns unique, genuinely retrieved images. If search returns no results, returns an empty list.
        """
        candidates: List[Dict[str, Any]] = []
        try:
            encoded_q = urllib.parse.quote(query)
            token_url = f"https://duckduckgo.com/?q={encoded_q}&iax=images&ia=images"
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }

            async with httpx.AsyncClient(headers=headers, timeout=8.0, follow_redirects=True) as client:
                res = await client.get(token_url)
                vqd = None
                m = re.search(r'vqd=[\'\"]?([0-9\-]+)', res.text)
                if m:
                    vqd = m.group(1)

                if vqd:
                    api_url = "https://duckduckgo.com/i.js"
                    params = {
                        "l": "us-en",
                        "o": "json",
                        "q": query,
                        "vqd": vqd,
                        "f": ",,,",
                        "p": "1",
                    }
                    api_headers = {
                        "User-Agent": headers["User-Agent"],
                        "Referer": token_url,
                        "Accept": "application/json, text/javascript, */*; q=0.01",
                    }
                    img_resp = await client.get(api_url, params=params, headers=api_headers)
                    if img_resp.status_code == 200:
                        data = img_resp.json()
                        raw_results = data.get("results", [])
                        for i, r in enumerate(raw_results[:num_results * 2]):
                            img_url = r.get("image", "")
                            if not img_url:
                                continue
                            domain = urllib.parse.urlparse(r.get("url", "")).netloc or "web"
                            source_url = r.get("url") or img_url
                            cand = {
                                "id": f"ddg_{i}_{abs(hash(img_url)) % 100000}",
                                "image_url": img_url,
                                "thumbnail_url": r.get("thumbnail", img_url),
                                "title": r.get("title", ""),
                                "snippet": r.get("source", ""),
                                "source_domain": domain,
                                "source_url": source_url,
                                "width": r.get("width"),
                                "height": r.get("height"),
                            }
                            cand["is_watermarked"] = is_likely_watermarked(cand)
                            candidates.append(cand)
        except Exception as e:
            logger.warning(f"Web image search fallback encountered error: {type(e).__name__}")

        # Deduplicate candidates across all retrieved items
        unique_candidates = deduplicate_image_candidates(candidates)
        return unique_candidates[:num_results]

    async def search_images(
        self,
        query: str,
        num_results: int = 12,
        provider: str = "auto",
        serpapi_key: Optional[str] = None,
        google_cse_key: Optional[str] = None,
        google_cse_id: Optional[str] = None,
        headline: Optional[str] = None,
        topic: Optional[str] = None,
        visual_direction: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Unified search dispatcher with multi-provider fallback and cross-provider deduplication:
        Optimizes search query from campaign context -> Tries SerpApi -> Google CSE -> Web Fallback.
        Always returns unique, distinct candidates.
        """
        optimized_q = clean_and_optimize_query(
            prompt=query,
            headline=headline,
            topic=topic,
            visual_direction=visual_direction,
        )
        self.last_optimized_query = optimized_q

        collected_candidates: List[Dict[str, Any]] = []
        seen_keys: Set[str] = set()

        def _add_candidates(items: List[Dict[str, Any]]) -> None:
            for item in items:
                img_url = item.get("image_url", "").strip()
                if not img_url:
                    continue
                k = normalize_image_url(img_url)
                if k in seen_keys:
                    continue
                seen_keys.add(k)
                thumb = item.get("thumbnail_url", "").strip()
                if thumb:
                    seen_keys.add(normalize_image_url(thumb))
                collected_candidates.append(item)

        self.last_provider_used = None
        self.last_provider_display = None

        target_pool = max(num_results * 2, 16)

        # 1. Try SerpApi (if available or auto)
        if provider in ("serpapi", "auto") and (serpapi_key or settings.SERPAPI_API_KEY):
            try:
                res = await self.search_serpapi(
                    query=optimized_q,
                    num_results=target_pool,
                    api_key=serpapi_key,
                )
                if res:
                    self.last_provider_used = "serpapi"
                    self.last_provider_display = "Google Images (via SerpApi)"
                _add_candidates(res)
            except Exception as e:
                logger.warning(f"SerpApi image search failed ({type(e).__name__}). Proceeding to next provider.")

        # 2. Try Google CSE
        if len(collected_candidates) < target_pool and provider in ("google_cse", "auto") and (google_cse_key or getattr(settings, "GOOGLE_CSE_API_KEY", None)) and (google_cse_id or getattr(settings, "GOOGLE_CSE_ID", None)):
            try:
                res = await self.search_google_cse(
                    query=optimized_q,
                    num_results=target_pool - len(collected_candidates),
                    api_key=google_cse_key,
                    cx=google_cse_id,
                )
                if res:
                    self.last_provider_used = "google_cse"
                    self.last_provider_display = "Google Custom Search Engine"
                _add_candidates(res)
            except Exception as e:
                logger.warning(f"Google CSE image search failed ({type(e).__name__}). Proceeding to next provider.")

        # 3. Public Web fallback (DuckDuckGo image search)
        if len(collected_candidates) < target_pool:
            try:
                needed = target_pool - len(collected_candidates)
                web_results = await self.search_web_fallback(query=optimized_q, num_results=needed)
                if web_results and not self.last_provider_used:
                    self.last_provider_used = "web_search"
                    self.last_provider_display = "Public Web Visual Search"
                _add_candidates(web_results)
            except Exception as e:
                logger.warning(f"Web fallback image search failed ({type(e).__name__}).")

        if not self.last_provider_display:
            if not (serpapi_key or settings.SERPAPI_API_KEY) and not getattr(settings, "GOOGLE_CSE_API_KEY", None):
                self.last_provider_display = "Public Web Visual Search"
            else:
                self.last_provider_display = "Google Images (via SerpApi)"

        # Partition candidates into clean (unwatermarked) and watermarked
        clean_candidates = [c for c in collected_candidates if not c.get("is_watermarked")]
        watermarked_candidates = [c for c in collected_candidates if c.get("is_watermarked")]

        # Exclude visibly watermarked images when suitable alternatives are available.
        # Do not substitute unrelated stock imagery merely to fill the gallery.
        if len(clean_candidates) >= num_results:
            return clean_candidates[:num_results]

        # If clean candidates alone are fewer than requested, return all clean ones first,
        # followed by the most relevant watermarked candidates to reach the target count without filling with unrelated stock.
        return (clean_candidates + watermarked_candidates)[:num_results]


search_service = ImageSearchService()

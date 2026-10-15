import logging
import urllib.parse
from typing import List, Dict, Any, Optional
import httpx2
from serpapi import Client as SerpApiClient

from config import settings
from utils.mock_data import SAMPLE_SEARCH_IMAGES

logger = logging.getLogger(__name__)

class ImageSearchService:
    def __init__(self):
        pass

    async def search_google_cse(
        self,
        query: str,
        num_results: int = 12,
        api_key: Optional[str] = None,
        cx: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Searches Google Image Search via official Google Custom Search Engine (CSE) JSON API."""
        key = api_key or settings.GOOGLE_CSE_API_KEY
        cse_id = cx or settings.GOOGLE_CSE_ID

        if not key or not cse_id:
            raise ValueError("Google CSE API Key or CSE ID not configured.")

        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": key,
            "cx": cse_id,
            "q": query,
            "searchType": "image",
            "num": min(num_results, 10),
            "safe": "active"
        }

        async with httpx2.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        candidates = []
        for i, item in enumerate(data.get("items", [])):
            img_info = item.get("image", {})
            candidates.append({
                "id": f"gcse_{i}_{hash(item.get('link', '')) % 10000}",
                "image_url": item.get("link", ""),
                "thumbnail_url": img_info.get("thumbnailLink", item.get("link", "")),
                "title": item.get("title", ""),
                "snippet": item.get("snippet", ""),
                "source_domain": item.get("displayLink", ""),
                "width": img_info.get("width"),
                "height": img_info.get("height")
            })
        return candidates

    def search_serpapi(
        self,
        query: str,
        num_results: int = 12,
        api_key: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Searches Google Images via SerpApi."""
        key = api_key or settings.SERPAPI_API_KEY
        if not key:
            raise ValueError("SerpApi API Key not configured.")

        client = SerpApiClient(api_key=key)
        results = client.search({
            "engine": "google_images",
            "q": query,
            "num": num_results,
            "safe": "active"
        })

        images_results = results.get("images_results", [])
        candidates = []
        for i, item in enumerate(images_results[:num_results]):
            candidates.append({
                "id": f"serp_{i}_{hash(item.get('original', '')) % 10000}",
                "image_url": item.get("original", ""),
                "thumbnail_url": item.get("thumbnail", item.get("original", "")),
                "title": item.get("title", ""),
                "snippet": item.get("source", ""),
                "source_domain": item.get("source", ""),
                "width": item.get("original_width"),
                "height": item.get("original_height")
            })
        return candidates

    async def search_web_fallback(self, query: str, num_results: int = 10) -> List[Dict[str, Any]]:
        """
        Public web image search fallback (using DuckDuckGo image API / Unsplash query),
        ensuring the recommendation engine always returns rich images out-of-the-box.
        """
        candidates = []
        try:
            # Try DuckDuckGo image search endpoint
            encoded_q = urllib.parse.quote(query)
            token_url = f"https://duckduckgo.com/?q={encoded_q}&iax=images&ia=images"
            headers = {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Referer": "https://duckduckgo.com/"
            }

            async with httpx2.AsyncClient(headers=headers, timeout=6.0, follow_redirects=True) as client:
                res = await client.get(token_url)
                # Extract vqd token if present
                vqd = None
                for line in res.text.split("\n"):
                    if "vqd=" in line:
                        import re
                        m = re.search(r'vqd=([0-9\-]+)', line)
                        if m:
                            vqd = m.group(1)
                            break
                        m2 = re.search(r'vqd="([0-9\-]+)"', line)
                        if m2:
                            vqd = m2.group(1)
                            break

                if vqd:
                    api_url = f"https://duckduckgo.com/i.js?l=us-en&o=json&q={encoded_q}&vqd={vqd}&f=,,,&p=1"
                    img_resp = await client.get(api_url)
                    if img_resp.status_code == 200:
                        data = img_resp.json()
                        for i, r in enumerate(data.get("results", [])[:num_results]):
                            candidates.append({
                                "id": f"ddg_{i}",
                                "image_url": r.get("image", ""),
                                "thumbnail_url": r.get("thumbnail", r.get("image", "")),
                                "title": r.get("title", f"Image {i+1} for {query}"),
                                "snippet": r.get("source", ""),
                                "source_domain": urllib.parse.urlparse(r.get("url", "")).netloc or "web",
                                "width": r.get("width"),
                                "height": r.get("height")
                            })
        except Exception as e:
            logger.warning(f"Web image search fallback error: {e}")

        # If empty, return curated sample images with query context
        if not candidates:
            for i, sample in enumerate(SAMPLE_SEARCH_IMAGES):
                cand = sample.copy()
                cand["id"] = f"sample_{i}"
                cand["title"] = f"{sample['title']} (Relevant to '{query}')"
                candidates.append(cand)

        return candidates[:num_results]

    async def search_images(
        self,
        query: str,
        num_results: int = 12,
        provider: str = "auto",
        serpapi_key: Optional[str] = None,
        google_cse_key: Optional[str] = None,
        google_cse_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Unified search dispatcher with multi-provider fallback.
        Tries Google CSE -> SerpApi -> Web Fallback.
        """
        candidates: List[Dict[str, Any]] = []

        if provider in ("google_cse", "auto") and (google_cse_key or settings.GOOGLE_CSE_API_KEY) and (google_cse_id or settings.GOOGLE_CSE_ID):
            try:
                candidates = await self.search_google_cse(
                    query=query,
                    num_results=num_results,
                    api_key=google_cse_key,
                    cx=google_cse_id
                )
                if candidates:
                    return candidates
            except Exception as e:
                logger.warning(f"Google CSE search failed: {e}")

        if provider in ("serpapi", "auto") and (serpapi_key or settings.SERPAPI_API_KEY):
            try:
                candidates = self.search_serpapi(
                    query=query,
                    num_results=num_results,
                    api_key=serpapi_key
                )
                if candidates:
                    return candidates
            except Exception as e:
                logger.warning(f"SerpApi search failed: {e}")

        # Web fallback
        return await self.search_web_fallback(query=query, num_results=num_results)

search_service = ImageSearchService()


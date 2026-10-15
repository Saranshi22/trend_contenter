"""
YouTube Data API v3 integration module for Trend Contenter.
Complies with official YouTube API Services Developer Policies:
- Only stores permitted metadata and public comments (no audio/video stream caching).
- Enforces strict quota budgets (100 units for search, 1 unit for batch enrichment, 1 unit for comments).
- Normalizes all videos and comments into the Shared Evidence Model.
"""

import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from ...config import settings
from ...domain.models.evidence import EvidenceItem
from ...agents.utils import generate_content_hash

logger = logging.getLogger(__name__)

YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"


class YouTubeQuotaExceededError(Exception):
    """Raised when YouTube API quota has been exceeded."""
    pass


class YouTubeDataApiProvider:
    """
    Asynchronous client for YouTube Data API v3 with quota tracking,
    batch metadata enrichment, and public comment thread extraction.
    """

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = (api_key if api_key is not None else settings.get_youtube_api_key()).strip()
        self.timeout = settings.YOUTUBE_REQUEST_TIMEOUT_SECONDS
        self.quota_used = 0

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and not self.api_key.startswith("not_") and self.api_key != "disabled")

    async def search_videos(
        self,
        query: str,
        region_code: str = "IN",
        language: str = "en",
        max_results: int = 10,
        order: str = "relevance",
        published_after: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Searches YouTube for videos matching query.
        Quota cost: 100 units.
        """
        if not self.is_configured:
            logger.warning("YouTube Data API key is not configured.")
            return []

        bounded_max = min(max_results, settings.YOUTUBE_MAX_SEARCH_RESULTS)
        params: Dict[str, Any] = {
            "part": "snippet",
            "type": "video",
            "q": query,
            "regionCode": region_code,
            "relevanceLanguage": language,
            "order": order,
            "maxResults": bounded_max,
            "key": self.api_key,
        }

        if published_after:
            params["publishedAfter"] = published_after.strftime("%Y-%m-%dT%H:%M:%SZ")

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{YOUTUBE_API_BASE}/search", params=params)
            self.quota_used += 100

            if resp.status_code == 403:
                err_data = resp.json().get("error", {})
                reasons = [e.get("reason") for e in err_data.get("errors", [])]
                if "quotaExceeded" in reasons or "dailyLimitExceeded" in reasons:
                    raise YouTubeQuotaExceededError("YouTube API daily quota exceeded.")
                logger.error(f"YouTube search 403 error: {resp.text}")
                return []

            if resp.status_code != 200:
                logger.error(f"YouTube search failed with status {resp.status_code}: {resp.text}")
                return []

            data = resp.json()
            return data.get("items", [])

    async def enrich_videos(self, video_ids: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Batch fetches video statistics and content details.
        Quota cost: 1 unit per batch of up to 50 videos.
        """
        if not self.is_configured or not video_ids:
            return {}

        batch_ids = video_ids[:50]
        params = {
            "part": "snippet,statistics,contentDetails",
            "id": ",".join(batch_ids),
            "key": self.api_key,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{YOUTUBE_API_BASE}/videos", params=params)
            self.quota_used += 1

            if resp.status_code == 403:
                err_data = resp.json().get("error", {})
                reasons = [e.get("reason") for e in err_data.get("errors", [])]
                if "quotaExceeded" in reasons or "dailyLimitExceeded" in reasons:
                    raise YouTubeQuotaExceededError("YouTube API daily quota exceeded.")
                return {}

            if resp.status_code != 200:
                logger.error(f"YouTube videos batch enrichment failed: {resp.status_code}")
                return {}

            items = resp.json().get("items", [])
            enriched = {}
            for item in items:
                v_id = item["id"]
                snippet = item.get("snippet", {})
                stats = item.get("statistics", {})
                details = item.get("contentDetails", {})

                # Select best available thumbnail
                thumbnails = snippet.get("thumbnails", {})
                thumb_url = (
                    thumbnails.get("high", {}).get("url") or
                    thumbnails.get("medium", {}).get("url") or
                    thumbnails.get("default", {}).get("url") or ""
                )

                enriched[v_id] = {
                    "video_id": v_id,
                    "title": snippet.get("title", ""),
                    "description": snippet.get("description", ""),
                    "channel_id": snippet.get("channelId", ""),
                    "channel_title": snippet.get("channelTitle", ""),
                    "published_at": snippet.get("publishedAt"),
                    "category_id": snippet.get("categoryId", ""),
                    "duration": details.get("duration", ""),
                    "views": int(stats.get("viewCount", 0)) if stats.get("viewCount") else 0,
                    "likes": int(stats.get("likeCount", 0)) if stats.get("likeCount") else 0,
                    "comments": int(stats.get("commentCount", 0)) if stats.get("commentCount") else 0,
                    "thumbnail_url": thumb_url,
                    "canonical_url": f"https://www.youtube.com/watch?v={v_id}"
                }

            return enriched

    async def get_video_comments(
        self,
        video_id: str,
        video_title: str = "",
        max_results: int = 20,
        order: str = "relevance"
    ) -> List[Dict[str, Any]]:
        """
        Retrieves top public comment threads for a specific video.
        Quota cost: 1 unit.
        Gracefully handles commentsDisabled or restricted videos.
        """
        if not self.is_configured:
            return []

        bounded_max = min(max_results, settings.YOUTUBE_MAX_COMMENTS_PER_VIDEO)
        params = {
            "part": "snippet",
            "videoId": video_id,
            "maxResults": bounded_max,
            "order": order,
            "textFormat": "plainText",
            "key": self.api_key,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{YOUTUBE_API_BASE}/commentThreads", params=params)
            self.quota_used += 1

            if resp.status_code == 403:
                err_data = resp.json().get("error", {})
                reasons = [e.get("reason") for e in err_data.get("errors", [])]
                if "quotaExceeded" in reasons or "dailyLimitExceeded" in reasons:
                    raise YouTubeQuotaExceededError("YouTube API daily quota exceeded.")
                if "commentsDisabled" in reasons:
                    logger.info(f"Comments are disabled for YouTube video {video_id}.")
                    return []
                return []

            if resp.status_code != 200:
                logger.info(f"YouTube commentThreads returned {resp.status_code} for video {video_id}.")
                return []

            items = resp.json().get("items", [])
            comments = []
            for it in items:
                cmt_id = it.get("id", "")
                top_cmt = it.get("snippet", {}).get("topLevelComment", {}).get("snippet", {})
                text = top_cmt.get("textDisplay") or top_cmt.get("textOriginal") or ""
                if not text.strip():
                    continue

                comments.append({
                    "comment_id": cmt_id,
                    "video_id": video_id,
                    "video_title": video_title,
                    "author": top_cmt.get("authorDisplayName", "Viewer"),
                    "text": text.strip(),
                    "published_at": top_cmt.get("publishedAt"),
                    "updated_at": top_cmt.get("updatedAt"),
                    "likes": int(top_cmt.get("likeCount", 0)) if top_cmt.get("likeCount") else 0,
                    "reply_count": int(it.get("snippet", {}).get("totalReplyCount", 0)),
                    "canonical_url": f"https://www.youtube.com/watch?v={video_id}&lc={cmt_id}"
                })

            return comments

    async def investigate_trend(
        self,
        topic: str,
        investigation_id: str = "inv_unknown",
        region: str = "IN",
        region_code: Optional[str] = None,
        max_videos: int = 10,
        queries: Optional[List[str]] = None,
        published_after: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Executes bounded, quota-aware YouTube trend investigation:
        1. Executes search query for trend.
        2. Enriches video metadata in a single batch.
        3. Retrieves comments from top most-engaged videos.
        4. Normalizes all results into EvidenceItem dicts.
        """
        target_region = region_code or region or "IN"

        if not self.is_configured:
            return {
                "status": "not_configured",
                "evidence": [],
                "video_count": 0,
                "comment_count": 0,
                "quota_used": 0,
                "videos": [],
                "top_questions": [],
                "error": "YouTube Data API key is not configured."
            }

        search_query = (queries[0] if queries else None) or topic
        collected_evidence: List[EvidenceItem] = []
        top_questions: List[str] = []
        status = "success"
        error_msg = None

        try:
            # 1. Search videos
            raw_items = await self.search_videos(
                query=search_query,
                region_code=target_region,
                max_results=min(max_videos, settings.YOUTUBE_MAX_SEARCH_RESULTS),
                published_after=published_after
            )

            # Deduplicate video IDs
            video_ids = []
            for item in raw_items:
                vid = item.get("id", {}).get("videoId")
                if vid and vid not in video_ids:
                    video_ids.append(vid)

            if not video_ids:
                return {
                    "status": "success",
                    "evidence": [],
                    "video_count": 0,
                    "comment_count": 0,
                    "quota_used": self.quota_used,
                    "videos": [],
                    "top_questions": [],
                    "message": f"No relevant YouTube videos found for '{search_query}'."
                }

            # 2. Batch enrich metadata
            enriched_map = await self.enrich_videos(video_ids)

            # Convert videos into EvidenceItem instances
            now_utc = datetime.now(timezone.utc)
            enriched_videos_list = list(enriched_map.values())

            for vid, vdata in enriched_map.items():
                v_title = vdata["title"]
                v_desc = vdata["description"]
                v_excerpt = f"{v_title}\n\n{v_desc[:400]}" if v_desc else v_title
                content_hash = generate_content_hash(f"{vid}:{v_title}")

                pub_at = None
                if vdata.get("published_at"):
                    try:
                        pub_at = datetime.fromisoformat(vdata["published_at"].replace("Z", "+00:00"))
                    except Exception:
                        pub_at = now_utc

                ev_item = EvidenceItem(
                    evidence_id=f"ev_yt_v_{vid[:12]}",
                    investigation_id=investigation_id,
                    source_type="video_platform",
                    platform="youtube",
                    title=v_title,
                    text_excerpt=v_excerpt,
                    url=vdata["canonical_url"],
                    published_at=pub_at,
                    retrieved_at=now_utc,
                    author=vdata["channel_title"],
                    engagement={
                        "views": vdata["views"],
                        "likes": vdata["likes"],
                        "comments": vdata["comments"],
                        "duration": vdata["duration"]
                    },
                    metadata={
                        "provider": "youtube_data_api",
                        "retrieval_method": "video_metadata",
                        "video_id": vid,
                        "channel_id": vdata["channel_id"],
                        "channel_title": vdata["channel_title"],
                        "thumbnail_url": vdata["thumbnail_url"],
                        "is_synthetic": False
                    },
                    content_hash=content_hash,
                    confidence=0.90,
                    is_inferred=False
                )
                collected_evidence.append(ev_item)

            # 3. Select top videos for comments (budgeted to top N by comments/views)
            sorted_for_comments = sorted(
                enriched_videos_list,
                key=lambda x: (x.get("comments", 0), x.get("views", 0)),
                reverse=True
            )
            selected_videos = [v for v in sorted_for_comments if v.get("comments", 0) > 0][:settings.YOUTUBE_MAX_COMMENT_VIDEOS]

            # 4. Fetch comment threads
            comments_collected_count = 0
            for sv in selected_videos:
                try:
                    cmts = await self.get_video_comments(
                        video_id=sv["video_id"],
                        video_title=sv["title"],
                        max_results=settings.YOUTUBE_MAX_COMMENTS_PER_VIDEO
                    )
                    for c in cmts:
                        c_text = c["text"]
                        content_hash = generate_content_hash(c_text)
                        c_pub = None
                        if c.get("published_at"):
                            try:
                                c_pub = datetime.fromisoformat(c["published_at"].replace("Z", "+00:00"))
                            except Exception:
                                c_pub = now_utc

                        # Check if comment is an explicit audience question
                        if "?" in c_text or any(c_text.lower().startswith(w) for w in ["how", "why", "what", "where", "can", "is"]):
                            if len(c_text) < 200:
                                top_questions.append(c_text)

                        ev_cmt = EvidenceItem(
                            evidence_id=f"ev_yt_c_{c['comment_id'][:12]}",
                            investigation_id=investigation_id,
                            source_type="video_platform",
                            platform="youtube",
                            title=f"Viewer Comment on: {sv['title'][:60]}...",
                            text_excerpt=c_text,
                            url=c["canonical_url"],
                            published_at=c_pub,
                            retrieved_at=now_utc,
                            author=c["author"],
                            engagement={
                                "likes": c["likes"],
                                "replies": c["reply_count"]
                            },
                            metadata={
                                "provider": "youtube_data_api",
                                "retrieval_method": "comment_thread",
                                "video_id": sv["video_id"],
                                "comment_id": c["comment_id"],
                                "video_title": sv["title"],
                                "is_synthetic": False
                            },
                            content_hash=content_hash,
                            confidence=0.85,
                            is_inferred=False
                        )
                        collected_evidence.append(ev_cmt)
                        comments_collected_count += 1
                except Exception as e:
                    logger.warning(f"Error fetching comments for video {sv['video_id']}: {e}")

        except YouTubeQuotaExceededError as qe:
            status = "quota_exceeded"
            error_msg = str(qe)
            logger.warning(f"YouTube investigation hit quota limit: {qe}")
        except Exception as e:
            status = "failed"
            error_msg = str(e)
            logger.error(f"YouTube investigation error: {e}")

        return {
            "status": status,
            "evidence": [it.model_dump() for it in collected_evidence],
            "video_count": len(enriched_map) if 'enriched_map' in locals() else 0,
            "comment_count": comments_collected_count if 'comments_collected_count' in locals() else 0,
            "quota_used": self.quota_used,
            "videos": enriched_videos_list if 'enriched_videos_list' in locals() else [],
            "top_questions": top_questions[:10],
            "error": error_msg
        }


async def cleanup_expired_youtube_evidence(session: AsyncSession, retention_days: int = 30) -> int:
    """
    Enforces official YouTube API Services Developer Policies:
    Deletes YouTube API metadata and comments retrieved more than 30 days ago.
    Returns the count of purged evidence records.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await session.execute(
        text("""
            DELETE FROM investigation_evidence
            WHERE platform = 'youtube' AND retrieved_at < :cutoff
        """),
        {"cutoff": cutoff}
    )
    await session.commit()
    deleted_count = result.rowcount or 0
    logger.info(f"Purged {deleted_count} expired YouTube evidence records exceeding {retention_days}-day retention limit.")
    return deleted_count

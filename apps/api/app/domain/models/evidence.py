from pydantic import BaseModel
from typing import Literal, Any
from datetime import datetime

class EvidenceItem(BaseModel):
    evidence_id: str
    investigation_id: str

    source_type: Literal[
        "trend",
        "social",
        "web",
        "news",
        "llm",
        "video_platform"
    ]

    platform: str

    title: str | None = None
    text_excerpt: str | None = None
    url: str | None = None

    published_at: datetime | None = None
    retrieved_at: datetime

    author: str | None = None
    engagement: dict[str, Any] = {}
    metadata: dict = {}

    content_hash: str
    confidence: float = 0.85
    is_inferred: bool = False

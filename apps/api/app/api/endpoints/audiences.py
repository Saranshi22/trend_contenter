from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import json

from ...db_postgres import get_postgres_session
from ...security.auth import get_current_user
from ...domain.models.user import User

router = APIRouter()

class AudienceSegmentResponse(BaseModel):
    segment_id: str
    label: str
    description: Optional[str] = None
    needs: List[str] = []
    questions: List[str] = []
    concerns: List[str] = []
    opportunity_count: int = 0
    primary_question: Optional[str] = None


def _clean_json_list(val: Any) -> List[str]:
    if not val:
        return []
    if isinstance(val, str):
        try:
            val = json.loads(val)
        except Exception:
            return [val]
    if isinstance(val, list):
        return [str(x) for x in val if str(x).strip()]
    return []


@router.get("/", response_model=List[AudienceSegmentResponse])
async def list_audiences(
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """
    List all discovered audience segments with persona ethnographic details,
    core needs, top search questions, and associated opportunity counts.
    """
    rows = []
    try:
        result = await db.execute(
            text("""
                SELECT a.segment_id, a.label, a.description, a.needs, a.questions, a.concerns,
                       COUNT(o.opportunity_id) as opportunity_count,
                       MAX(q.question) as primary_question
                FROM audiences a
                LEFT JOIN opportunities o ON a.segment_id = o.segment_id
                LEFT JOIN questions q ON a.question_id = q.question_id
                GROUP BY a.segment_id, a.label, a.description, a.needs, a.questions, a.concerns
                ORDER BY opportunity_count DESC, a.label ASC
            """)
        )
        rows = result.mappings().all()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to query audiences from DB: {e}")

    audiences = []
    for row in rows:
        audiences.append(
            AudienceSegmentResponse(
                segment_id=row["segment_id"],
                label=row["label"] or "Target Audience Segment",
                description=row.get("description") or "Discovered target audience segment.",
                needs=_clean_json_list(row.get("needs")),
                questions=_clean_json_list(row.get("questions")),
                concerns=_clean_json_list(row.get("concerns")),
                opportunity_count=int(row.get("opportunity_count") or 0),
                primary_question=row.get("primary_question")
            )
        )
    return audiences


@router.get("/{segment_id}", response_model=AudienceSegmentResponse)
async def get_audience(
    segment_id: str,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """Get single audience segment persona by ID."""
    result = await db.execute(
        text("""
            SELECT a.segment_id, a.label, a.description, a.needs, a.questions, a.concerns,
                   COUNT(o.opportunity_id) as opportunity_count,
                   MAX(q.question) as primary_question
            FROM audiences a
            LEFT JOIN opportunities o ON a.segment_id = o.segment_id
            LEFT JOIN questions q ON a.question_id = q.question_id
            WHERE a.segment_id = :sid
            GROUP BY a.segment_id, a.label, a.description, a.needs, a.questions, a.concerns
        """),
        {"sid": segment_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Audience segment not found")

    return AudienceSegmentResponse(
        segment_id=row["segment_id"],
        label=row["label"] or "Target Audience Segment",
        description=row.get("description") or "Discovered target audience segment.",
        needs=_clean_json_list(row.get("needs")),
        questions=_clean_json_list(row.get("questions")),
        concerns=_clean_json_list(row.get("concerns")),
        opportunity_count=int(row.get("opportunity_count") or 0),
        primary_question=row.get("primary_question")
    )

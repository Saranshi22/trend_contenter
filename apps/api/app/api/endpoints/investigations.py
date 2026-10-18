from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import uuid
import json

from ...agents.investigation_graph import investigation_app
from ...security.auth import get_current_user
from ...domain.models.user import User
from ...db_postgres import AsyncSessionLocal, get_postgres_session
from ...repositories.graph_repository import PostgresGraphWriter

router = APIRouter()

class InvestigationRequest(BaseModel):
    topic: str
    region: str = "IN"
    related_topics: List[str] = []
    trend_id: Optional[str] = None

class InvestigationSummary(BaseModel):
    investigation_id: str
    topic: str
    region: str
    status: str
    stage: str
    source_statuses: Dict[str, str] = {}
    opportunities_count: int = 0
    evidence_count: int = 0
    created_at: Optional[str] = None
    errors: List[Dict[str, Any]] = []

class EvidenceDetail(BaseModel):
    evidence_id: str
    source_type: str
    platform: str
    title: Optional[str] = None
    text_excerpt: Optional[str] = None
    url: Optional[str] = None
    author: Optional[str] = None
    published_at: Optional[str] = None
    retrieved_at: Optional[str] = None
    confidence: float = 0.85
    is_inferred: bool = False
    engagement: Dict[str, Any] = {}
    metadata: Dict[str, Any] = {}

class InvestigationDetailResponse(BaseModel):
    investigation_id: str
    topic: str
    region: str
    status: str
    stage: str
    source_statuses: Dict[str, str] = {}
    research_plan: Dict[str, Any] = {}
    narratives: List[Dict[str, Any]] = []
    questions: List[Dict[str, Any]] = []
    audience_segments: List[Dict[str, Any]] = []
    content_gaps: List[Dict[str, Any]] = []
    opportunities: List[Dict[str, Any]] = []
    llm_analysis: Dict[str, Any] = {}
    evidence: List[EvidenceDetail] = []
    errors: List[Dict[str, Any]] = []
    created_at: Optional[str] = None


async def run_investigation_task(investigation_id: str, request: InvestigationRequest, user: User):
    user_id_str = str(getattr(user, "user_id", getattr(user, "id", "dev_user")))
    workspace_id_str = str(getattr(user, "workspace_id", "workspace_dev"))

    try:
        # 1. Update status to running and retrieve trend_breakdown if related_topics is empty
        related_topics = list(request.related_topics) if request.related_topics else []
        trend_id_val = request.trend_id

        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    UPDATE investigations
                    SET status = 'running', stage = 'Collecting trend context', updated_at = NOW()
                    WHERE investigation_id = :iid
                """),
                {"iid": investigation_id}
            )
            await session.execute(
                text("UPDATE trends SET status = 'investigating' WHERE LOWER(topic) = LOWER(:t)"),
                {"t": request.topic}
            )

            if not related_topics or not trend_id_val:
                query = text("""
                    SELECT trend_id, trend_breakdown FROM trends 
                    WHERE LOWER(topic) = LOWER(:t) 
                    ORDER BY retrieved_at DESC NULLS LAST LIMIT 1
                """)
                result = await session.execute(query, {"t": request.topic})
                row = result.fetchone()
                if row:
                    if not trend_id_val and row[0]:
                        trend_id_val = str(row[0])
                    if not related_topics and row[1]:
                        raw_bd = row[1]
                        if isinstance(raw_bd, str):
                            try:
                                raw_bd = json.loads(raw_bd)
                            except Exception:
                                raw_bd = []
                        if isinstance(raw_bd, list):
                            related_topics = [str(x).strip() for x in raw_bd if x and str(x).strip()]

            await session.commit()

        initial_state = {
            "investigation_id": investigation_id,
            "workspace_id": workspace_id_str,
            "user_id": user_id_str,
            "trend_id": trend_id_val or f"trend_{uuid.uuid4().hex[:8]}",
            "topic": request.topic,
            "region": request.region,
            "related_topics": related_topics,
            "trend_history": [],
            "research_plan": {},
            "social_evidence": [],
            "web_evidence": [],
            "youtube_evidence": [],
            "youtube_questions": [],
            "youtube_videos": [],
            "llm_evidence": [],
            "source_statuses": {"social": "pending", "web": "pending", "youtube": "pending", "llm": "pending"},
            "llm_analysis": {},
            "normalized_evidence": [],
            "narratives": [],
            "questions": [],
            "audience_segments": [],
            "content_gaps": [],
            "opportunities": [],
            "errors": [],
            "status": "running",
            "stage": "Executing research nodes"
        }
        
        final_state = await investigation_app.ainvoke(initial_state)
        
        async with AsyncSessionLocal() as session:
            writer = PostgresGraphWriter(session)
            await writer.write_investigation_graph(final_state)
            await session.execute(
                text("UPDATE trends SET status = 'investigated' WHERE LOWER(topic) = LOWER(:t)"),
                {"t": request.topic}
            )
            await session.commit()
            
        print(f"Investigation {investigation_id} completed successfully and saved to DB.")
    except Exception as e:
        logger.exception(f"Investigation {investigation_id} failed: {e}")
        try:
            async with AsyncSessionLocal() as session:
                err_entry = json.dumps([{"source": "pipeline", "message": str(e)}])
                await session.execute(
                    text("""
                        UPDATE investigations
                        SET status = 'failed', stage = 'Failed', errors = :err, updated_at = NOW()
                        WHERE investigation_id = :iid
                    """),
                    {"iid": investigation_id, "err": err_entry}
                )
                await session.commit()
        except Exception as inner_e:
            logger.error(f"Failed to record investigation failure state: {inner_e}")


@router.post("/", response_model=Dict[str, Any])
async def start_investigation(
    request: InvestigationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """
    Triggers an asynchronous investigation pipeline for a given trend topic.
    Idempotent: registers investigation state immediately with source-level tracking.
    """
    user_id_str = str(getattr(current_user, "user_id", getattr(current_user, "id", "dev_user")))
    workspace_id_str = str(getattr(current_user, "workspace_id", "workspace_dev"))
    investigation_id = f"inv_{uuid.uuid4().hex[:8]}"
    
    # Pre-register investigation row
    await db.execute(
        text("""
            INSERT INTO investigations (
                investigation_id, workspace_id, user_id, topic, region,
                status, stage, source_statuses, created_at, updated_at
            ) VALUES (
                :iid, :wid, :uid, :top, :reg,
                'queued', 'Queued', '{"social": "pending", "web": "pending", "youtube": "pending", "llm": "pending"}', NOW(), NOW()
            )
        """),
        {
            "iid": investigation_id,
            "wid": workspace_id_str,
            "uid": user_id_str,
            "top": request.topic,
            "reg": request.region
        }
    )
    await db.commit()

    background_tasks.add_task(run_investigation_task, investigation_id, request, current_user)
    
    return {
        "investigation_id": investigation_id,
        "status": "queued",
        "stage": "Queued",
        "message": f"Investigation for '{request.topic}' has been queued."
    }


@router.get("/", response_model=List[InvestigationSummary])
async def list_investigations(
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """List all investigations in workspace with progress and source statuses."""
    workspace_id_str = str(getattr(current_user, "workspace_id", "workspace_dev"))
    result = await db.execute(
        text("""
            SELECT i.investigation_id, i.topic, i.region, i.status, i.stage,
                   i.source_statuses, i.created_at, i.errors,
                   jsonb_array_length(COALESCE(i.opportunities, '[]'::jsonb)) as opp_count,
                   (SELECT COUNT(*) FROM investigation_evidence e WHERE e.investigation_id = i.investigation_id) as ev_count
            FROM investigations i
            WHERE i.workspace_id = :wid
            ORDER BY i.created_at DESC
        """),
        {"wid": workspace_id_str}
    )
    rows = result.mappings().all()
    
    summaries = []
    for r in rows:
        src_status = r.get("source_statuses")
        if isinstance(src_status, str):
            try:
                src_status = json.loads(src_status)
            except Exception:
                src_status = {}
        elif not isinstance(src_status, dict):
            src_status = {}

        errs = r.get("errors")
        if isinstance(errs, str):
            try:
                errs = json.loads(errs)
            except Exception:
                errs = []
        elif not isinstance(errs, list):
            errs = []

        summaries.append(
            InvestigationSummary(
                investigation_id=r["investigation_id"],
                topic=r["topic"],
                region=r.get("region") or "IN",
                status=r["status"],
                stage=r.get("stage") or "Complete",
                source_statuses=src_status,
                opportunities_count=int(r.get("opp_count") or 0),
                evidence_count=int(r.get("ev_count") or 0),
                created_at=r["created_at"].isoformat() if r.get("created_at") else None,
                errors=errs
            )
        )
    return summaries


@router.get("/{investigation_id}", response_model=InvestigationDetailResponse)
async def get_investigation_report(
    investigation_id: str,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """
    Returns full Trend Intelligence Report:
    Overview, Narratives, AI Answers, Audiences, Content Gaps, Evidence items, and Timeline.
    """
    result = await db.execute(
        text("SELECT * FROM investigations WHERE investigation_id = :iid"),
        {"iid": investigation_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Investigation not found")

    def _parse(val: Any, default: Any):
        if val is None:
            return default
        if isinstance(val, str):
            try:
                return json.loads(val)
            except Exception:
                return default
        return val

    # Fetch evidence items
    ev_res = await db.execute(
        text("SELECT * FROM investigation_evidence WHERE investigation_id = :iid ORDER BY confidence DESC"),
        {"iid": investigation_id}
    )
    ev_rows = ev_res.mappings().all()

    evidence_items = []
    for e in ev_rows:
        evidence_items.append(
            EvidenceDetail(
                evidence_id=e["evidence_id"],
                source_type=e["source_type"],
                platform=e["platform"],
                title=e.get("title"),
                text_excerpt=e.get("text_excerpt"),
                url=e.get("url"),
                author=e.get("author"),
                published_at=e["published_at"].isoformat() if e.get("published_at") else None,
                retrieved_at=e["retrieved_at"].isoformat() if e.get("retrieved_at") else None,
                confidence=float(e.get("confidence") or 0.85),
                is_inferred=bool(e.get("is_inferred", False)),
                engagement=_parse(e.get("engagement"), {}),
                metadata=_parse(e.get("metadata"), {})
            )
        )

    return InvestigationDetailResponse(
        investigation_id=row["investigation_id"],
        topic=row["topic"],
        region=row.get("region") or "IN",
        status=row["status"],
        stage=row.get("stage") or "Complete",
        source_statuses=_parse(row.get("source_statuses"), {}),
        research_plan=_parse(row.get("research_plan"), {}),
        narratives=_parse(row.get("narratives"), []),
        questions=_parse(row.get("questions"), []),
        audience_segments=_parse(row.get("audience_segments"), []),
        content_gaps=_parse(row.get("content_gaps"), []),
        opportunities=_parse(row.get("opportunities"), []),
        llm_analysis=_parse(row.get("llm_analysis"), {}),
        evidence=evidence_items,
        errors=_parse(row.get("errors"), []),
        created_at=row["created_at"].isoformat() if row.get("created_at") else None
    )


@router.post("/{investigation_id}/retry")
async def retry_investigation(
    investigation_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """Retries a failed or partial investigation without losing historical context."""
    result = await db.execute(
        text("SELECT topic, region FROM investigations WHERE investigation_id = :iid"),
        {"iid": investigation_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Investigation not found")

    req = InvestigationRequest(topic=row["topic"], region=row["region"])
    background_tasks.add_task(run_investigation_task, investigation_id, req, current_user)
    return {
        "message": f"Retry started for investigation {investigation_id}.",
        "status": "retrying",
        "investigation_id": investigation_id
    }


@router.delete("/{investigation_id}")
async def delete_investigation(
    investigation_id: str,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """Deletes an investigation, its evidence, and associated opportunities."""
    res = await db.execute(
        text("SELECT topic FROM investigations WHERE investigation_id = :iid"),
        {"iid": investigation_id}
    )
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Investigation not found")
    topic = row[0]

    # Delete opportunities created by this investigation
    await db.execute(
        text("DELETE FROM opportunities WHERE investigation_id = :iid"),
        {"iid": investigation_id}
    )
    # Delete evidence
    await db.execute(
        text("DELETE FROM investigation_evidence WHERE investigation_id = :iid"),
        {"iid": investigation_id}
    )
    # Delete the investigation record
    await db.execute(
        text("DELETE FROM investigations WHERE investigation_id = :iid"),
        {"iid": investigation_id}
    )
    # Reset trends status back to qualified/candidate if there are no other active investigations for this topic
    remaining = await db.execute(
        text("SELECT COUNT(*) FROM investigations WHERE LOWER(topic) = LOWER(:t) AND status != 'failed'"),
        {"t": topic}
    )
    if remaining.scalar() == 0:
        await db.execute(
            text("""
                UPDATE trends 
                SET status = CASE WHEN qualification_score >= 0.7 THEN 'qualified' ELSE 'candidate' END
                WHERE LOWER(topic) = LOWER(:t)
            """),
            {"t": topic}
        )
    await db.commit()
    return {"message": f"Investigation {investigation_id} for '{topic}' deleted successfully."}

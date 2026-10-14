from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import uuid
import json

from ...db_postgres import get_postgres_session
from ...security.auth import get_current_user
from ...domain.models.user import User

router = APIRouter()

class WatchlistCreateRequest(BaseModel):
    name: str
    keywords: List[str]
    region: str = "IN"
    min_qualification_score: float = 0.70
    auto_investigate: bool = False

class WatchlistResponse(BaseModel):
    watchlist_id: str
    workspace_id: str
    name: str
    keywords: List[str]
    region: str
    min_qualification_score: float
    auto_investigate: bool
    created_at: Optional[str] = None

@router.get("/", response_model=List[WatchlistResponse])
async def list_watchlists(
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """List monitored topic watchlists for this workspace."""
    result = await db.execute(
        text("SELECT * FROM watchlists WHERE workspace_id = :wid ORDER BY created_at DESC"),
        {"wid": current_user.workspace_id}
    )
    rows = result.mappings().all()

    def _parse_keys(k: Any):
        if isinstance(k, str):
            try:
                return json.loads(k)
            except Exception:
                return []
        return k if isinstance(k, list) else []

    return [
        WatchlistResponse(
            watchlist_id=r["watchlist_id"],
            workspace_id=r["workspace_id"],
            name=r["name"],
            keywords=_parse_keys(r.get("keywords")),
            region=r.get("region") or "IN",
            min_qualification_score=float(r.get("min_qualification_score") or 0.70),
            auto_investigate=bool(r.get("auto_investigate", False)),
            created_at=r["created_at"].isoformat() if r.get("created_at") else None
        )
        for r in rows
    ]

@router.post("/", response_model=WatchlistResponse)
async def create_watchlist(
    req: WatchlistCreateRequest,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """Add a new monitored topic watchlist with threshold alerting."""
    wid = f"wl_{uuid.uuid4().hex[:8]}"
    await db.execute(
        text("""
            INSERT INTO watchlists (watchlist_id, workspace_id, user_id, name, keywords, region, min_qualification_score, auto_investigate, created_at)
            VALUES (:wid, :ws, :uid, :name, :keys, :reg, :score, :auto, NOW())
        """),
        {
            "wid": wid,
            "ws": current_user.workspace_id,
            "uid": current_user.user_id,
            "name": req.name,
            "keys": json.dumps(req.keywords),
            "reg": req.region,
            "score": req.min_qualification_score,
            "auto": req.auto_investigate
        }
    )
    await db.commit()

    return WatchlistResponse(
        watchlist_id=wid,
        workspace_id=current_user.workspace_id,
        name=req.name,
        keywords=req.keywords,
        region=req.region,
        min_qualification_score=req.min_qualification_score,
        auto_investigate=req.auto_investigate
    )

@router.delete("/{watchlist_id}")
async def delete_watchlist(
    watchlist_id: str,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(get_current_user)
):
    """Remove a watchlist."""
    result = await db.execute(
        text("DELETE FROM watchlists WHERE watchlist_id = :wid AND workspace_id = :ws RETURNING watchlist_id"),
        {"wid": watchlist_id, "ws": current_user.workspace_id}
    )
    if not result.mappings().first():
        raise HTTPException(status_code=404, detail="Watchlist not found")
    await db.commit()
    return {"message": f"Watchlist {watchlist_id} removed."}

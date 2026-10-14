from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import json
import uuid

from ...db_postgres import get_postgres_session
from ...security.auth import get_current_user, require_permission
from ...domain.models.user import User
from ...config import settings

router = APIRouter()

# Pydantic Schemas
class AdminUserResponse(BaseModel):
    user_id: str
    workspace_id: str
    email: str
    full_name: str
    role: str
    created_at: Optional[str] = None

class CreateUserRequest(BaseModel):
    email: str
    full_name: str
    role: str = "viewer"

class UpdateUserRoleRequest(BaseModel):
    role: str

class IntegrationInfo(BaseModel):
    integration_id: str
    name: str
    provider_type: str
    status: str
    masked_key: str
    last_synced: Optional[str] = None
    details: Dict[str, Any] = {}

class WorkspaceConfigResponse(BaseModel):
    workspace_id: str
    trend_qualification_threshold: float
    poll_interval_minutes: int
    default_region: str
    llm_monitoring_enabled: bool
    social_research_enabled: bool
    web_research_enabled: bool

class UpdateConfigRequest(BaseModel):
    trend_qualification_threshold: Optional[float] = None
    poll_interval_minutes: Optional[int] = None
    default_region: Optional[str] = None
    llm_monitoring_enabled: Optional[bool] = None
    social_research_enabled: Optional[bool] = None
    web_research_enabled: Optional[bool] = None

class AuditLogItem(BaseModel):
    log_id: int
    actor_user_id: str
    workspace_id: str
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    timestamp: str
    metadata: Dict[str, Any] = {}


# --- Users Endpoints ---

@router.get("/users", response_model=List[AdminUserResponse])
async def list_admin_users(
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(require_permission("users.read"))
):
    """List all workspace users and their assigned roles."""
    result = await db.execute(
        text("SELECT * FROM admin_users WHERE workspace_id = :wid ORDER BY created_at ASC"),
        {"wid": current_user.workspace_id}
    )
    rows = result.mappings().all()
    return [
        AdminUserResponse(
            user_id=r["user_id"],
            workspace_id=r["workspace_id"],
            email=r["email"],
            full_name=r["full_name"],
            role=r["role"],
            created_at=r["created_at"].isoformat() if r.get("created_at") else None
        )
        for r in rows
    ]


@router.post("/users", response_model=AdminUserResponse)
async def create_admin_user(
    req: CreateUserRequest,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(require_permission("users.write"))
):
    """Invite or provision a new user in the workspace."""
    new_uid = f"usr_{uuid.uuid4().hex[:8]}"
    await db.execute(
        text("""
            INSERT INTO admin_users (user_id, workspace_id, email, full_name, role, created_at)
            VALUES (:uid, :wid, :em, :fn, :role, NOW())
        """),
        {
            "uid": new_uid,
            "wid": current_user.workspace_id,
            "em": req.email,
            "fn": req.full_name,
            "role": req.role
        }
    )
    # Audit log
    await db.execute(
        text("""
            INSERT INTO admin_audit_logs (actor_user_id, workspace_id, action, resource_type, resource_id, metadata)
            VALUES (:uid, :wid, 'USER_CREATED', 'user', :tid, :meta)
        """),
        {
            "uid": current_user.user_id,
            "wid": current_user.workspace_id,
            "tid": new_uid,
            "meta": json.dumps({"email": req.email, "role": req.role})
        }
    )
    await db.commit()

    return AdminUserResponse(
        user_id=new_uid,
        workspace_id=current_user.workspace_id,
        email=req.email,
        full_name=req.full_name,
        role=req.role
    )


@router.patch("/users/{target_user_id}", response_model=AdminUserResponse)
async def update_user_role(
    target_user_id: str,
    req: UpdateUserRoleRequest,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(require_permission("users.write"))
):
    """Change an existing user's role with backend RBAC enforcement."""
    result = await db.execute(
        text("""
            UPDATE admin_users
            SET role = :role
            WHERE user_id = :uid AND workspace_id = :wid
            RETURNING user_id, workspace_id, email, full_name, role, created_at
        """),
        {"role": req.role, "uid": target_user_id, "wid": current_user.workspace_id}
    )
    row = result.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    # Audit log
    await db.execute(
        text("""
            INSERT INTO admin_audit_logs (actor_user_id, workspace_id, action, resource_type, resource_id, metadata)
            VALUES (:uid, :wid, 'ROLE_UPDATED', 'user', :tid, :meta)
        """),
        {
            "uid": current_user.user_id,
            "wid": current_user.workspace_id,
            "tid": target_user_id,
            "meta": json.dumps({"new_role": req.role})
        }
    )
    await db.commit()

    return AdminUserResponse(
        user_id=row["user_id"],
        workspace_id=row["workspace_id"],
        email=row["email"],
        full_name=row["full_name"],
        role=row["role"],
        created_at=row["created_at"].isoformat() if row.get("created_at") else None
    )


# --- Integrations Endpoints (Strictly Masked Credentials) ---

@router.get("/integrations", response_model=List[IntegrationInfo])
async def list_integrations(
    current_user: User = Depends(require_permission("integrations.read"))
):
    """
    List configured system integrations and health status.
    NEVER exposes plain API credentials in frontend payloads or logs.
    """
    def _mask(key: str) -> str:
        if not key:
            return "Not Configured"
        if len(key) <= 6:
            return "******"
        return f"{key[:4]}...{key[-3:]}"

    return [
        IntegrationInfo(
            integration_id="int_serpapi_trends",
            name="Google Trends Radar (SerpApi)",
            provider_type="trend_radar",
            status="active" if settings.SERPAPI_API_KEY else "fallback_mock",
            masked_key=_mask(settings.SERPAPI_API_KEY),
            details={"engine": "google_trends_trending_now", "region": settings.TRENDS_GEO}
        ),
        IntegrationInfo(
            integration_id="int_serpapi_news",
            name="Google News & Web Search (SerpApi)",
            provider_type="web_news",
            status="active" if settings.SERPAPI_API_KEY else "fallback_mock",
            masked_key=_mask(settings.SERPAPI_API_KEY),
            details={"engine": "google_news"}
        ),
        IntegrationInfo(
            integration_id="int_reddit_social",
            name="Reddit Social Research Connector",
            provider_type="social",
            status="active",
            masked_key=_mask(settings.SERPAPI_API_KEY),
            details={"platform": "reddit"}
        ),
        IntegrationInfo(
            integration_id="int_ai_monitoring",
            name="LLM Ecosystem Monitoring",
            provider_type="ai_monitoring",
            status="active" if (settings.OPENAI_API_KEY or settings.GEMINI_API_KEY) else "ready_fallback",
            masked_key=_mask(settings.OPENAI_API_KEY or settings.GEMINI_API_KEY),
            details={"models": ["gpt-4o-mini", "gemini-1.5-pro"]}
        )
    ]


# --- Monitoring & Workspace Config Endpoints ---

@router.get("/config", response_model=WorkspaceConfigResponse)
async def get_workspace_config(
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(require_permission("settings.read"))
):
    """Retrieve workspace qualification parameters and monitoring settings."""
    result = await db.execute(
        text("SELECT * FROM admin_workspace_config WHERE workspace_id = :wid"),
        {"wid": current_user.workspace_id}
    )
    row = result.mappings().first()
    if not row:
        return WorkspaceConfigResponse(
            workspace_id=current_user.workspace_id,
            trend_qualification_threshold=settings.TREND_QUALIFICATION_THRESHOLD,
            poll_interval_minutes=settings.TRENDS_POLL_INTERVAL_MINUTES,
            default_region=settings.TRENDS_GEO,
            llm_monitoring_enabled=True,
            social_research_enabled=True,
            web_research_enabled=True
        )

    return WorkspaceConfigResponse(
        workspace_id=row["workspace_id"],
        trend_qualification_threshold=row["trend_qualification_threshold"],
        poll_interval_minutes=row["poll_interval_minutes"],
        default_region=row["default_region"],
        llm_monitoring_enabled=row["llm_monitoring_enabled"],
        social_research_enabled=row["social_research_enabled"],
        web_research_enabled=row["web_research_enabled"]
    )


@router.patch("/config", response_model=WorkspaceConfigResponse)
async def update_workspace_config(
    req: UpdateConfigRequest,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(require_permission("settings.write"))
):
    """Update workspace qualification thresholds and pipeline toggles."""
    await db.execute(
        text("""
            INSERT INTO admin_workspace_config (
                workspace_id, trend_qualification_threshold, poll_interval_minutes,
                default_region, llm_monitoring_enabled, social_research_enabled, web_research_enabled, updated_at
            ) VALUES (
                :wid, :thresh, :poll, :reg, :llm, :soc, :web, NOW()
            ) ON CONFLICT (workspace_id) DO UPDATE SET
                trend_qualification_threshold = COALESCE(:thresh, admin_workspace_config.trend_qualification_threshold),
                poll_interval_minutes = COALESCE(:poll, admin_workspace_config.poll_interval_minutes),
                default_region = COALESCE(:reg, admin_workspace_config.default_region),
                llm_monitoring_enabled = COALESCE(:llm, admin_workspace_config.llm_monitoring_enabled),
                social_research_enabled = COALESCE(:soc, admin_workspace_config.social_research_enabled),
                web_research_enabled = COALESCE(:web, admin_workspace_config.web_research_enabled),
                updated_at = NOW()
        """),
        {
            "wid": current_user.workspace_id,
            "thresh": req.trend_qualification_threshold if req.trend_qualification_threshold is not None else 0.70,
            "poll": req.poll_interval_minutes if req.poll_interval_minutes is not None else 60,
            "reg": req.default_region or "IN",
            "llm": req.llm_monitoring_enabled if req.llm_monitoring_enabled is not None else True,
            "soc": req.social_research_enabled if req.social_research_enabled is not None else True,
            "web": req.web_research_enabled if req.web_research_enabled is not None else True
        }
    )

    # Audit log
    await db.execute(
        text("""
            INSERT INTO admin_audit_logs (actor_user_id, workspace_id, action, resource_type, resource_id, metadata)
            VALUES (:uid, :wid, 'CONFIG_UPDATED', 'workspace_config', :wid, :meta)
        """),
        {
            "uid": current_user.user_id,
            "wid": current_user.workspace_id,
            "meta": json.dumps(req.model_dump(exclude_unset=True))
        }
    )
    await db.commit()

    return await get_workspace_config(db, current_user)


# --- Audit Logs Endpoint ---

@router.get("/audit", response_model=List[AuditLogItem])
async def list_audit_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_postgres_session),
    current_user: User = Depends(require_permission("audit.read"))
):
    """View administrative audit trail for compliance and activity verification."""
    result = await db.execute(
        text("""
            SELECT * FROM admin_audit_logs
            WHERE workspace_id = :wid
            ORDER BY timestamp DESC
            LIMIT :lim
        """),
        {"wid": current_user.workspace_id, "lim": limit}
    )
    rows = result.mappings().all()

    def _parse_meta(m: Any):
        if isinstance(m, str):
            try:
                return json.loads(m)
            except Exception:
                return {}
        return m if isinstance(m, dict) else {}

    return [
        AuditLogItem(
            log_id=r["log_id"],
            actor_user_id=r["actor_user_id"],
            workspace_id=r["workspace_id"],
            action=r["action"],
            resource_type=r["resource_type"],
            resource_id=r.get("resource_id"),
            timestamp=r["timestamp"].isoformat() if r.get("timestamp") else "",
            metadata=_parse_meta(r.get("metadata"))
        )
        for r in rows
    ]

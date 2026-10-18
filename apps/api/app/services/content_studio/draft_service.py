import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...domain.models.content_studio import (
    CampaignDraft,
    SaveCampaignDraftRequest,
    CampaignDraftSummary,
)

logger = logging.getLogger(__name__)


def _to_json_str(val: Any) -> Optional[str]:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return json.dumps(val)
    return str(val)


def _parse_json(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return val


class CampaignDraftService:
    async def save_draft(
        self,
        req: SaveCampaignDraftRequest,
        workspace_id: str,
        user_id: str,
        db: AsyncSession,
    ) -> CampaignDraft:
        """
        Durable upsert of campaign draft into PostgreSQL.
        Stores clean structured references (asset URLs, prompt, copy) rather than giant base64 payloads.
        """
        campaign_id = req.campaign_id.strip()
        if not campaign_id:
            raise ValueError("campaign_id must not be empty")

        # Derive a sensible title if not provided
        derived_title = req.title
        if not derived_title:
            if req.active_concept and isinstance(req.active_concept, dict) and req.active_concept.get("title"):
                derived_title = req.active_concept.get("title")
            elif req.brief_data and isinstance(req.brief_data, dict) and req.brief_data.get("briefText"):
                first_line = req.brief_data.get("briefText", "").split("\n")[0][:48]
                derived_title = first_line.replace("#", "").strip() or "Untitled Campaign"
            else:
                derived_title = "Untitled Campaign"

        query = text("""
            INSERT INTO campaign_drafts (
                campaign_id, workspace_id, user_id, opportunity_id, title, current_stage,
                brief_data, concepts_data, active_concept, artwork_data, active_artwork,
                curated_assets, selected_reference, copy_data, email_data, publish_data,
                status, created_at, updated_at
            )
            VALUES (
                :cid, :wid, :uid, :oid, :title, :stage,
                CAST(:brief AS jsonb), CAST(:concepts AS jsonb), CAST(:active_concept AS jsonb),
                CAST(:artwork AS jsonb), CAST(:active_artwork AS jsonb), CAST(:curated AS jsonb),
                CAST(:selected_ref AS jsonb), CAST(:copy AS jsonb), CAST(:email AS jsonb),
                CAST(:publish AS jsonb), :status, NOW(), NOW()
            )
            ON CONFLICT (campaign_id) DO UPDATE SET
                title = COALESCE(EXCLUDED.title, campaign_drafts.title),
                opportunity_id = COALESCE(EXCLUDED.opportunity_id, campaign_drafts.opportunity_id),
                current_stage = COALESCE(EXCLUDED.current_stage, campaign_drafts.current_stage),
                brief_data = COALESCE(EXCLUDED.brief_data, campaign_drafts.brief_data),
                concepts_data = COALESCE(EXCLUDED.concepts_data, campaign_drafts.concepts_data),
                active_concept = COALESCE(EXCLUDED.active_concept, campaign_drafts.active_concept),
                artwork_data = COALESCE(EXCLUDED.artwork_data, campaign_drafts.artwork_data),
                active_artwork = COALESCE(EXCLUDED.active_artwork, campaign_drafts.active_artwork),
                curated_assets = COALESCE(EXCLUDED.curated_assets, campaign_drafts.curated_assets),
                selected_reference = COALESCE(EXCLUDED.selected_reference, campaign_drafts.selected_reference),
                copy_data = COALESCE(EXCLUDED.copy_data, campaign_drafts.copy_data),
                email_data = COALESCE(EXCLUDED.email_data, campaign_drafts.email_data),
                publish_data = COALESCE(EXCLUDED.publish_data, campaign_drafts.publish_data),
                status = COALESCE(EXCLUDED.status, campaign_drafts.status),
                updated_at = NOW()
            RETURNING
                campaign_id, workspace_id, user_id, opportunity_id, title, current_stage,
                brief_data, concepts_data, active_concept, artwork_data, active_artwork,
                curated_assets, selected_reference, copy_data, email_data, publish_data,
                status, created_at, updated_at
        """)

        params = {
            "cid": campaign_id,
            "wid": workspace_id,
            "uid": user_id,
            "oid": req.opportunity_id,
            "title": derived_title,
            "stage": req.current_stage or "brief",
            "brief": _to_json_str(req.brief_data) or "{}",
            "concepts": _to_json_str(req.concepts_data),
            "active_concept": _to_json_str(req.active_concept),
            "artwork": _to_json_str(req.artwork_data) or "{}",
            "active_artwork": _to_json_str(req.active_artwork),
            "curated": _to_json_str(req.curated_assets) or "[]",
            "selected_ref": _to_json_str(req.selected_reference),
            "copy": _to_json_str(req.copy_data) or "{}",
            "email": _to_json_str(req.email_data) or "{}",
            "publish": _to_json_str(req.publish_data) or "{}",
            "status": req.status or "draft",
        }

        res = await db.execute(query, params)
        row = res.mappings().first()
        await db.commit()

        if not row:
            raise RuntimeError("Failed to persist campaign draft")

        return self._row_to_draft(row)

    async def get_draft(
        self,
        campaign_id: str,
        workspace_id: str,
        db: AsyncSession,
    ) -> Optional[CampaignDraft]:
        """Loads a saved campaign draft by ID."""
        query = text("""
            SELECT
                campaign_id, workspace_id, user_id, opportunity_id, title, current_stage,
                brief_data, concepts_data, active_concept, artwork_data, active_artwork,
                curated_assets, selected_reference, copy_data, email_data, publish_data,
                status, created_at, updated_at
            FROM campaign_drafts
            WHERE campaign_id = :cid
        """)
        res = await db.execute(query, {"cid": campaign_id})
        row = res.mappings().first()
        await db.rollback()
        if not row:
            return None
        return self._row_to_draft(row)

    async def get_latest_draft(
        self,
        workspace_id: str,
        db: AsyncSession,
    ) -> Optional[CampaignDraft]:
        """Loads the most recently updated draft for the workspace."""
        query = text("""
            SELECT
                campaign_id, workspace_id, user_id, opportunity_id, title, current_stage,
                brief_data, concepts_data, active_concept, artwork_data, active_artwork,
                curated_assets, selected_reference, copy_data, email_data, publish_data,
                status, created_at, updated_at
            FROM campaign_drafts
            ORDER BY updated_at DESC
            LIMIT 1
        """)
        res = await db.execute(query)
        row = res.mappings().first()
        await db.rollback()
        if not row:
            return None
        return self._row_to_draft(row)

    async def list_drafts(
        self,
        workspace_id: str,
        db: AsyncSession,
        limit: int = 30,
    ) -> List[CampaignDraftSummary]:
        """Lists active campaign drafts for campaign switcher."""
        query = text("""
            SELECT
                campaign_id, opportunity_id, title, current_stage, status,
                concepts_data IS NOT NULL AS has_concepts,
                active_concept IS NOT NULL AS has_active_concept,
                (artwork_data IS NOT NULL AND jsonb_array_length(COALESCE(artwork_data->'generatedImages', '[]'::jsonb)) > 0) AS has_artwork,
                created_at, updated_at
            FROM campaign_drafts
            ORDER BY updated_at DESC
            LIMIT :lim
        """)
        res = await db.execute(query, {"lim": limit})
        rows = res.mappings().all()
        await db.rollback()

        summaries = []
        for r in rows:
            summaries.append(CampaignDraftSummary(
                campaign_id=r["campaign_id"],
                opportunity_id=r["opportunity_id"],
                title=r["title"] or "Untitled Campaign",
                current_stage=r["current_stage"] or "brief",
                status=r["status"] or "draft",
                has_concepts=bool(r["has_concepts"]),
                has_active_concept=bool(r["has_active_concept"]),
                has_artwork=bool(r["has_artwork"]),
                created_at=r["created_at"].isoformat() if r["created_at"] else None,
                updated_at=r["updated_at"].isoformat() if r["updated_at"] else None,
            ))
        return summaries

    async def delete_draft(
        self,
        campaign_id: str,
        workspace_id: str,
        db: AsyncSession,
    ) -> bool:
        """Deletes a draft."""
        query = text("DELETE FROM campaign_drafts WHERE campaign_id = :cid")
        res = await db.execute(query, {"cid": campaign_id})
        await db.commit()
        return bool(res.rowcount and res.rowcount > 0)

    def _row_to_draft(self, row: Any) -> CampaignDraft:
        created_at_str = row["created_at"].isoformat() if row.get("created_at") else None
        updated_at_str = row["updated_at"].isoformat() if row.get("updated_at") else None

        return CampaignDraft(
            campaign_id=row["campaign_id"],
            workspace_id=row.get("workspace_id") or "workspace_dev",
            user_id=row.get("user_id") or "dev_user",
            opportunity_id=row.get("opportunity_id"),
            title=row.get("title") or "Untitled Campaign",
            current_stage=row.get("current_stage") or "brief",
            brief_data=_parse_json(row.get("brief_data")) or {},
            concepts_data=_parse_json(row.get("concepts_data")),
            active_concept=_parse_json(row.get("active_concept")),
            artwork_data=_parse_json(row.get("artwork_data")) or {},
            active_artwork=_parse_json(row.get("active_artwork")),
            curated_assets=_parse_json(row.get("curated_assets")) or [],
            selected_reference=_parse_json(row.get("selected_reference")),
            copy_data=_parse_json(row.get("copy_data")) or {},
            email_data=_parse_json(row.get("email_data")) or {},
            publish_data=_parse_json(row.get("publish_data")) or {},
            status=row.get("status") or "draft",
            created_at=created_at_str,
            updated_at=updated_at_str,
        )


draft_service = CampaignDraftService()

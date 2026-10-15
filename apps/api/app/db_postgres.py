from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from .config import settings

engine = create_async_engine(settings.POSTGRES_URI, echo=False)
AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def init_db():
    statements = [
        """
        CREATE TABLE IF NOT EXISTS trends (
            trend_id VARCHAR PRIMARY KEY,
            topic VARCHAR NOT NULL,
            canonical_topic VARCHAR,
            region VARCHAR,
            category VARCHAR,
            active BOOLEAN DEFAULT TRUE,
            search_volume BIGINT,
            increase_percentage FLOAT,
            trend_breakdown JSONB,
            source_links JSONB,
            source_provider VARCHAR DEFAULT 'serpapi_google_trends',
            start_timestamp TIMESTAMP,
            end_timestamp TIMESTAMP,
            observed_at TIMESTAMP,
            retrieved_at TIMESTAMP,
            novelty_score FLOAT DEFAULT 0.0,
            qualification_score FLOAT DEFAULT 0.0,
            status VARCHAR DEFAULT 'candidate'
        )
        """,
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS canonical_topic VARCHAR",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS region VARCHAR",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS category VARCHAR",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS search_volume BIGINT",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS increase_percentage FLOAT",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS trend_breakdown JSONB",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS source_links JSONB",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS source_provider VARCHAR DEFAULT 'serpapi_google_trends'",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS start_timestamp TIMESTAMP",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS end_timestamp TIMESTAMP",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS retrieved_at TIMESTAMP",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS novelty_score FLOAT DEFAULT 0.0",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS qualification_score FLOAT DEFAULT 0.0",
        "ALTER TABLE trends ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'candidate'",
        """
        CREATE TABLE IF NOT EXISTS trend_observations (
            id SERIAL PRIMARY KEY,
            trend_id VARCHAR NOT NULL,
            topic VARCHAR NOT NULL,
            region VARCHAR,
            category VARCHAR,
            search_volume BIGINT,
            increase_percentage FLOAT,
            active BOOLEAN,
            observed_at TIMESTAMP,
            retrieved_at TIMESTAMP NOT NULL,
            raw_payload JSONB
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_trend_obs_trend_id ON trend_observations(trend_id)",
        "CREATE INDEX IF NOT EXISTS idx_trend_obs_retrieved_at ON trend_observations(retrieved_at)",
        """
        CREATE TABLE IF NOT EXISTS narratives (
            narrative_id VARCHAR PRIMARY KEY,
            trend_id VARCHAR REFERENCES trends(trend_id),
            name VARCHAR NOT NULL,
            sentiment VARCHAR
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS questions (
            question_id VARCHAR PRIMARY KEY,
            narrative_id VARCHAR REFERENCES narratives(narrative_id),
            question TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS audiences (
            segment_id VARCHAR PRIMARY KEY,
            question_id VARCHAR REFERENCES questions(question_id),
            label VARCHAR NOT NULL,
            description TEXT,
            needs JSONB,
            questions JSONB,
            concerns JSONB
        )
        """,
        "ALTER TABLE audiences ADD COLUMN IF NOT EXISTS description TEXT",
        "ALTER TABLE audiences ADD COLUMN IF NOT EXISTS needs JSONB",
        "ALTER TABLE audiences ADD COLUMN IF NOT EXISTS questions JSONB",
        "ALTER TABLE audiences ADD COLUMN IF NOT EXISTS concerns JSONB",
        """
        CREATE TABLE IF NOT EXISTS opportunities (
            opportunity_id VARCHAR PRIMARY KEY,
            segment_id VARCHAR REFERENCES audiences(segment_id),
            title VARCHAR NOT NULL,
            problem TEXT,
            audience_need TEXT,
            content_gap TEXT,
            recommended_angle TEXT,
            recommended_format VARCHAR,
            score FLOAT,
            score_breakdown JSONB
        )
        """,
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS problem TEXT",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS audience_need TEXT",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS content_gap TEXT",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS recommended_angle TEXT",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS recommended_format VARCHAR",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_breakdown JSONB",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS investigation_id VARCHAR",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS evidence_ids JSONB",
        "ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'suggested'",
        """
        CREATE TABLE IF NOT EXISTS investigations (
            investigation_id VARCHAR PRIMARY KEY,
            workspace_id VARCHAR NOT NULL DEFAULT 'workspace_dev',
            user_id VARCHAR NOT NULL DEFAULT 'dev_user',
            topic VARCHAR NOT NULL,
            region VARCHAR DEFAULT 'IN',
            status VARCHAR DEFAULT 'queued',
            stage VARCHAR DEFAULT 'Queued',
            source_statuses JSONB DEFAULT '{"social": "pending", "web": "pending", "llm": "pending"}',
            research_plan JSONB,
            narratives JSONB,
            questions JSONB,
            audience_segments JSONB,
            content_gaps JSONB,
            opportunities JSONB,
            llm_analysis JSONB,
            errors JSONB DEFAULT '[]',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_investigations_workspace ON investigations(workspace_id)",
        "CREATE INDEX IF NOT EXISTS idx_investigations_topic ON investigations(topic)",
        "CREATE INDEX IF NOT EXISTS idx_investigations_created ON investigations(created_at DESC)",
        """
        CREATE TABLE IF NOT EXISTS investigation_evidence (
            evidence_id VARCHAR PRIMARY KEY,
            investigation_id VARCHAR REFERENCES investigations(investigation_id) ON DELETE CASCADE,
            source_type VARCHAR NOT NULL,
            platform VARCHAR NOT NULL,
            title TEXT,
            text_excerpt TEXT,
            url TEXT,
            published_at TIMESTAMP,
            retrieved_at TIMESTAMP DEFAULT NOW(),
            author VARCHAR,
            engagement JSONB DEFAULT '{}',
            metadata JSONB DEFAULT '{}',
            content_hash VARCHAR NOT NULL,
            confidence FLOAT DEFAULT 0.85,
            is_inferred BOOLEAN DEFAULT FALSE
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_evidence_investigation ON investigation_evidence(investigation_id)",
        "CREATE INDEX IF NOT EXISTS idx_evidence_hash ON investigation_evidence(content_hash)",
        """
        CREATE TABLE IF NOT EXISTS watchlists (
            watchlist_id VARCHAR PRIMARY KEY,
            workspace_id VARCHAR NOT NULL DEFAULT 'workspace_dev',
            user_id VARCHAR NOT NULL DEFAULT 'dev_user',
            name VARCHAR NOT NULL,
            keywords JSONB DEFAULT '[]',
            region VARCHAR DEFAULT 'IN',
            min_qualification_score FLOAT DEFAULT 0.70,
            auto_investigate BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS admin_users (
            user_id VARCHAR PRIMARY KEY,
            workspace_id VARCHAR NOT NULL DEFAULT 'workspace_dev',
            email VARCHAR NOT NULL UNIQUE,
            full_name VARCHAR NOT NULL,
            role VARCHAR NOT NULL DEFAULT 'viewer',
            created_at TIMESTAMP DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            log_id SERIAL PRIMARY KEY,
            actor_user_id VARCHAR NOT NULL,
            workspace_id VARCHAR NOT NULL DEFAULT 'workspace_dev',
            action VARCHAR NOT NULL,
            resource_type VARCHAR NOT NULL,
            resource_id VARCHAR,
            timestamp TIMESTAMP DEFAULT NOW(),
            metadata JSONB DEFAULT '{}'
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON admin_audit_logs(workspace_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON admin_audit_logs(timestamp DESC)",
        """
        CREATE TABLE IF NOT EXISTS admin_workspace_config (
            workspace_id VARCHAR PRIMARY KEY,
            trend_qualification_threshold FLOAT DEFAULT 0.70,
            poll_interval_minutes INT DEFAULT 60,
            default_region VARCHAR DEFAULT 'IN',
            llm_monitoring_enabled BOOLEAN DEFAULT TRUE,
            social_research_enabled BOOLEAN DEFAULT TRUE,
            web_research_enabled BOOLEAN DEFAULT TRUE,
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """
    ]
    try:
        async with engine.begin() as conn:
            for stmt in statements:
                clean_stmt = stmt.strip()
                if clean_stmt:
                    await conn.execute(text(clean_stmt))
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(
            f"Postgres init_db warning: {e}. Container will continue running."
        )

async def get_postgres_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session

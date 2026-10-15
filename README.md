# Trend Contenter 📡

> **Autonomous Multi-Agent Content Intelligence Platform**  
> Uncovering real-time search momentum, extracting multi-source audience evidence (Web, Reddit, YouTube, LLMs), isolating underserved market gaps, and producing scored editorial opportunity briefs with 1-click executive PDF exports.

[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Multi--Agent-FF6F00?style=flat)](https://github.com/langchain-ai/langgraph)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![ReportLab](https://img.shields.io/badge/ReportLab-PDF%20Engine-E11D48?style=flat)](https://www.reportlab.com/)

---

## 📑 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [The 5 Intelligence Evidence Sources](#-the-5-intelligence-evidence-sources)
- [Key Features](#-key-features)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites & Environment Configuration](#-prerequisites--environment-configuration)
- [Local Development Setup](#-local-development-setup)
- [Docker Deployment](#-docker-deployment)
- [REST API Reference](#-rest-api-reference)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Design System](#-design-system)

---

## 🔭 Overview

Content teams frequently waste resources producing content that either arrives too late or repeats existing surface-level coverage without addressing what users are actually asking.

**Trend Contenter** closes this gap by transforming raw search spikes into actionable, evidence-backed editorial blueprints:
1. **Detects** real-time breakout search velocity via **SerpApi Google Trends**.
2. **Qualifies** momentum using a multi-factor formula (velocity, acceleration, novelty).
3. **Dispatches** an autonomous **LangGraph multi-agent research investigation** across 5 parallel evidence providers (Google Trends, Google News, Reddit, YouTube, AI answer engines).
4. **Discovers** distinct ethnographic audience personas with concrete information needs, explicit questions, and friction points.
5. **Isolates** content gaps where current web coverage or video tutorials fail the audience.
6. **Produces** scored **Content Opportunity Briefs** complete with interactive evidence provenance and **1-click Executive PDF Export**.

---

## 🏛 System Architecture

The core of Trend Contenter is a directed, stateful multi-agent research workflow powered by **LangGraph**:

```mermaid
flowchart TD
    A[📡 SerpApi Google Trends] -->|Trending Now| B(Trend Radar & Momentum Scoring)
    B -->|Qualified Trend >= 0.70| C{Autonomous LangGraph Workflow}

    subgraph LangGraph Pipeline
        C --> D[Agent 1: Research Planner]
        D --> E1[🌐 SerpApi Web & News]
        D --> E2[💬 SerpApi Reddit Research]
        D --> E3[📹 YouTube Data API v3]
        D --> E4[🤖 LLM Brand Radar Monitoring]
        
        E1 --> F[Evidence Normalization & Provenance Deduplication]
        E2 --> F
        E3 --> F
        E4 --> F
        
        F --> G[Agent 2: Trend Story Synthesizer]
        G --> H[Agent 3: Ethnographic Audience Discovery]
        H --> I[Agent 4: Editorial Content Gap Detection]
        I --> J[Agent 5: Multi-Factor Opportunity Scoring]
    end

    J --> K[(PostgreSQL Persistence)]
    K --> L[React Glassmorphic Dashboard]
    K --> M[ReportLab Executive PDF Generator]
```

---

## 🌐 The 5 Intelligence Evidence Sources

Trend Contenter integrates 5 distinct real-world evidence sources to triangulate audience demand:

| Provider | Integration | Role & Extraction |
| :--- | :--- | :--- |
| **📡 Google Trends Radar** | SerpApi `google_trends_trending_now` | Detects hourly search spikes, regional breakout velocity, and query momentum. |
| **📰 Google News & Web** | SerpApi `google` search | Captures existing publisher articles, domain authority, and editorial framing. |
| **💬 Reddit Social Research** | SerpApi / Reddit Connector | Ingests real subreddit discussions, community sentiment, and unfiltered questions. |
| **📹 YouTube Data API v3** | Official YouTube v3 API | Analyzes video coverage, view counts, like ratios, and extracts questions from public comment threads. Quota-budgeted (~104 units/run) with 30-day retention compliance. |
| **🤖 LLM Brand Radar** | OpenAI / Gemini Direct Adapters | Probes AI answer engines to assess consensus, divergence, and knowledge voids on trending topics. |

---

## ⚡ Key Features

### 1. Multi-Agent Investigation Graph (LangGraph)
* **Isolated State Architecture:** Built on a clean `InvestigationState` TypedDict eliminating circular dependencies.
* **Resilient Graceful Degradation:** Built-in fallbacks ensure that even if an individual provider encounters rate-limits, the pipeline completes and persists all collected evidence.
* **Flexible LLM Backend:** Seamlessly toggle between **OpenAI** (`gpt-4o`, `gpt-4o-mini`) and **Google Gemini** (`gemini-1.5-pro`, `gemini-2.0-flash`).
* **Google GenAI Schema Inlining:** Automatic dereferencing of `$defs` and MLDev schema cleanup for reliable structured model outputs.

### 2. YouTube Data API v3 Evidence Ingestion
* **Bounded Search & Video Enrichment:** Samples top-ranking videos, captures engagement metrics (views, likes, comments, duration), and links canonical YouTube watch URLs.
* **Viewer Question Mining:** Parses `commentThreads.list` to isolate genuine confusion and underserved audience questions.
* **Developer Policy Compliance:** Zero media caching (permitted metadata only) and an automated 30-day retention cleanup utility (`POST /api/v1/admin/compliance/youtube-cleanup`).

### 3. Audience Ethnography & Persona Profiling
* Rather than generic demographic tags, agents extract **concrete human personas** (e.g., *"Daily Metro Commuters & East Delhi Residents"*).
* Identifies actionable **Information Needs**, **Exact Questions Asked**, and **Observed Friction Points**.

### 4. Executive PDF Brief Generation
* Built with **ReportLab 5.0.1** to generate professional, publication-ready briefs.
* Formatted in our signature dark executive aesthetic (deep slate, cyan, emerald — zero purple).
* Includes composite opportunity score matrices, audience personas, strategic market voids, and production blueprints with actionable editorial angles.

### 5. Modern Glassmorphic Web Dashboard
* **Real-Time Auto-Polling:** Automatically updates investigation progress cards every 2.5 seconds from `RUNNING AGENTS...` to `COMPLETE`.
* **Evidence Drawer:** Inspect full provenance for every citation, including rich YouTube video cards with thumbnails, statistics, and comment details.
* **Watchlists & Admin Integrations:** Monitor provider health, quota usage, and manage custom trend watchlists.

---

## 📂 Project Directory Structure

```
trend_contenter/
├── apps/
│   ├── api/                          # FastAPI Backend Application
│   │   ├── Dockerfile
│   │   └── app/
│   │       ├── main.py               # Application entry point & router mounting
│   │       ├── config.py             # Pydantic Settings & environment validation
│   │       ├── db_postgres.py        # SQLAlchemy / Asyncpg connection engine
│   │       ├── agents/               # LangGraph multi-agent pipeline
│   │       │   ├── investigation_graph.py  # Compiled workflow graph
│   │       │   ├── state.py          # InvestigationState definition
│   │       │   ├── planner.py        # Research query planning agent
│   │       │   ├── research_nodes.py # Parallel evidence collection nodes
│   │       │   ├── trend_story.py    # Narrative synthesis agent
│   │       │   ├── audience_agent.py # Persona & ethnography agent
│   │       │   └── gap_agent.py      # Content gap isolation agent
│   │       ├── api/endpoints/        # REST route controllers
│   │       │   ├── trends.py         # Trending search ingestion & radar
│   │       │   ├── investigations.py # Graph dispatch, polling, and dossiers
│   │       │   ├── opportunities.py  # Briefs and PDF export streaming
│   │       │   ├── audiences.py      # Audience segment directories
│   │       │   ├── watchlists.py     # Custom trend watchlists
│   │       │   └── admin.py          # Integration statuses & YouTube cleanup
│   │       ├── integrations/         # External provider connectors
│   │       │   ├── social/           # Reddit SerpApi connector
│   │       │   ├── web/              # Google News/Web SerpApi connector
│   │       │   ├── video/            # YouTube Data API v3 connector
│   │       │   └── llm_monitoring/   # Brand Radar AI monitoring engine
│   │       ├── scoring/              # Opportunity & qualification formulas
│   │       └── services/             # ReportLab PDF & LLM Engine factories
│   └── web/                          # React 19 + TypeScript + Vite Frontend
│       ├── Dockerfile
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx               # Root app hub with auto-polling & navigation
│           ├── index.css             # Glassmorphic dark theme design system
│           ├── components/           # Reusable UI widgets & Evidence Drawer
│           └── pages/                # Overview, Radar, Investigations, Opportunities, Admin
├── docker-compose.yml                # Multi-container orchestration (Postgres, API, Web)
├── pyproject.toml                    # Poetry dependencies & project metadata
├── scripts/                          # Utility & maintenance scripts
└── tests/                            # Pytest unit and integration test suite
```

---

## 🛠 Prerequisites & Environment Configuration

### Prerequisites
* **Python**: `^3.12`
* **Poetry**: `^1.8.0`
* **Node.js**: `^18.0.0` or `^20.0.0`
* **PostgreSQL**: `^16.0` (or Docker)

### Environment Variables (`.env`)
Create a `.env` file in the project root:

```env
APP_ENV=development

# LLM Engine Selection ('openai' or 'gemini')
LLM_PROVIDER=openai

# OpenAI Credentials
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_TEXT_MODEL=gpt-4o-mini

# Google Gemini Credentials (Optional alternate LLM engine)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_TEXT_MODEL=gemini-1.5-pro

# Official YouTube Data API v3
YOUTUBE_API_KEY=your_youtube_api_key_here
YOUTUBE_REGION_CODE=IN
YOUTUBE_MAX_SEARCH_RESULTS=10
YOUTUBE_MAX_COMMENT_VIDEOS=3
YOUTUBE_MAX_COMMENTS_PER_VIDEO=20

# SerpApi (Google Trends, Google News, Reddit Search)
SERPAPI_API_KEY=your_serpapi_key_here
TRENDS_PROVIDER=serpapi
TRENDS_GEO=IN
TRENDS_HOURS=4
TREND_QUALIFICATION_THRESHOLD=0.70

# Database Connection (Asyncpg PostgreSQL)
POSTGRES_URI=postgresql+asyncpg://trend_user:trend_password@localhost:5432/trend_contenter

# Security
JWT_SECRET=supersecretkey_change_in_production
```

---

## 🚀 Local Development Setup

### 1. Database Setup
Ensure PostgreSQL is running locally, or launch it with Docker:
```bash
docker run --name trend-postgres -e POSTGRES_DB=trend_contenter -e POSTGRES_USER=trend_user -e POSTGRES_PASSWORD=trend_password -p 5432:5432 -d postgres:16-alpine
```

### 2. Backend Setup (FastAPI + Poetry)
```bash
# Install Python dependencies
poetry install

# Run the FastAPI server with hot-reload on port 8001
poetry run uvicorn apps.api.app.main:app --reload --port 8001
```
* API Health Check: `http://localhost:8001/health`
* Interactive OpenAPI Docs: `http://localhost:8001/docs`

### 3. Frontend Setup (React + Vite)
```bash
cd apps/web

# Install frontend dependencies
npm install

# Start Vite development server
npm run dev
```
* Web Dashboard: `http://localhost:5173`

---

## 🐳 Docker Deployment

To launch the complete platform (PostgreSQL, FastAPI API, and Nginx-served Vite Frontend) using Docker Compose:

```bash
# Build and start all services
docker compose up --build -d

# View logs
docker compose logs -f
```

Services will be accessible at:
* **Frontend Web Dashboard**: `http://localhost:5173`
* **FastAPI Backend**: `http://localhost:8001`
* **PostgreSQL**: `localhost:5432`

---

## 📡 REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health status. |
| `GET` | `/api/v1/trends/?region=IN` | Lists qualified and candidate trending search spikes. |
| `POST` | `/api/v1/trends/poll?region=IN` | Triggers on-demand SerpApi trend ingestion. |
| `POST` | `/api/v1/investigations/` | Dispatches an autonomous LangGraph multi-agent investigation. |
| `GET` | `/api/v1/investigations/` | Lists all investigations with statuses, evidence counts, and provider badges. |
| `GET` | `/api/v1/investigations/{id}` | Returns complete investigation dossier with normalized evidence and citations. |
| `GET` | `/api/v1/opportunities/` | Lists scored content opportunities linked to audience personas. |
| `GET` | `/api/v1/opportunities/{id}/pdf` | Streams generated executive PDF brief. |
| `GET` | `/api/v1/audiences/` | Lists discovered audience segments with ethnographic questions and friction points. |
| `GET` | `/api/v1/admin/integrations` | Returns live health and quota metrics for all 5 intelligence providers. |
| `POST` | `/api/v1/admin/compliance/youtube-cleanup` | Enforces YouTube Developer Policy compliance (removes evidence > 30 days old). |

---

## 🧪 Testing & Quality Assurance

The codebase includes comprehensive automated test suites covering SerpApi ingestion, YouTube Data API parsing, LangGraph agents, PostgreSQL persistence, and ReportLab PDF streaming:

```bash
# Run full backend test suite (25 tests)
PYTHONPATH=. poetry run python -m pytest tests/ -v

# Run frontend TypeScript validation & production build
cd apps/web && npm run build
```

---

## 🎨 Design System

Trend Contenter uses a modern **Dark Glassmorphic UI** engineered for high-density editorial workflows:
* **Background Canvas**: Deep Charcoal / Slate (`#0a0e17`)
* **Primary Accent**: Electric Cyan (`#06b6d4`)
* **Success & Opportunity Badge**: Vibrant Emerald (`#10b981`)
* **Media & Secondary Highlight**: Ocean Blue (`#3b82f6`)
* **Alert & Friction**: Soft Amber (`#f59e0b`)
* **Palette Rule**: Strictly **zero purple** to ensure a focused, distinctive product identity.

---

## 📄 License

Proprietary © 2026 Trend Contenter. All rights reserved.
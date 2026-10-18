# Trend Contenter 📡🎨

> **Autonomous Trend Intelligence, Multi-Agent Research, and Multimodal Creative Production Platform**  
> Uncovering real-time search momentum, extracting multi-source audience evidence (SocialCrawl Social Listening, Google News & Web, YouTube Data API v3, and LLM Brand Radar), isolating underserved market voids, producing scored editorial opportunity briefs with 1-click executive PDF export, and synthesizing production-ready multi-channel campaigns (Google Gemini Images, Google Veo Dual-Routed Video, Canvas Typography Overlays, Platform-Native Copy, and 1-Click Publishing to Instagram, Facebook, and Email) in under 90 seconds.

[![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-Multi--Agent-FF6F00?style=flat)](https://github.com/langchain-ai/langgraph)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-Flash%20%7C%20Image-4285F4?style=flat&logo=google&logoColor=white)](https://ai.google.dev/)
[![Google Veo](https://img.shields.io/badge/Google%20Veo-Dual--Routed%20Video-8B5CF6?style=flat&logo=google&logoColor=white)](https://deepmind.google/technologies/veo/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)
[![ReportLab](https://img.shields.io/badge/ReportLab-PDF%20Engine-E11D48?style=flat)](https://www.reportlab.com/)

---

## 📑 Table of Contents

- [Overview & Value Proposition](#-overview--value-proposition)
- [System Architecture (Dual-Engine Pipeline)](#-system-architecture-dual-engine-pipeline)
- [AI & Cloud Synthesis Services](#-ai--cloud-synthesis-services)
- [Third-Party APIs & Intelligence Sources](#-third-party-apis--intelligence-sources)
- [Key Features](#-key-features)
  - [Engine 1: Autonomous Intelligence & Research Graph](#1-engine-1-autonomous-intelligence--research-graph)
  - [Engine 2: Multimodal Content Studio](#2-engine-2-multimodal-content-studio-5-stage-pipeline)
- [Project Directory Structure](#-project-directory-structure)
- [Prerequisites & Environment Configuration](#-prerequisites--environment-configuration)
- [Local Development Setup](#-local-development-setup)
- [Docker Deployment](#-docker-deployment)
- [Complete REST API Reference](#-complete-rest-api-reference)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [Design System](#-design-system)

---

## 🔭 Overview & Value Proposition

Content and marketing teams frequently waste resources producing content that either arrives too late (after search momentum has passed) or repeats existing surface-level coverage without addressing what prospective audiences are actively searching and asking.

**Trend Contenter** solves this end-to-end through a tightly integrated dual-engine architecture:

1. **Engine 1: Autonomous Intelligence (LangGraph Research Graph)**:
   - **Detects** breakout search velocity using SerpApi Google Trends with real-time momentum scoring.
   - **Dispatches** parallel research agents across 5 real-world evidence sources: Google Trends, Google News, SocialCrawl Social Listening (Reddit, X, TikTok, Threads, Instagram), YouTube Data API v3, and LLM brand radar probes.
   - **Discovers** ethnographic audience personas, explicit audience questions, and friction points.
   - **Isolates** editorial content voids where current web or video coverage fails.
   - **Produces** scored Content Opportunity Briefs with interactive provenance and **1-click Executive PDF Export** powered by ReportLab.

2. **Engine 2: Multimodal Content Studio (5-Stage Synthesis Pipeline)**:
   - **Ingests** briefs via 1-click opportunity transfer, document uploads (PDF, DOCX, Markdown, TXT), or custom manual topics.
   - **Synthesizes** 3 strategic creative concepts (*Trend Jacker*, *Value Blueprint*, *Emotive Story*) with tailored hooks, visual directions, and platform copy.
   - **Generates** campaign visual assets with **Google Gemini Image Generation** and cinematic video clips with **Google Veo** (supporting dual-routing via LiteLLM Gateway or direct Google AI).
   - **Refines** assets with natural language editing/retouching, multimodal image analysis, Pillow canvas typography overlays, and curated search reference reranking.
   - **Composes** platform-native copy for Instagram, Facebook, and a responsive Markdown Email Studio.
   - **Publishes** directly to Instagram (Feed Posts, Reels, Stories), Facebook (Feed Posts, Page Videos, Reels), and Email (SendGrid/SMTP), backed by automated debounced PostgreSQL autosave persistence.

---

## 🏛 System Architecture (Dual-Engine Pipeline)

```mermaid
flowchart TD
    subgraph Engine1 ["ENGINE 1: AUTONOMOUS RESEARCH & INTELLIGENCE"]
        A[📡 SerpApi Google Trends] -->|Breakout Velocity >= 0.70| B(Trend Radar & Momentum Scoring)
        B --> C{LangGraph Multi-Agent Orchestrator}

        subgraph LangGraph_Pipeline ["LangGraph Research Workflow"]
            C --> D[Agent 1: Research Planner]
            D --> E1[🌐 SerpApi Web & News]
            D --> E2[💬 SocialCrawl Social Listening]
            D --> E3[📹 YouTube Data API v3]
            D --> E4[🤖 LLM Brand Radar Probes]
            
            E1 --> F[Evidence Deduplication & Normalization]
            E2 --> F
            E3 --> F
            E4 --> F
            
            F --> G[Agent 2: Narrative Synthesizer]
            G --> H[Agent 3: Ethnographic Persona Discovery]
            H --> I[Agent 4: Editorial Content Void Isolator]
            I --> J[Agent 5: Opportunity Matrix Scoring]
        end

        J --> K[(PostgreSQL Persistence)]
        K --> L[ReportLab Executive PDF Generator]
    end

    subgraph Engine2 ["ENGINE 2: MULTIMODAL CONTENT STUDIO"]
        K -.->|1-Click Ingest| S1[Stage 1: Brief Ingestion & Upload]
        DOC[Upload PDF / DOCX / MD Brief] --> S1
        
        S1 --> S2[Stage 2: 3-Variant Creative Concept Synthesis]
        S2 -->|Concept Selection| S3[Stage 3: Visual Artwork & Video Studio]
        
        subgraph AI_Synthesis ["Multimodal AI & Media Suite"]
            S3 --> G1[Google Gemini Image Generation]
            S3 --> G2[Google Veo Dual-Routed Video Engine]
            S3 --> G3[Gemini Vision Analysis & Retouching]
            S3 --> G4[Canvas Typography Overlay Engine]
            S3 --> G5[Search Reference Image Reranker]
        end
        
        AI_Synthesis --> S4[Stage 4: Multi-Channel Editorial Studio]
        S4 -->|Instagram + Facebook + Email| S5[Stage 5: Omni-Channel Publishing]
        
        S5 --> P1[Meta Graph API: Instagram Posts, Reels & Stories]
        S5 --> P2[Meta Graph API: Facebook Feed, Videos & Reels]
        S5 --> P3[SendGrid / SMTP Email Delivery]
        S5 --> P4[GCS Signed URLs / Cloud Storage Media Hosting]
    end
```

---

## 🌐 AI & Cloud Synthesis Services

Trend Contenter natively integrates Google Cloud, Google AI Studio, and flexible LLM Gateways across its intelligence and synthesis layers:

| Service / Model | Role in Architecture | Key Technical Functionality |
| :--- | :--- | :--- |
| **Google Gemini Text** (`GEMINI_TEXT_MODEL`, e.g. `gemini-2.5-flash` / `gemini-1.5-pro`) | Concept Strategy & Video Prompt Enhancer | Powers 3-variant creative synthesis from brief documents, expands video prompts with camera angles and lighting physics, and extracts structured intelligence. |
| **Google Gemini Image** (`GEMINI_IMAGE_MODEL`, e.g. `gemini-2.5-flash-image` / `gemini-3.1-pro-image`) | Multimodal Visual Artwork & Retouching | Synthesizes photorealistic campaign hero images in `1:1`, `16:9`, `9:16`, and `3:4` aspect ratios; supports natural language editing and image analysis. |
| **Google Veo Video Engine** (`VEO_MODEL`, e.g. `veo-2.0-generate-001` / `veo-3.0-generate-001`) | Cinematic Video Synthesis & Animation | Generates broadcast-quality MP4 video clips (4s, 6s, 8s in 24 or 30 fps) via **Text-to-Video** and **Image-to-Video** animation from starting hero frames. Supports dual-routing (LLM Gateway or direct Google AI) with automatic cross-fallback. |
| **LiteLLM / Enterprise LLM Gateway** (`LLM_GATEWAY_URL`, `LLM_GATEWAY_TOKEN`) | Enterprise Gateway Video & Model Routing | Communicates with gateway video endpoints (`/v1/videos`), handles asynchronous polling, and streams binary MP4 output (`/v1/videos/{op_id}/content`). |
| **Reference Search & Reranking Engine** | Curated Reference Scoring | Multi-provider image retrieval (SerpApi, Google CSE, DuckDuckGo web fallback) with canonical URL deduplication and Gemini structured JSON evaluation of relevance, aesthetics, and editorial fit. |
| **Google Cloud Storage (GCS)** (`GCS_BUCKET`, `GCLOUD_SERVICE_KEY`) | Enterprise Cloud Storage & Signed URLs | Stores uploaded briefs, generated MP4 video streams, high-resolution imagery, and ReportLab PDF documents with signed URLs and public URLs required for Meta Graph API publishing. |
| **YouTube Data API v3** | Video Intelligence & Audience Questions | Ingests video engagement metrics and parses `commentThreads.list` to isolate genuine audience confusion. Built with automated 30-day retention compliance cleanup. |

---

## 🔌 Third-Party APIs & Intelligence Sources

| Provider | Integration | Role & Extraction |
| :--- | :--- | :--- |
| **📡 Google Trends Radar** | SerpApi `google_trends_trending_now` | Detects hourly breakout search velocity, regional momentum, and query acceleration. |
| **📰 Google News & Web** | SerpApi `google` search | Captures existing publisher articles, competitive framing, and domain authority to map narrative saturation. |
| **💬 SocialCrawl Social Listening** | SocialCrawl `search/multi` API | Ingests real public discussions, sentiment, and unfiltered questions across Reddit, X, TikTok, Threads, and Instagram. |
| **📸 Instagram Publishing** | Meta Graph API (v25.0+) | Creates media containers, polls container status until `FINISHED`, and publishes single photo posts, **Reels** (`media_type: REELS`), and **Stories** (`media_type: STORIES`). |
| **👥 Facebook Publishing** | Meta Graph API (v26.0+) | Publishes regular photo feed posts, **Page Video Posts** (`/{page_id}/videos`), and **Facebook Reels** (`/{page_id}/video_reels` with 3-phase chunked upload), with optional scheduling. |
| **✉️ SendGrid / SMTP** | SendGrid API & Standard SMTP | Dispatches responsive HTML markdown emails with custom branding, themes, and CTA tracking. |

---

## ⚡ Key Features

### 1. Engine 1: Autonomous Intelligence & Research Graph
* **LangGraph Stateful Pipeline**: Clean `InvestigationState` architecture coordinating specialized agents (Planner, Evidence Gatherers, Narrative Synthesizer, Persona Agent, Gap Agent, Scoring Agent) with built-in fallback modes.
* **Ethnographic Persona Discovery**: Replaces generic demographic labels with concrete personas (e.g. *"First-time EV Buyers Worried About Range"*), mapping exact questions asked and observed friction points.
* **Content Void Isolation**: Detects specific areas where existing articles or videos fail the audience, isolating the optimal editorial angle and recommended distribution format.
* **Executive PDF Briefs**: ReportLab 5.0.1 engine generating publication-ready, dark executive PDF briefs with opportunity score matrices and evidence provenance in 1 click.

### 2. Engine 2: Multimodal Content Studio (5-Stage Pipeline)
* **Stage 1 — Brief Ingestion**: 1-click ingest from trend investigations, document uploads (PDF, DOCX, Markdown, TXT), or manual creative topics.
* **Stage 2 — 3-Variant Creative Synthesis**: Automatically generates 3 distinct editorial angles:
  - *Variant A (Trend Jacker)*: High-urgency hook, cultural tension, stopping the scroll.
  - *Variant B (Value Blueprint)*: Practical utility, step-by-step problem solver.
  - *Variant C (Emotive Story)*: Human narrative, relatable aspirations, emotional resonance.
* **Stage 3 — Visual Artwork Studio**:
  - Direct **Google Gemini Image Synthesis** across multiple aspect ratios (`1:1`, `16:9`, `9:16`, `3:4`).
  - **Google Veo Cinematic Video Synthesis** with Text-to-Video and Image-to-Video frame animation, powered by dual-routing (LLM Gateway or Google GenAI).
  - **Natural Language Image Retouching & Inpainting** (background modification, object alteration, style transfer).
  - **Multimodal Image Vision Inspection** (detecting objects, subjects, and visual direction).
  - **Canvas Typography Overlay Engine** (server-side Pillow rendering of custom headlines, badges, drop shadows, and opacities).
  - **Google Search Reference Curation** with cross-provider deduplication and Gemini relevance reranking.
* **Stage 4 — Multi-Channel Editorial Studio**: Platform-native copy for Instagram and Facebook, plus an interactive split-screen Markdown Email Studio with live rendering, themes (Modern Minimalist, Editorial Dark, Emerald Clean, Sunset Amber), and customizable CTA buttons.
* **Stage 5 — Omni-Channel Publishing & Autosave Persistence**:
  - Direct publishing to Instagram (Feed, Reels, Stories) with media container readiness polling.
  - Direct publishing to Facebook (Feed Posts, Page Videos, Reels) with scheduling support.
  - Responsive email dispatch via SendGrid or SMTP.
  - GCS / Cloud Storage signed URL integration for public media availability.
  - Automated debounced autosaving to PostgreSQL `campaign_drafts` with local storage fallback.

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
│   │       ├── db_postgres.py        # SQLAlchemy / Asyncpg connection engine & migrations
│   │       ├── security/             # JWT auth, user dependencies, RBAC guards
│   │       ├── agents/               # LangGraph multi-agent research pipeline
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
│   │       │   ├── content_studio.py # 5-stage Content Studio API endpoints
│   │       │   ├── watchlists.py     # Custom trend watchlists
│   │       │   └── admin.py          # Integration statuses & YouTube cleanup
│   │       ├── domain/models/        # Pydantic schemas (Content Studio, Trends, Opportunities)
│   │       ├── repositories/         # Database persistence layers
│   │       ├── integrations/         # External provider connectors
│   │       │   ├── trends/           # Google Trends SerpApi connector
│   │       │   ├── social/           # SocialCrawl multi-platform listening connector
│   │       │   ├── web/              # Google News/Web SerpApi connector
│   │       │   ├── video/            # YouTube Data API v3 connector
│   │       │   └── llm_monitoring/   # Brand Radar AI monitoring engine
│   │       ├── publishers/           # Omni-channel publishing connectors
│   │       │   ├── common.py         # Resilient retry, signed proxy upload, URL resolution
│   │       │   ├── instagram.py      # Meta Graph API Instagram publisher (Feed, Reels, Stories)
│   │       │   ├── facebook.py       # Meta Graph API Facebook publisher (Feed, Videos, Reels)
│   │       │   └── email.py          # SendGrid / SMTP email publisher
│   │       ├── scoring/              # Opportunity & qualification scoring formulas
│   │       └── services/             # Content Studio, Storage, and PDF services
│   │           ├── content_studio/   # Gemini, Veo, Search, Typography, Drafts, and Concept services
│   │           ├── storage/          # Google Cloud Storage (GCS) adapter & signed URLs
│   │           └── pdf_service.py    # ReportLab executive PDF generator
│   └── web/                          # React 19 + TypeScript + Vite Frontend
│       ├── Dockerfile
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx               # Root app hub with auto-polling & navigation
│           ├── index.css             # Glassmorphic dark theme design system
│           ├── types.ts              # Frontend TypeScript definitions
│           ├── components/           # Reusable UI widgets & Evidence Drawer
│           └── pages/
│               ├── OverviewPage.tsx      # Executive command center
│               ├── TrendsRadarPage.tsx   # Real-time search breakout velocity
│               ├── InvestigationsPage.tsx# LangGraph multi-agent dossiers
│               ├── OpportunitiesPage.tsx # Scored briefs & PDF exports
│               ├── ContentStudioPage.tsx # 5-Stage Content Creation Studio
│               ├── AudiencesPage.tsx     # Ethnographic persona directories
│               └── AdminIntegrationsPage.tsx # System health & API quotas
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

# Direct Google AI Studio Credentials (Gemini & Veo)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_TEXT_MODEL=gemini-2.5-flash
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
GEMINI_IMAGE_EDIT_MODEL=gemini-2.5-flash-image
VEO_MODEL=veo-2.0-generate-001

# Custom LLM Gateway Configuration (LiteLLM / Enterprise Gateway)
LLM_GATEWAY_URL=https://your-llm-gateway-url.com
LLM_GATEWAY_BASE_URL=https://your-llm-gateway-url.com
LLM_GATEWAY_TOKEN=your_llm_gateway_bearer_token

# Google Cloud Storage (GCS) & Cloud Credentials
GCS_BUCKET=your_gcs_bucket_name
GCLOUD_SERVICE_KEY=your_base64_encoded_service_account_json
# Or use: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# Alternate LLM Provider (Optional)
LLM_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_TEXT_MODEL=gpt-4o-mini

# Official YouTube Data API v3
YOUTUBE_API_KEY=your_youtube_api_key_here
YOUTUBE_REGION_CODE=IN
YOUTUBE_MAX_SEARCH_RESULTS=10
YOUTUBE_MAX_COMMENT_VIDEOS=3
YOUTUBE_MAX_COMMENTS_PER_VIDEO=20

# SocialCrawl Cross-Platform Social Listening
SOCIALCRAWL_API_KEY=your_socialcrawl_api_key_here

# SerpApi (Google Trends, Google News)
SERPAPI_API_KEY=your_serpapi_key_here
TRENDS_PROVIDER=serpapi
TRENDS_GEO=IN
TRENDS_HOURS=4
TREND_QUALIFICATION_THRESHOLD=0.70

# Database Connection (Asyncpg PostgreSQL)
POSTGRES_URI=postgresql+asyncpg://trend_user:trend_password@localhost:5432/trend_contenter

# Publishing Credentials (Optional - configured via UI or .env)
INSTAGRAM_USER_ID=your_instagram_user_id
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
INSTAGRAM_GRAPH_API_VERSION=v25.0
FACEBOOK_PAGE_ID=your_facebook_page_id
FACEBOOK_ACCESS_TOKEN=your_facebook_access_token
FACEBOOK_GRAPH_API_VERSION=v26.0
SENDGRID_API_KEY=your_sendgrid_key

# Security
JWT_SECRET=supersecretkey_change_in_production
JWT_EXPIRY_MINUTES=60
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

## 📡 Complete REST API Reference

### Intelligence & Research Engine
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health status and configured model summary. |
| `GET` | `/api/v1/trends/?region=IN` | Lists breakout trending search spikes with momentum scores. |
| `POST` | `/api/v1/trends/poll?region=IN` | Triggers on-demand SerpApi trend ingestion. |
| `POST` | `/api/v1/investigations/` | Dispatches an autonomous LangGraph multi-agent investigation. |
| `GET` | `/api/v1/investigations/` | Lists all investigations with statuses, evidence counts, and badges. |
| `GET` | `/api/v1/investigations/{id}` | Returns complete investigation dossier with normalized evidence and citations. |
| `GET` | `/api/v1/opportunities/` | Lists scored content opportunities linked to audience personas. |
| `GET` | `/api/v1/opportunities/{id}/pdf` | Streams generated executive PDF brief. |
| `GET` | `/api/v1/audiences/` | Lists discovered audience segments with ethnographic questions and friction points. |
| `GET` | `/api/v1/admin/integrations` | Returns live health and quota metrics for all intelligence providers. |
| `POST` | `/api/v1/admin/compliance/youtube-cleanup` | Enforces YouTube Developer Policy compliance (removes evidence > 30 days old). |

### Content Studio Engine
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/content-studio/experiments/generate` | Synthesizes 3 distinct editorial concepts (*Trend Jacker*, *Value Blueprint*, *Emotive Story*) from brief or opportunity. |
| `POST` | `/api/v1/content-studio/concepts` | Synthesizes concepts directly from raw brief text or markdown. |
| `POST` | `/api/v1/content-studio/concepts/from-opportunity` | Transfers a selected opportunity into structured Content Studio concepts. |
| `POST` | `/api/v1/content-studio/concepts/upload-brief` | Uploads and parses brief documents (`PDF`, `DOCX`, `Markdown`, `TXT`) into structured concepts. |
| `POST` | `/api/v1/content-studio/prompt/enhance` | Expands raw creative prompts with camera movement, lighting, and cinematic descriptors. |
| `POST` | `/api/v1/content-studio/images/generate` | Generates photorealistic campaign hero images using **Google Gemini Image Generation**. |
| `POST` | `/api/v1/content-studio/images/edit` | Executes natural language image editing, retouching, and background alterations. |
| `POST` | `/api/v1/content-studio/images/analyze` | Multimodal image inspection detecting objects, background type, and composition suggestions. |
| `POST` | `/api/v1/content-studio/images/add-text` | Renders server-side canvas typography, badge boxes, and drop shadows onto hero images. |
| `POST` | `/api/v1/content-studio/images/recommend` | Curates search reference images with canonical deduplication and Gemini relevance reranking. |
| `POST` | `/api/v1/content-studio/videos/generate` | Synthesizes cinematic video clips (4s, 6s, 8s) via **Google Veo** (supporting LLM Gateway & Google AI). |
| `GET` | `/api/v1/content-studio/media/{filename}` | Serves locally synthesized images and MP4 video streams. |
| `POST` | `/api/v1/content-studio/publish/instagram` | Publishes single photo posts, **Reels**, or **Stories** to Instagram via Meta Graph API with container status polling. |
| `POST` | `/api/v1/content-studio/publish/facebook` | Publishes feed posts, **Page Videos**, or **Facebook Reels** to Facebook via Meta Graph API with scheduling. |
| `POST` | `/api/v1/content-studio/publish/email` | Delivers styled markdown emails with custom CTA buttons via SendGrid or SMTP. |
| `POST` | `/api/v1/content-studio/drafts` | Saves debounced campaign drafts with full stage state to PostgreSQL `campaign_drafts`. |
| `GET` | `/api/v1/content-studio/drafts/{id}` | Restores campaign draft state from database. |

---

## 🧪 Testing & Quality Assurance

The codebase includes automated test suites covering SerpApi ingestion, YouTube Data API parsing, LangGraph agents, PostgreSQL persistence, Content Studio services, and ReportLab PDF streaming:

```bash
# Run backend test suite
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
* **Media & Veo Video Highlight**: Deep Amethyst / Purple (`#8b5cf6`)
* **Alert & Friction**: Soft Amber (`#f59e0b`)

---

## 📄 License

Proprietary © 2026 Trend Contenter. All rights reserved.

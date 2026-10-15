# Trend Contenter 🎨⚡
### Autonomous Trend Intelligence, Audience Opportunity Discovery & Multimodal Content Studio

A complete, enterprise-grade AI intelligence platform and content creation suite. Trend Contenter continuously monitors rising topic velocity across social, search, and video platforms, uses **LangGraph multi-agent workflows** to isolate unmet audience needs and competitor voids, and equips creators with a **Multimodal Content Studio** powered by **Google Gemini 3.1 Pro Image** and **Google Veo 2** video generation.

---

## 🏗️ Architecture Overview

```
trend_contenter/
├── apps/
│   ├── api/                     # FastAPI Backend (Python 3.12, Poetry / uv)
│   │   ├── app/
│   │   │   ├── agents/          # LangGraph Multi-Agent Research Pipeline
│   │   │   ├── api/endpoints/   # Versioned /api/v1 REST Endpoints
│   │   │   │   ├── content_studio.py # Gemini 3.1 & Veo Content Studio Router
│   │   │   │   ├── trends.py    # Google Trends / SerpApi Ingestion
│   │   │   │   ├── investigations.py # Autonomous Research Execution
│   │   │   │   ├── opportunities.py  # Audience Briefs & PDF Generation
│   │   │   │   └── admin.py     # Provider Health & System Settings
│   │   │   ├── services/
│   │   │   │   ├── content_studio/   # Gemini, Veo, Concepts & Typography
│   │   │   │   └── pdf_service.py    # ReportLab Executive PDF Compiler
│   │   │   └── config.py        # Centralized App Settings
│   │   └── Dockerfile
│   └── web/                     # React 19 + TypeScript + Vite Frontend
│       ├── src/
│       │   ├── pages/
│       │   │   ├── ContentStudioPage.tsx  # Integrated 4-in-1 Creative Studio
│       │   │   ├── TrendRadarPage.tsx     # Topic Velocity & Qualification
│       │   │   ├── AudienceOpportunitiesPage.tsx # Need Gaps & PDF Briefs
│       │   │   ├── InvestigationsPage.tsx # LangGraph Evidence & Citations
│       │   │   └── AdminPage.tsx          # Provider Health Dashboard
│       │   ├── apiConfig.ts     # Unified /api/v1 Base URL
│       │   └── index.css        # Clean Design System Tokens
│       └── package.json
└── tests/
    └── test_content_studio.py   # Comprehensive Suite for Content Studio
```

---

## 🌟 Key Features

### 1. 💡 Concept Studio (Brief to Multi-Platform Visual Concepts)
- **Multimodal Ingestion**: Upload custom dossiers (**PDF**, **Markdown**, or plain text) or click **"Load CBD Ground Dossier Sample"**.
- **1-Click Staged Opportunity Ingestion**: Pick any brief qualified by Trend Intelligence (marked as `selected` via `POST /opportunities/{id}/select`) and generate tailored visual concepts in a single click (`POST /api/v1/content-studio/concepts/opportunity/{id}`).
- **Platform Optimization**: Tailors concepts specifically for **Instagram Reels**, **LinkedIn Carousels**, **YouTube Shorts**, **TikTok**, and **X / Twitter**.
- **Ready Generative Prompts**: Formulates exact visual prompts engineered for **Gemini 3.1 Pro Image** and **Google Veo Video**, with one-click routing into Image Studio or Video Studio.

### 2. 🎨 Image Studio (Gemini 3.1 Pro Image)
- **Primary Model**: `gemini-3.1-pro-image` via official Google GenAI SDK (`models.generate_content` with `response_modalities=["IMAGE", "TEXT"]`).
- **Prompt Enhancer**: Automatically expands brief ideas into hyper-detailed prompts specifying lighting, textures, camera lenses, and cinematic composition.
- **Aspect Ratios**: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`.
- **Style Presets**: Photorealistic, Cinematic, Editorial Magazine, Minimalist Flat, 3D Render, Cyberpunk Neon.
- **Creative Handoff**: 1-click **"Send to Smart Editor"** to refine generated images.

### 3. 🎬 Video Studio (Google Veo)
- **Model**: `veo-2.0-generate-001` via official Google GenAI SDK (`models.generate_videos`).
- **Text-to-Video & Image-to-Video**: Generate high-definition continuous video clips from prompt descriptions or animate an uploaded seed image.
- **Cinematography Directives**: Quick tags for drone flyovers, 360° orbiting arc shots, 120fps slow-motion, and dynamic Dutch angles.
- **Controls**: Aspect ratios (`16:9`, `9:16`, `1:1`), duration (`5s`, `8s`), and frame rate (`24fps`, `30fps`).
- **In-Browser Player & MP4 Download**: Preview videos inline with full playback controls and instant MP4 export.

### 4. ✨ Smart Editor & Precision Typography Engine
- **Multimodal Inpainting & Editing**: Powered by `gemini-3.1-pro-image` combining base image, interactive canvas brush masks, and natural editing instructions.
- **Editing Modes**:
  - `Replace Background`: Swap scenic backgrounds while preserving foreground subjects and lighting.
  - `Modify Object`: Add, remove, or swap specific objects in the scene.
  - `Style Transfer`: Transform aesthetic atmosphere with multimodal guidance.
- **Precision Typography Engine (PIL)**:
  - Overlay headlines and subtext with exact positioning (`bottom-banner`, `top-banner`, `center`, `lower-third`).
  - Drop shadow, outlines, and semi-transparent pill backdrops.
- **Side-by-Side Comparison**: Live preview with **"Adopt as New Base Image"** for sequential iteration.

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- Google Gemini API Key ([Google AI Studio](https://aistudio.google.com/app/apikey))

### 2. Environment Setup
Copy the example environment file and configure your keys:
```bash
cp .env.example .env
```
Key configuration settings:
```ini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_IMAGE_MODEL=gemini-3.1-pro-image
VEO_MODEL=veo-2.0-generate-001
CONTENT_STUDIO_MEDIA_DIR=apps/api/media
```

### 3. Start Backend (`apps/api`)
```bash
# Using poetry or uv in apps/api:
cd apps/api
poetry install
poetry run uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```
The FastAPI interactive documentation will be available at:
`http://127.0.0.1:8001/docs`

### 4. Start Frontend (`apps/web`)
```bash
cd apps/web
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 📡 Content Studio REST API (`/api/v1/content-studio`)

All endpoints are versioned with `/api/v1`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/content-studio/health` | Inspects status of Gemini 3.1 & Veo models |
| `POST` | `/api/v1/content-studio/concepts` | Generates concepts from uploaded PDF/MD file or text |
| `POST` | `/api/v1/content-studio/concepts/opportunity/{id}` | 1-Click generates concepts from staged Trend brief |
| `GET` | `/api/v1/content-studio/sample-brief` | Fetches the bundled CBD Ground dossier brief |
| `POST` | `/api/v1/content-studio/images/generate` | Synthesizes images using `gemini-3.1-pro-image` |
| `POST` | `/api/v1/content-studio/images/edit` | Multimodal editing & inpainting with Gemini |
| `POST` | `/api/v1/content-studio/images/typography` | High-precision PIL typography overlay |
| `POST` | `/api/v1/content-studio/videos/generate` | Generates video using `veo-2.0-generate-001` |
| `POST` | `/api/v1/content-studio/prompt/enhance` | Expands prompt with cinematic lighting & composition |
| `GET` | `/api/v1/content-studio/media/{filename}` | Serves generated media files securely |

---

## 🧪 Testing

Run the Content Studio unit test suite:
```bash
PYTHONPATH=. pytest tests/test_content_studio.py -v
```
To verify the frontend build:
```bash
cd apps/web && npm run build
```
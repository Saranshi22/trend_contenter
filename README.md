# Trend Contenter 🎨✨
### AI Content Generation, Image Editing & Image Recommendation Engine with Google Gemini Models

A full-stack AI suite featuring state-of-the-art **Google Gemini multimodal image models** (`gemini-3.1-pro-image`, `gemini-2.5-flash-image`, `gemini-2.0-flash`) for text-to-image synthesis, multimodal image editing, precision typography overlays, and an intelligent **Image Recommendation Engine** powered by Google Search Image API and a multimodal reranker model (CLIP / Gemini / Hybrid).

---

## 🌟 Key Features

### 1. 💡 AI Concept Studio (Brief to Visual Concepts & Prompts)
- **Multimodal Brief Ingestion**: Upload executive opportunity dossiers and content strategy briefs as **PDF documents** or **Markdown/plain text** files.
- **Deep Audience & Friction Point Extraction**: Gemini analyzes the core problem, target audience profile, and information voids to determine high-leverage friction points.
- **Platform-Optimized Content Ideas**: Produces tailored concepts optimized specifically for target channels (**Instagram Reels**, **LinkedIn Carousels**, **YouTube Shorts**, **TikTok**, **X / Twitter Threads**).
- **Exact Generative Prompts**: Formulates ready-to-render visual prompts engineered for **Gemini 3.1 Pro Image** (with aspect ratios and styles) and **Google Veo Video** (with camera motion directives, duration, and FPS).
- **One-Click Creative Routing**: Directly transfers generated concept prompts into the **Image Studio** or **Video Studio** in a single click.
- **Sample Dossier Included**: One-click demo loader with the *CBD Ground Protest Organizing* executive opportunity dossier.

### 2. 🪄 AI Content Generator (Google Gemini Multimodal Models)
- **Primary Model**: `gemini-3.1-pro-image` (via official `google-genai` SDK `models.generate_content` with `response_modalities=["IMAGE", "TEXT"]`).
- **Additional Models**: `gemini-2.5-flash-image`, `gemini-2.0-flash-exp` (plus legacy Imagen fallback support).
- **Aspect Ratios**: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `21:9`.
- **Style Presets**: Photorealistic, Cinematic, Modern Anime, 3D Render, Cyberpunk Neon, Minimalist Nordic.
- **Gemini Prompt Enhancer**: Uses `gemini-2.0-flash` to expand simple ideas into hyper-detailed prompts specifying lighting, textures, camera lenses, and composition.
- **Variations & Negative Prompts**: Support for 1 to 4 variations with negative prompting.

### 3. 🎬 AI Video Studio (Google Veo Models)
- **Model**: `veo-2.0-generate-001` (via official `google-genai` SDK `models.generate_videos`).
- **Text-to-Video & Image-to-Video**: Generate high-definition cinematic video clips from text descriptions or animate existing images into motion.
- **Cinematography Controls**: Preset motion directives (FPV drone swoop, slow push-in, 360° orbit, time-lapse, 120fps slow-motion).
- **Veo Prompt Director**: Automatic prompt expansion specifying camera choreography, lighting, and temporal progression.
- **Aspect Ratios & Framerates**: `16:9`, `9:16`, `1:1` at 24fps or 30fps.
- **Frame Extraction**: Extract any frame directly into the Smart Editor for successive multimodal iteration.

### 4. 🎨 Smart Multimodal Image Editor
- **Multimodal Generation**: Powered by `gemini-3.1-pro-image` using native multimodal prompts combining source images, optional binary masks, and natural editing instructions.
- **Background Replacement**: Seamlessly swap backgrounds while keeping the foreground subjects intact with natural ambient lighting and cast shadows.
- **Object Removal**: Erase unwanted items or people with seamless inpainting matching surrounding textures.
- **Object Addition**: Insert new elements naturally into scenes with accurate perspective and shadows.
- **Object & Style Modification**: Alter attire, materials, colors, and lighting aesthetics.
- **Interactive Mask Canvas**: In-browser brush tool allowing users to paint custom masks with adjustable brush diameter.
- **Before & After Split Comparison**: Visual side-by-side inspection with one-click chaining to apply multiple successive edits.
- **Gemini Multimodal Scene Analyzer**: Deep vision inspection of uploaded images detecting subjects, background characteristics, and recommending creative editing ideas.

### 3. ✍️ Typography & Graphic Studio
- **Generative Text Rendering**: Render photorealistic typography integrated into scenes using Gemini models.
- **Precision Typography Engine**:
  - Font families: Modern Sans-Serif, Editorial Serif, Impact / Bold, Monospace.
  - Drop shadow with customizable offset and Gaussian blur.
  - Stroke outlines and translucent pill badge containers.
  - Pre-set alignments (Bottom-Center, Top-Center, Center, etc.) and rotation angles.

### 4. 🔍 Image Recommendation Engine with Reranker
- **Google Search Image API Integration**:
  - Official **Google Custom Search Engine (CSE) Image API**.
  - **SerpApi Google Images engine** support.
  - Built-in high-performance **Web image search fallback**.
- **Multimodal Reranker Model**:
  - **CLIP Vision-Text Cross-Encoder (`sentence-transformers/clip-ViT-B-32`)**: Computes cosine similarity between user prompt embeddings and candidate visual embeddings (accelerated via Apple Silicon `mps` / GPU).
  - **Gemini 2.0 Multimodal Evaluator**: LLM-as-a-Judge scoring Prompt Fidelity, Aesthetics, and Contextual Utility.
  - **Hybrid Ensemble Reranker**: Blends vector similarity with qualitative reasoning.
- **Rich Recommendation Output**:
  - Overall Match score badge (e.g., 95% Match).
  - Metric breakdown bars (Prompt Fidelity, Aesthetics & Quality, Context).
  - Qualitative AI reasoning ("Why this image is recommended").
  - One-click transfer directly into the **Smart Editor** or **Prompt Generator**.

---

## 🚀 Quick Start

### 1. Requirements
- Python 3.12+
- `uv` (or `pip`)

### 2. Configuration (`.env`)
Create a `.env` file in `backend/` or set environment variables:
```bash
# Google Gemini / Imagen API Key (https://aistudio.google.com/app/apikey)
GEMINI_API_KEY=your_gemini_api_key

# Google Custom Search API (Optional for Google Search Image API)
GOOGLE_API_KEY=your_google_api_key
GOOGLE_CSE_ID=your_cse_id

# SerpApi Key (Optional alternative for Google Image Search - https://serpapi.com/)
SERPAPI_API_KEY=your_serpapi_key
```
*(Note: You can also enter and save these keys directly inside the web UI Settings tab!)*

### 3. Run the Application
Navigate to the `backend/` directory and launch the server:
```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open your browser and navigate to:
```
http://localhost:8000
```

---

## 📡 REST API Documentation

All endpoints are versioned with the `/api/v1` prefix.

### Concept & Content Idea Generation
- **`POST /api/v1/generate-concepts`**:
  ```json
  {
    "file_base64": "data:application/pdf;base64,...",
    "file_mime_type": "application/pdf",
    "brief_text": "# Executive Opportunity Dossier: Unlocking CBD Ground...",
    "preferred_media_mix": "balanced",
    "num_concepts": 4
  }
  ```
  Returns:
  - `brief_title`, `brief_summary`, `target_audience`, `key_friction_points`
  - Array of `concepts` each featuring `target_platform`, `platform_optimization_rationale`, `concept_hook`, `visual_description`, `generation_prompt` (tailored for Gemini 3.1 Image or Veo Video), `aspect_ratio`, and camera motion choreography.
- **`GET /api/v1/sample-brief`**:
  Returns the pre-loaded CBD Ground executive opportunity dossier markdown.

### Image Content Generation (Gemini 3.1 Pro Image)
- **`POST /api/v1/generate`**:
  ```json
  {
    "prompt": "Cinematic portrait of a cyberpunk hacker in neon rain",
    "aspect_ratio": "16:9",
    "number_of_images": 1,
    "style_preset": "cyberpunk"
  }
  ```

### Video Generation (Google Veo)
- **`POST /api/v1/generate-video`**:
  ```json
  {
    "prompt": "FPV drone sweeping through a neon cyberpunk metropolis at sunset",
    "image_base64": "data:image/png;base64,...",
    "aspect_ratio": "16:9",
    "duration_seconds": 5,
    "fps": 24,
    "model": "veo-2.0-generate-001"
  }
  ```

### Image Editing
- **`POST /api/v1/edit`**:
  ```json
  {
    "image_base64": "data:image/png;base64,...",
    "mask_base64": "data:image/png;base64,...",
    "operation": "replace_background",
    "prompt": "Sunset over Santorini caldera"
  }
  ```

### Precision Typography
- **`POST /api/v1/add-text`**:
  ```json
  {
    "image_base64": "data:image/png;base64,...",
    "text": "SUMMER TREND 2026",
    "font_size": 48,
    "font_family": "sans-serif",
    "position": "bottom-center",
    "shadow": true,
    "background_box": true
  }
  ```

### Image Recommendation Engine
- **`POST /api/v1/recommend`**:
  ```json
  {
    "prompt": "minimalist sustainable architecture with bamboo",
    "num_results": 8,
    "search_provider": "auto",
    "reranker_model": "hybrid"
  }
  ```

### Vision Scene Analysis & Prompt Enhancer
- **`POST /api/v1/analyze`**: Multimodal visual scene breakdown and editing suggestions.
- **`POST /api/v1/enhance-prompt`**: Gemini 2.0 prompt expansion.
- **`GET /api/v1/health`**: Health check & model capability inspection.

---

## 🧪 Testing

Run backend tests using the virtual environment:
```bash
cd backend
uv run python -m unittest tests/test_services.py
```
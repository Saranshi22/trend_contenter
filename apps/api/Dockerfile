# Production Dockerfile for Trend Contenter API (FastAPI + LangGraph)
FROM python:3.12-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PORT=8080

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    g++ \
    libpq-dev \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install poetry

# Copy dependency specifications
COPY pyproject.toml poetry.lock* ./

# Install project dependencies
RUN poetry install --no-root --no-interaction --no-ansi

# Install runtime LLM Brand Radar and Content Studio packages
RUN pip install --upgrade litellm anthropic textblob google-generativeai google-genai pillow

# Copy application source code
COPY . .

# Expose port (Cloud Run sets $PORT dynamically, default 8080)
EXPOSE 8080

# Run uvicorn on $PORT
CMD exec uvicorn apps.api.app.main:app --host 0.0.0.0 --port ${PORT:-8080}

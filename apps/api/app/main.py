from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .config import settings
from .db import connect_to_mongo, close_mongo_connection
from .db_postgres import init_db as init_postgres

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_postgres()
    await connect_to_mongo()
    yield
    await close_mongo_connection()

app = FastAPI(
    title="Trend Contenter API",
    description="AI-powered content intelligence platform",
    version="0.1.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Update for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .api.router import api_router

app.include_router(api_router, prefix="/api/v1")

@app.get("/health")
async def health_check():
    return {"status": "ok", "environment": settings.APP_ENV}

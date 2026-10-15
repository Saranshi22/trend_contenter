from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_ENV: str = "development"
    
    GOOGLE_CLOUD_PROJECT: str = ""
    GOOGLE_CLOUD_LOCATION: str = ""
    
    GEMINI_TEXT_MODEL: str = "gemini-1.5-pro"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"
    OPENAI_TEXT_MODEL: str = "gpt-4o-mini"
    
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB: str = "trend_contenter"
    
    POSTGRES_URI: str = "postgresql+asyncpg://user:password@localhost:5432/trend_contenter"
    
    GCS_BUCKET: str = ""
    PUBSUB_PROJECT: str = ""
    
    TRENDS_PROVIDER: str = "mock"
    SERPAPI_API_KEY: str = ""
    SERPAPI_BASE_URL: str = "https://serpapi.com/search.json"
    TRENDS_GEO: str = "IN"
    TRENDS_HOURS: int = 4
    TRENDS_ONLY_ACTIVE: bool = True
    TRENDS_LANGUAGE: str = "en"
    TRENDS_POLL_INTERVAL_MINUTES: int = 60
    SERPAPI_NO_CACHE: bool = False
    TREND_QUALIFICATION_THRESHOLD: float = 0.70
    
    LLM_PROVIDER: str = "openai"
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    
    LLM_PROBE_MAX_QUERIES: int = 4
    LLM_REQUEST_TIMEOUT_SECONDS: int = 30
    LLM_MONITOR_PROVIDERS: str = "openai,gemini,litellm"
    
    GOOGLE_TRENDS_API_BASE: str = ""
    GOOGLE_TRENDS_API_KEY: str = ""
    
    LLM_MONITORING_BASE_URL: str = ""
    LLM_MONITORING_API_KEY: str = ""
    
    SOCIAL_PROVIDER: str = ""
    SOCIAL_API_KEY: str = ""
    
    WEB_SEARCH_PROVIDER: str = ""
    WEB_SEARCH_API_KEY: str = ""
    
    YOUTUBE_API_KEY: str = ""
    YOUTUBE_REGION_CODE: str = "IN"
    YOUTUBE_MAX_SEARCH_RESULTS: int = 10
    YOUTUBE_MAX_COMMENT_VIDEOS: int = 3
    YOUTUBE_MAX_COMMENTS_PER_VIDEO: int = 20
    YOUTUBE_REQUEST_TIMEOUT_SECONDS: int = 15
    YOUTUBE_DAILY_QUOTA_BUDGET: int = 10000

    def get_youtube_api_key(self) -> str:
        return (self.YOUTUBE_API_KEY or self.GEMINI_API_KEY or "").strip()

    JWT_SECRET: str = "supersecretkey" # Replace in production
    JWT_EXPIRY_MINUTES: int = 60

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()

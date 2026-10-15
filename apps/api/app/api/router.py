from fastapi import APIRouter
from .endpoints import investigations, opportunities, trends, audiences, admin, watchlists, content_studio

api_router = APIRouter()

# Register endpoint routers
api_router.include_router(investigations.router, prefix="/investigations", tags=["Investigations"])
api_router.include_router(opportunities.router, prefix="/opportunities", tags=["Opportunities"])
api_router.include_router(audiences.router, prefix="/audiences", tags=["Audience Segments"])
api_router.include_router(trends.router, prefix="/trends", tags=["Trend Radar"])
api_router.include_router(admin.router, prefix="/admin", tags=["Administration & RBAC"])
api_router.include_router(watchlists.router, prefix="/watchlists", tags=["Watchlists"])
api_router.include_router(content_studio.router, prefix="/content-studio", tags=["Content Studio"])

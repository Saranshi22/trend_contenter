from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
import jwt
from ..config import settings
from ..domain.models.user import User
from .rbac import has_permission

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/v1/auth/login", auto_error=False)

# In a real app, this would query the DB. For now, a simple mock or decode logic.
async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> User:
    if not token:
        # Dev fallback user when running locally without explicit JWT
        return User(
            user_id="dev_user",
            workspace_id="workspace_dev",
            email="dev@trendcontenter.local",
            full_name="Dev User",
            role="workspace_admin"
        )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        workspace_id: str = payload.get("workspace_id")
        
        if user_id is None or role is None or workspace_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
            
        return User(
            user_id=user_id,
            workspace_id=workspace_id,
            email=payload.get("email", ""),
            full_name=payload.get("name", ""),
            role=role
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

def require_permission(required_permission: str):
    async def permission_dependency(current_user: User = Depends(get_current_user)):
        if not has_permission(current_user.role, required_permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Not enough permissions. Requires: {required_permission}"
            )
        return current_user
    return permission_dependency

def require_workspace(workspace_id: str, current_user: User = Depends(get_current_user)):
    if current_user.workspace_id != workspace_id:
         raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this workspace is forbidden"
        )
    return current_user

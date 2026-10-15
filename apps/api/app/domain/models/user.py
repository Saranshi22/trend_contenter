from pydantic import BaseModel
from typing import Literal, List

class User(BaseModel):
    user_id: str
    workspace_id: str
    email: str
    full_name: str
    role: Literal[
        "workspace_admin",
        "research_analyst",
        "content_creator",
        "editor",
        "viewer"
    ]
    is_active: bool = True

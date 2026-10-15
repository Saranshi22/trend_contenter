ROLE_PERMISSIONS = {
    "workspace_admin": {
        "users.read",
        "users.write",
        "settings.read",
        "settings.write",
        "integrations.read",
        "integrations.write",
        "trends.read",
        "investigations.read",
        "investigations.write",
        "content.read",
        "content.write",
        "content.approve",
        "audit.read"
    },
    "research_analyst": {
        "trends.read",
        "investigations.read",
        "investigations.write",
        "evidence.read",
        "audiences.read",
        "opportunities.read"
    },
    "content_creator": {
        "trends.read",
        "investigations.read",
        "opportunities.read",
        "content.read",
        "content.write"
    },
    "editor": {
        "content.read",
        "content.write",
        "content.approve",
        "evidence.read"
    },
    "viewer": {
        "trends.read",
        "investigations.read",
        "opportunities.read",
        "content.read"
    }
}

def has_permission(user_role: str, required_permission: str) -> bool:
    if user_role not in ROLE_PERMISSIONS:
        return False
    return required_permission in ROLE_PERMISSIONS[user_role]

from pydantic import BaseModel


class DashboardStats(BaseModel):
    total_factories: int
    active_factories: int
    total_users: int
    active_users: int
    users_by_role: dict[str, int]

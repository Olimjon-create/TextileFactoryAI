import enum


class Role(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    FACTORY_OWNER = "FACTORY_OWNER"
    MANAGER = "MANAGER"
    PRODUCTION_MANAGER = "PRODUCTION_MANAGER"
    WAREHOUSE_MANAGER = "WAREHOUSE_MANAGER"
    QUALITY_MANAGER = "QUALITY_MANAGER"
    WORKER = "WORKER"


# Yuqori darajadagi rol faqat o'zidan pastroq darajadagi foydalanuvchilarni boshqaradi.
ROLE_LEVELS: dict[Role, int] = {
    Role.SUPER_ADMIN: 100,
    Role.FACTORY_OWNER: 80,
    Role.MANAGER: 60,
    Role.PRODUCTION_MANAGER: 40,
    Role.WAREHOUSE_MANAGER: 40,
    Role.QUALITY_MANAGER: 40,
    Role.WORKER: 10,
}

# Foydalanuvchilarni boshqarish huquqiga ega rollar
USER_MANAGER_ROLES = (Role.SUPER_ADMIN, Role.FACTORY_OWNER, Role.MANAGER)


def can_manage_role(actor: Role, target: Role) -> bool:
    return ROLE_LEVELS[actor] > ROLE_LEVELS[target]

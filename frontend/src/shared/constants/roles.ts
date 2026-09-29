import type { Role } from '@/shared/types';
import { tr } from '@/i18n';

export const ROLES: Role[] = [
  'SUPER_ADMIN',
  'FACTORY_OWNER',
  'MANAGER',
  'PRODUCTION_MANAGER',
  'WAREHOUSE_MANAGER',
  'QUALITY_MANAGER',
  'WORKER',
];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: tr("Super admin"),
  FACTORY_OWNER: tr("Fabrika egasi"),
  MANAGER: tr("Menejer"),
  PRODUCTION_MANAGER: tr("Ishlab chiqarish menejeri"),
  WAREHOUSE_MANAGER: tr("Ombor menejeri"),
  QUALITY_MANAGER: tr("Sifat nazorati menejeri"),
  WORKER: tr("Ishchi"),
};

export const ROLE_COLORS: Record<Role, 'error' | 'primary' | 'secondary' | 'info' | 'warning' | 'success' | 'default'> = {
  SUPER_ADMIN: 'error',
  FACTORY_OWNER: 'primary',
  MANAGER: 'secondary',
  PRODUCTION_MANAGER: 'info',
  WAREHOUSE_MANAGER: 'warning',
  QUALITY_MANAGER: 'success',
  WORKER: 'default',
};

// Backenddagi app/core/roles.py bilan bir xil bo'lishi kerak
export const ROLE_LEVELS: Record<Role, number> = {
  SUPER_ADMIN: 100,
  FACTORY_OWNER: 80,
  MANAGER: 60,
  PRODUCTION_MANAGER: 40,
  WAREHOUSE_MANAGER: 40,
  QUALITY_MANAGER: 40,
  WORKER: 10,
};

export const USER_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER'];

/** actor tayinlashi/boshqarishi mumkin bo'lgan rollar */
export function manageableRoles(actor: Role): Role[] {
  if (actor === 'SUPER_ADMIN') return ROLES;
  return ROLES.filter((r) => ROLE_LEVELS[actor] > ROLE_LEVELS[r]);
}

export function canManage(actor: Role, target: Role): boolean {
  return actor === 'SUPER_ADMIN' || ROLE_LEVELS[actor] > ROLE_LEVELS[target];
}

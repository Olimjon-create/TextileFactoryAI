import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

/** Backenddagi inventory_service.INVENTORY_VIEW_ROLES / INVENTORY_EDITOR_ROLES bilan bir xil bo'lishi kerak */
export const INVENTORY_VIEW_ROLES: Role[] = [
  'SUPER_ADMIN',
  'FACTORY_OWNER',
  'MANAGER',
  'PRODUCTION_MANAGER',
  'WAREHOUSE_MANAGER',
  'QUALITY_MANAGER',
];
export const INVENTORY_EDITOR_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'WAREHOUSE_MANAGER'];

/** Backenddagi audit_service.AUDIT_VIEW_ROLES bilan bir xil */
export const AUDIT_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER'];

export function useCanEditInventory(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...INVENTORY_EDITOR_ROLES);
}

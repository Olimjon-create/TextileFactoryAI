import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

export const ORDER_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER', 'WAREHOUSE_MANAGER'];
export const ORDER_EDITOR_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER'];

export function useCanManageOrders(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...ORDER_EDITOR_ROLES);
}

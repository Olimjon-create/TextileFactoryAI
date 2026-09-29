import { useAuth } from '@/features/auth/AuthContext';
import { INVENTORY_EDITOR_ROLES, INVENTORY_VIEW_ROLES } from '@/features/inventory/permissions';
import type { Role } from '@/shared/types';

export const LOGISTICS_VIEW_ROLES = INVENTORY_VIEW_ROLES;
export const LOGISTICS_EDITOR_ROLES = INVENTORY_EDITOR_ROLES;
export const FG_RECEIVE_ROLES: Role[] = [...INVENTORY_EDITOR_ROLES, 'PRODUCTION_MANAGER'];

export function useLogisticsPermissions() {
  const { hasRole } = useAuth();
  return { canView: hasRole(...LOGISTICS_VIEW_ROLES), canEdit: hasRole(...LOGISTICS_EDITOR_ROLES), canReceive: hasRole(...FG_RECEIVE_ROLES) };
}

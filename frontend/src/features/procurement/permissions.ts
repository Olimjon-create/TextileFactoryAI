import { INVENTORY_EDITOR_ROLES, INVENTORY_VIEW_ROLES } from '@/features/inventory/permissions';
import { useAuth } from '@/features/auth/AuthContext';

/** Backenddagi procurement_service.PROCUREMENT_*_ROLES — ombor huquqlari bilan bir xil */
export const PROCUREMENT_VIEW_ROLES = INVENTORY_VIEW_ROLES;
export const PROCUREMENT_EDITOR_ROLES = INVENTORY_EDITOR_ROLES;

export function useCanEditProcurement(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...PROCUREMENT_EDITOR_ROLES);
}

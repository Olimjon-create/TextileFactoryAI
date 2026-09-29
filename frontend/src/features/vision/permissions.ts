import { useAuth } from '@/features/auth/AuthContext';
import { PRODUCTION_EDITOR_ROLES, PRODUCTION_VIEW_ROLES } from '@/features/production/permissions';

/** Backenddagi vision_service.VISION_*_ROLES — ishlab chiqarish huquqlari bilan bir xil */
export const VISION_VIEW_ROLES = PRODUCTION_VIEW_ROLES;
export const VISION_EDITOR_ROLES = PRODUCTION_EDITOR_ROLES;

export function useCanEditVision(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...VISION_EDITOR_ROLES);
}

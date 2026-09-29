import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

export const PRODUCTION_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER', 'QUALITY_MANAGER', 'WAREHOUSE_MANAGER'];
export const PRODUCTION_EDITOR_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER'];
export const KPI_VIEW_ROLES: Role[] = PRODUCTION_EDITOR_ROLES;

export function useProductionPermissions() {
  const { hasRole } = useAuth();
  const canEdit = hasRole(...PRODUCTION_EDITOR_ROLES);
  const isQuality = hasRole('QUALITY_MANAGER');
  return {
    canEdit,
    canLog: canEdit || isQuality,
    onlyQualityStage: !canEdit && isQuality,
  };
}

import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

export const WORKFORCE_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER', 'QUALITY_MANAGER'];
export const WORKFORCE_EDITOR_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER'];
export const PAY_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER'];
export const MACHINE_VIEW_ROLES: Role[] = WORKFORCE_VIEW_ROLES;
export const MACHINE_EDITOR_ROLES: Role[] = WORKFORCE_EDITOR_ROLES;

export function useResourcePermissions() {
  const { hasRole } = useAuth();
  return {
    canEditWorkforce: hasRole(...WORKFORCE_EDITOR_ROLES),
    canSeePay: hasRole(...PAY_VIEW_ROLES),
    canEditMachines: hasRole(...MACHINE_EDITOR_ROLES),
  };
}

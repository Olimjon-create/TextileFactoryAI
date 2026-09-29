import { useAuth } from '@/features/auth/AuthContext';
import { PAY_VIEW_ROLES } from '@/features/resources/permissions';
import type { Role } from '@/shared/types';

export const FINANCE_ROLES = PAY_VIEW_ROLES;
export const REPORT_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER', 'WAREHOUSE_MANAGER', 'QUALITY_MANAGER'];

export function useCanSeeFinance(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...FINANCE_ROLES);
}

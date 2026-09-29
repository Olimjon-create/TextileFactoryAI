import { useAuth } from '@/features/auth/AuthContext';
import { PAY_VIEW_ROLES } from '@/features/resources/permissions';
import type { Role } from '@/shared/types';

/** Backenddagi costing_service.FINANCE_ROLES — ish haqi stavkalarini ko'ra oladiganlar bilan bir xil */
export const FINANCE_ROLES = PAY_VIEW_ROLES;
/** Kamida bitta hisobot ochiq bo'lgan rollar (ishchidan tashqari hammasi; aniq ro'yxat backend /reports dan) */
export const REPORT_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER', 'WAREHOUSE_MANAGER', 'QUALITY_MANAGER'];

export function useCanSeeFinance(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...FINANCE_ROLES);
}

import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

export const CUSTOMER_VIEW_ROLES: Role[] = [
  'SUPER_ADMIN',
  'FACTORY_OWNER',
  'MANAGER',
  'PRODUCTION_MANAGER',
  'WAREHOUSE_MANAGER',
  'QUALITY_MANAGER',
];
export const CUSTOMER_EDITOR_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER'];

export function useCanManageCustomers(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...CUSTOMER_EDITOR_ROLES);
}

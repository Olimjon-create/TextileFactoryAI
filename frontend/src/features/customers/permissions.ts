import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

// Backenddagi customer_service.CUSTOMER_VIEW_ROLES / CUSTOMER_EDITOR_ROLES bilan bir xil bo'lishi kerak
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

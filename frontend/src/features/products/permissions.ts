import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

/** Backenddagi product_service.PRODUCT_EDITOR_ROLES bilan bir xil bo'lishi kerak */
export const PRODUCT_EDITOR_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER'];

export function useCanEditProducts(): boolean {
  const { hasRole } = useAuth();
  return hasRole(...PRODUCT_EDITOR_ROLES);
}

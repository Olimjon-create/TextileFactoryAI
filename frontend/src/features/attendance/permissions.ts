import { useAuth } from '@/features/auth/AuthContext';
import type { Role } from '@/shared/types';

/** Backenddagi attendance_service rollari bilan bir xil bo'lishi kerak */
export const ATTENDANCE_VIEW_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER', 'QUALITY_MANAGER', 'WAREHOUSE_MANAGER'];
export const ATTENDANCE_EDITOR_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER'];
export const LEAVE_APPROVER_ROLES: Role[] = ['SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER', 'PRODUCTION_MANAGER'];

export function useAttendancePermissions() {
  const { hasRole } = useAuth();
  return { canEdit: hasRole(...ATTENDANCE_EDITOR_ROLES), canApprove: hasRole(...LEAVE_APPROVER_ROLES) };
}

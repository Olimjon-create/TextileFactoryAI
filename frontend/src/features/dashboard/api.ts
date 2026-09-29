import { api } from '@/shared/api/client';
import type { Role } from '@/shared/types';

export interface DashboardStats {
  total_factories: number;
  active_factories: number;
  total_users: number;
  active_users: number;
  users_by_role: Record<Role, number>;
}

export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/dashboard/stats').then((r) => r.data),
};

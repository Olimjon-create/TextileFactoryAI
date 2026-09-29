import { api } from '@/shared/api/client';
import type { Role, User } from '@/shared/types';

export interface UserFilters {
  search?: string;
  role?: Role | '';
  factory_id?: number | '';
}

export interface UserPayload {
  email: string;
  full_name: string;
  phone: string | null;
  password?: string;
  role: Role;
  factory_id?: number | null;
  /** Faqat super admin, zavod egasi bilan: yangi fabrika nomi */
  factory_name?: string;
  is_active: boolean;
}

const clean = (f: UserFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined));

export const usersApi = {
  list: (filters: UserFilters = {}) =>
    api.get<User[]>('/users', { params: clean(filters) }).then((r) => r.data),
  create: (data: UserPayload) => api.post<User>('/users', data).then((r) => r.data),
  update: (id: number, data: Partial<UserPayload>) =>
    api.patch<User>(`/users/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/users/${id}`),
};

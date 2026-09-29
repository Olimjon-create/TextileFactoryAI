import { api } from '@/shared/api/client';
import type { Factory } from '@/shared/types';

export interface FactoryPayload {
  name: string;
  address: string | null;
  phone: string | null;
  is_active?: boolean;
  // Katalog profili
  is_public?: boolean;
  city?: string | null;
  short_description?: string | null;
  description?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
}

export const factoriesApi = {
  list: (search?: string) =>
    api.get<Factory[]>('/factories', { params: { search: search || undefined } }).then((r) => r.data),
  create: (data: FactoryPayload) => api.post<Factory>('/factories', data).then((r) => r.data),
  update: (id: number, data: Partial<FactoryPayload>) =>
    api.patch<Factory>(`/factories/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/factories/${id}`),
};

import { api } from '@/shared/api/client';
import type { Customer, CustomerFilters, CustomerPage, CustomerPayload, CustomerStats } from './types';

const clean = (f: CustomerFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const customersApi = {
  list: (filters: CustomerFilters = {}) =>
    api.get<CustomerPage>('/customers', { params: clean(filters) }).then((r) => r.data),
  stats: () => api.get<CustomerStats>('/customers/stats').then((r) => r.data),
  countries: () => api.get<string[]>('/customers/countries').then((r) => r.data),
  get: (id: number) => api.get<Customer>(`/customers/${id}`).then((r) => r.data),
  create: (data: CustomerPayload) => api.post<Customer>('/customers', data).then((r) => r.data),
  update: (id: number, data: Partial<CustomerPayload>) =>
    api.patch<Customer>(`/customers/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/customers/${id}`),
};

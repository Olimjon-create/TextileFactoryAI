import { api } from '@/shared/api/client';
import type {
  IssuePayload,
  ManualOrderPayload,
  Order,
  OrderMaterials,
  OrderPage,
  OrderSource,
  OrderStatus,
  OrderSummary,
  OrderUpdatePayload,
} from './types';

export interface OrderFilters {
  search?: string;
  status?: OrderStatus | '';
  factory_id?: number | '';
  source?: OrderSource | '';
  overdue?: boolean | '';
  offset?: number;
  limit?: number;
}

const clean = (f: OrderFilters) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const ordersApi = {
  list: (filters: OrderFilters = {}) => api.get<OrderPage>('/orders', { params: clean(filters) }).then((r) => r.data),
  summary: () => api.get<OrderSummary>('/orders/summary').then((r) => r.data),
  get: (id: number) => api.get<Order>(`/orders/${id}`).then((r) => r.data),
  updateStatus: (id: number, status: OrderStatus) =>
    api.patch<Order>(`/orders/${id}/status`, { status }).then((r) => r.data),
  create: (data: ManualOrderPayload) => api.post<Order>('/orders', data).then((r) => r.data),
  update: (id: number, data: OrderUpdatePayload) => api.patch<Order>(`/orders/${id}`, data).then((r) => r.data),
  recordPayment: (id: number) => api.post<Order>(`/orders/${id}/payment`).then((r) => r.data),
  materials: (id: number) => api.get<OrderMaterials>(`/orders/${id}/materials`).then((r) => r.data),
  issueMaterials: (id: number, data: IssuePayload) =>
    api.post<OrderMaterials>(`/orders/${id}/materials/issue`, data).then((r) => r.data),
};

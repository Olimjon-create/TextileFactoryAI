import { api } from '@/shared/api/client';
import { cleanParams } from '@/shared/api/params';
import type {
  ProcurementSummary,
  PurchaseFilters,
  PurchaseOrderDetail,
  PurchaseOrderPage,
  PurchaseOrderPayload,
  ReceivePayload,
  SupplierDetail,
  SupplierPage,
  SupplierPayload,
} from './types';

const clean = cleanParams;

export const procurementApi = {
  summary: () => api.get<ProcurementSummary>('/procurement/summary').then((r) => r.data),

  suppliers: (filters: { search?: string; is_active?: boolean | ''; offset?: number; limit?: number } = {}) =>
    api.get<SupplierPage>('/suppliers', { params: clean(filters) }).then((r) => r.data),
  supplier: (id: number) => api.get<SupplierDetail>(`/suppliers/${id}`).then((r) => r.data),
  createSupplier: (data: SupplierPayload) => api.post<SupplierDetail>('/suppliers', data).then((r) => r.data),
  updateSupplier: (id: number, data: Partial<SupplierPayload>) => api.patch<SupplierDetail>(`/suppliers/${id}`, data).then((r) => r.data),
  removeSupplier: (id: number) => api.delete(`/suppliers/${id}`),

  list: (filters: PurchaseFilters = {}) => api.get<PurchaseOrderPage>('/purchase-orders', { params: clean(filters) }).then((r) => r.data),
  get: (id: number) => api.get<PurchaseOrderDetail>(`/purchase-orders/${id}`).then((r) => r.data),
  create: (data: PurchaseOrderPayload) => api.post<PurchaseOrderDetail>('/purchase-orders', data).then((r) => r.data),
  update: (id: number, data: Partial<PurchaseOrderPayload>) => api.patch<PurchaseOrderDetail>(`/purchase-orders/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/purchase-orders/${id}`),
  submit: (id: number) => api.post<PurchaseOrderDetail>(`/purchase-orders/${id}/submit`).then((r) => r.data),
  receive: (id: number, data: ReceivePayload) => api.post<PurchaseOrderDetail>(`/purchase-orders/${id}/receive`, data).then((r) => r.data),
  close: (id: number, reason?: string) => api.post<PurchaseOrderDetail>(`/purchase-orders/${id}/close`, { reason: reason || null }).then((r) => r.data),
  cancel: (id: number, reason?: string) => api.post<PurchaseOrderDetail>(`/purchase-orders/${id}/cancel`, { reason: reason || null }).then((r) => r.data),
};

import { api } from '@/shared/api/client';
import type {
  EmployeeKpi,
  LogPayload,
  ProductionSummary,
  TraceResult,
  UnitKind,
  WorkOrder,
  WorkOrderDetail,
  WorkOrderFilters,
  WorkOrderPayload,
} from './types';

const clean = (f: object) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false));

export const productionApi = {
  summary: () => api.get<ProductionSummary>('/production/summary').then((r) => r.data),
  list: (filters: WorkOrderFilters = {}) =>
    api.get<{ items: WorkOrder[]; total: number }>('/production/work-orders', { params: clean(filters) }).then((r) => r.data),
  get: (id: number) => api.get<WorkOrderDetail>(`/production/work-orders/${id}`).then((r) => r.data),
  create: (data: WorkOrderPayload) => api.post<WorkOrderDetail>('/production/work-orders', data).then((r) => r.data),
  update: (id: number, data: Partial<WorkOrderPayload>) => api.patch<WorkOrderDetail>(`/production/work-orders/${id}`, data).then((r) => r.data),
  complete: (id: number) => api.post<WorkOrderDetail>(`/production/work-orders/${id}/complete`).then((r) => r.data),
  cancel: (id: number) => api.post<WorkOrderDetail>(`/production/work-orders/${id}/cancel`).then((r) => r.data),
  addLog: (id: number, data: LogPayload) => api.post<WorkOrderDetail>(`/production/work-orders/${id}/logs`, data).then((r) => r.data),
  deleteLog: (logId: number) => api.delete<WorkOrderDetail>(`/production/logs/${logId}`).then((r) => r.data),
  createUnit: (id: number, kind: UnitKind, quantity: number, note?: string | null) =>
    api.post<WorkOrderDetail>(`/production/work-orders/${id}/units`, { kind, quantity, note: note || null }).then((r) => r.data),
  trace: (code: string) => api.get<TraceResult>('/production/trace', { params: { code } }).then((r) => r.data),
  kpi: (params: { date_from?: string; date_to?: string; line_id?: number | '' }) =>
    api.get<EmployeeKpi[]>('/production/kpi/employees', { params: clean(params) }).then((r) => r.data),
  fromOrder: (orderId: number, data: { line_id?: number | null; planned_start?: string | null; planned_end?: string | null; overcut_pct?: number }) =>
    api.post<WorkOrder[]>(`/orders/${orderId}/work-orders`, data).then((r) => r.data),
};

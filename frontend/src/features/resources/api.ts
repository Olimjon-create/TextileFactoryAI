import { api } from '@/shared/api/client';
import type {
  Employee,
  EmployeeFilters,
  EmployeePayload,
  JoinApprovePayload,
  JoinLink,
  JoinRequest,
  LinePayload,
  Machine,
  MachineDetail,
  MachineFilters,
  MachinePayload,
  MachineStatus,
  MaintenancePayload,
  Page,
  ProductionLine,
  ResourcesSummary,
  Shift,
  ShiftPayload,
} from './types';

const clean = (f: object) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const resourcesApi = {
  summary: (factoryId?: number | '') =>
    api.get<ResourcesSummary>('/resources/summary', { params: clean({ factory_id: factoryId }) }).then((r) => r.data),

  lines: (includeInactive = false) =>
    api.get<ProductionLine[]>('/production-lines', { params: { include_inactive: includeInactive } }).then((r) => r.data),
  createLine: (data: LinePayload) => api.post<ProductionLine>('/production-lines', data).then((r) => r.data),
  updateLine: (id: number, data: Partial<LinePayload>) => api.patch<ProductionLine>(`/production-lines/${id}`, data).then((r) => r.data),
  removeLine: (id: number) => api.delete(`/production-lines/${id}`),

  shifts: (includeInactive = false) => api.get<Shift[]>('/shifts', { params: { include_inactive: includeInactive } }).then((r) => r.data),
  createShift: (data: ShiftPayload) => api.post<Shift>('/shifts', data).then((r) => r.data),
  updateShift: (id: number, data: Partial<ShiftPayload>) => api.patch<Shift>(`/shifts/${id}`, data).then((r) => r.data),
  removeShift: (id: number) => api.delete(`/shifts/${id}`),

  employees: (filters: EmployeeFilters = {}) => api.get<Page<Employee>>('/employees', { params: clean(filters) }).then((r) => r.data),
  createEmployee: (data: EmployeePayload) => api.post<Employee>('/employees', data).then((r) => r.data),
  updateEmployee: (id: number, data: Partial<EmployeePayload>) => api.patch<Employee>(`/employees/${id}`, data).then((r) => r.data),
  removeEmployee: (id: number) => api.delete(`/employees/${id}`),
  joinLink: (factoryId?: number) => api.get<JoinLink>('/employee-join/link', { params: clean({ factory_id: factoryId }) }).then((r) => r.data),
  joinRequests: () => api.get<JoinRequest[]>('/employee-join/requests').then((r) => r.data),
  approveJoin: (id: number, data: JoinApprovePayload) => api.post<Employee>(`/employee-join/requests/${id}/approve`, data).then((r) => r.data),
  rejectJoin: (id: number) => api.post(`/employee-join/requests/${id}/reject`),

  machines: (filters: MachineFilters = {}) => api.get<Page<Machine>>('/machines', { params: clean(filters) }).then((r) => r.data),
  machine: (id: number) => api.get<MachineDetail>(`/machines/${id}`).then((r) => r.data),
  createMachine: (data: MachinePayload) => api.post<MachineDetail>('/machines', data).then((r) => r.data),
  updateMachine: (id: number, data: Partial<MachinePayload>) => api.patch<MachineDetail>(`/machines/${id}`, data).then((r) => r.data),
  removeMachine: (id: number) => api.delete(`/machines/${id}`),
  changeStatus: (id: number, status: MachineStatus, reason?: string | null) =>
    api.post<MachineDetail>(`/machines/${id}/status`, { status, reason: reason || null }).then((r) => r.data),
  addMaintenance: (id: number, data: MaintenancePayload) => api.post<MachineDetail>(`/machines/${id}/maintenance`, data).then((r) => r.data),
};

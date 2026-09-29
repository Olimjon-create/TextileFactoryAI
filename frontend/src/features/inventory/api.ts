import { api } from '@/shared/api/client';
import type {
  InventorySummary,
  MaterialDetail,
  MaterialFilters,
  MaterialPage,
  MaterialPayload,
  Movement,
  MovementFilters,
  MovementPage,
  MovementPayload,
  WarehouseLocation,
} from './types';

const clean = (filters: object) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const inventoryApi = {
  summary: (factoryId?: number | '') =>
    api.get<InventorySummary>('/inventory/summary', { params: clean({ factory_id: factoryId }) }).then((r) => r.data),

  materials: (filters: MaterialFilters = {}) =>
    api.get<MaterialPage>('/inventory/materials', { params: clean(filters) }).then((r) => r.data),
  material: (id: number) => api.get<MaterialDetail>(`/inventory/materials/${id}`).then((r) => r.data),
  createMaterial: (data: MaterialPayload) => api.post<MaterialDetail>('/inventory/materials', data).then((r) => r.data),
  updateMaterial: (id: number, data: Partial<MaterialPayload>) =>
    api.patch<MaterialDetail>(`/inventory/materials/${id}`, data).then((r) => r.data),
  removeMaterial: (id: number) => api.delete(`/inventory/materials/${id}`),

  locations: (includeInactive = false, factoryId?: number | '') =>
    api
      .get<WarehouseLocation[]>('/inventory/locations', { params: clean({ include_inactive: includeInactive, factory_id: factoryId }) })
      .then((r) => r.data),
  createLocation: (data: { code: string; name: string; factory_id?: number }) =>
    api.post<WarehouseLocation>('/inventory/locations', data).then((r) => r.data),
  updateLocation: (id: number, data: { code?: string; name?: string; is_active?: boolean }) =>
    api.patch<WarehouseLocation>(`/inventory/locations/${id}`, data).then((r) => r.data),
  removeLocation: (id: number) => api.delete(`/inventory/locations/${id}`),

  movements: (filters: MovementFilters = {}) =>
    api.get<MovementPage>('/inventory/movements', { params: clean(filters) }).then((r) => r.data),
  createMovement: (data: MovementPayload) => api.post<Movement[]>('/inventory/movements', data).then((r) => r.data),
};

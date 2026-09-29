import { api } from '@/shared/api/client';
import type { MaterialType, MaterialUnit } from '@/features/products/types';
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

export interface TurnoverRow {
  material_id: number;
  code: string;
  name: string;
  material_type: MaterialType;
  unit: MaterialUnit;
  factory_id: number;
  unit_cost: number | null;
  opening: number;
  receipts: number;
  issues: number;
  write_offs: number;
  adjustments: number;
  closing: number;
  receipts_value: number;
  issues_value: number;
  closing_value: number | null;
  last_movement_at: string | null;
}

export interface TurnoverReport {
  date_from: string;
  date_to: string;
  rows: TurnoverRow[];
  totals: {
    opening_value: number;
    receipts_value: number;
    issues_value: number;
    write_offs_value: number;
    closing_value: number;
    without_cost: number;
  };
  by_type: { material_type: MaterialType; materials: number; value: number }[];
}

export const inventoryApi = {
  turnover: (params: { date_from: string; date_to: string; material_type?: MaterialType | ''; factory_id?: number | '' }) =>
    api.get<TurnoverReport>('/inventory/reports/turnover', { params: clean(params) }).then((r) => r.data),
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

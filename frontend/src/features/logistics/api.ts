import { api } from '@/shared/api/client';
import { cleanParams } from '@/shared/api/params';
import type {
  FgMovement,
  FgMovementPage,
  FgMovementPayload,
  FgSummary,
  OrderShipping,
  ProductMovementType,
  ShipmentDetail,
  ShipmentPage,
  ShipmentPayload,
  ShipmentStatus,
  StockPage,
  TransportFields,
  WorkOrderStock,
} from './types';

const clean = cleanParams;

export const logisticsApi = {
  summary: () => api.get<FgSummary>('/finished-goods/summary').then((r) => r.data),
  stock: (filters: { search?: string; location_id?: number | ''; product_id?: number | ''; offset?: number; limit?: number } = {}) =>
    api.get<StockPage>('/finished-goods/stock', { params: clean(filters) }).then((r) => r.data),
  movements: (
    filters: {
      movement_type?: ProductMovementType | '';
      search?: string;
      work_order_id?: number;
      shipment_id?: number;
      order_id?: number;
      location_id?: number | '';
      offset?: number;
      limit?: number;
    } = {},
  ) => api.get<FgMovementPage>('/finished-goods/movements', { params: clean(filters) }).then((r) => r.data),
  createMovement: (data: FgMovementPayload) => api.post<FgMovement>('/finished-goods/movements', data).then((r) => r.data),
  workOrderStock: (woId: number) => api.get<WorkOrderStock>(`/finished-goods/work-orders/${woId}`).then((r) => r.data),
  receive: (data: { work_order_id: number; location_id: number; quantity: number; note: string | null }) =>
    api.post<WorkOrderStock>('/finished-goods/receive', data).then((r) => r.data),

  shipments: (filters: { status?: ShipmentStatus | ''; order_id?: number; late?: boolean; search?: string; offset?: number; limit?: number } = {}) =>
    api.get<ShipmentPage>('/shipments', { params: clean(filters) }).then((r) => r.data),
  shipment: (id: number) => api.get<ShipmentDetail>(`/shipments/${id}`).then((r) => r.data),
  createShipment: (data: ShipmentPayload) => api.post<ShipmentDetail>('/shipments', data).then((r) => r.data),
  updateShipment: (id: number, data: Partial<TransportFields> & { items?: ShipmentPayload['items'] }) =>
    api.patch<ShipmentDetail>(`/shipments/${id}`, data).then((r) => r.data),
  ship: (id: number, locationId?: number | null) => api.post<ShipmentDetail>(`/shipments/${id}/ship`, { location_id: locationId ?? null }).then((r) => r.data),
  deliver: (id: number, data: { received_by: string | null; delivered_at?: string | null }) =>
    api.post<ShipmentDetail>(`/shipments/${id}/deliver`, data).then((r) => r.data),
  cancel: (id: number) => api.post<ShipmentDetail>(`/shipments/${id}/cancel`).then((r) => r.data),
  orderShipping: (orderId: number) => api.get<OrderShipping>(`/orders/${orderId}/shipping`).then((r) => r.data),
};

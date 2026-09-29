import { api } from '@/shared/api/client';
import { cleanParams } from '@/shared/api/params';
import type { ProductionStage } from '@/features/resources/types';
import type { Device, DevicePayload, DeviceWithKey, EventPage, EventStatus, EventType, Rule, RulePayload, VisionEvent, VisionSummary } from './types';

export const visionApi = {
  summary: () => api.get<VisionSummary>('/vision/summary').then((r) => r.data),
  devices: () => api.get<Device[]>('/vision/devices').then((r) => r.data),
  createDevice: (data: DevicePayload) => api.post<DeviceWithKey>('/vision/devices', data).then((r) => r.data),
  updateDevice: (id: number, data: DevicePayload) => api.patch<Device>(`/vision/devices/${id}`, data).then((r) => r.data),
  rotateKey: (id: number) => api.post<DeviceWithKey>(`/vision/devices/${id}/rotate-key`).then((r) => r.data),
  removeDevice: (id: number) => api.delete(`/vision/devices/${id}`),
  events: (filters: { status?: EventStatus | ''; device_id?: number | ''; event_type?: EventType | ''; offset?: number; limit?: number } = {}) =>
    api.get<EventPage>('/vision/events', { params: cleanParams(filters) }).then((r) => r.data),
  applyEvent: (id: number, data: { work_order_id?: number | null; stage?: ProductionStage | null; quantity?: number | null }) =>
    api.post<VisionEvent>(`/vision/events/${id}/apply`, data).then((r) => r.data),
  rejectEvent: (id: number, reason?: string) => api.post<VisionEvent>(`/vision/events/${id}/reject`, { reason: reason || null }).then((r) => r.data),
  rules: () => api.get<Rule[]>('/vision/rules').then((r) => r.data),
  createRule: (data: RulePayload) => api.post<Rule>('/vision/rules', data).then((r) => r.data),
  updateRule: (id: number, data: RulePayload) => api.patch<Rule>(`/vision/rules/${id}`, data).then((r) => r.data),
  removeRule: (id: number) => api.delete(`/vision/rules/${id}`),
};

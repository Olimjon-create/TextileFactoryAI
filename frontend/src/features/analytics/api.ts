import { api } from '@/shared/api/client';
import { cleanParams } from '@/shared/api/params';
import type { FactorySettings, NotificationList, OrderCosting, Overview, ReportInfo, ReportKind, ReportTable, RevenuePeriod, RevenueStats } from './types';

export const analyticsApi = {
  overview: () => api.get<Overview>('/dashboard/overview').then((r) => r.data),
  revenue: (period: RevenuePeriod, factoryId?: number | '') =>
    api.get<RevenueStats>('/dashboard/revenue', { params: cleanParams({ period, factory_id: factoryId }) }).then((r) => r.data),
  settings: (factoryId?: number | '') => api.get<FactorySettings>('/settings/factory', { params: cleanParams({ factory_id: factoryId }) }).then((r) => r.data),
  updateSettings: (data: Partial<Omit<FactorySettings, 'factory_id'>>, factoryId?: number | '') =>
    api.put<FactorySettings>('/settings/factory', data, { params: cleanParams({ factory_id: factoryId }) }).then((r) => r.data),
  orderCosting: (orderId: number) => api.get<OrderCosting>(`/orders/${orderId}/costing`).then((r) => r.data),
  reports: () => api.get<ReportInfo[]>('/reports').then((r) => r.data),
  report: (kind: ReportKind, dateFrom?: string, dateTo?: string) =>
    api.get<ReportTable>(`/reports/${kind}`, { params: cleanParams({ date_from: dateFrom, date_to: dateTo }) }).then((r) => r.data),
  notifications: () => api.get<NotificationList>('/notifications').then((r) => r.data),
  markRead: (keys: string[]) => api.post<NotificationList>('/notifications/read', { keys }).then((r) => r.data),
  markAllRead: () => api.post<NotificationList>('/notifications/read-all').then((r) => r.data),
};

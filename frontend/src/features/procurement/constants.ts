import type { PurchaseStatus } from './types';
import { formatDate as formatDay } from '@/shared/utils/dates';
import { tr } from '@/i18n';

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatus, string> = {
  DRAFT: tr("Qoralama"),
  ORDERED: tr("Yuborildi"),
  PARTIAL: tr("Qisman keldi"),
  RECEIVED: tr("Qabul qilindi"),
  CLOSED: tr("Yopildi"),
  CANCELLED: tr("Bekor qilindi"),
};

export const PURCHASE_STATUS_COLORS: Record<PurchaseStatus, 'default' | 'info' | 'warning' | 'success' | 'error' | 'secondary'> = {
  DRAFT: 'default',
  ORDERED: 'info',
  PARTIAL: 'warning',
  RECEIVED: 'success',
  CLOSED: 'secondary',
  CANCELLED: 'error',
};

export const formatDate = (value: string | null | undefined) => (value ? formatDay(value) : '—');

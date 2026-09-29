import type { OrderStatus } from './types';
import { tr } from '@/i18n';

export const ORDER_STATUSES: OrderStatus[] = ['NEW', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: tr("Yangi"),
  CONFIRMED: tr("Tasdiqlangan"),
  IN_PRODUCTION: tr("Ishlab chiqarilmoqda"),
  READY: tr("Tayyor"),
  SHIPPED: tr("Jo'natilgan"),
  COMPLETED: tr("Yakunlangan"),
  CANCELLED: tr("Bekor qilingan"),
};

export const ORDER_STATUS_COLORS: Record<OrderStatus, 'error' | 'info' | 'warning' | 'secondary' | 'primary' | 'success' | 'default'> = {
  NEW: 'error',
  CONFIRMED: 'info',
  IN_PRODUCTION: 'warning',
  READY: 'secondary',
  SHIPPED: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'default',
};

/** Odatiy ish oqimidagi keyingi qadam (asosiy tugma uchun) */
export const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus; action: string }>> = {
  NEW: { status: 'CONFIRMED', action: tr("Buyurtmani tasdiqlash") },
  CONFIRMED: { status: 'IN_PRODUCTION', action: tr("Ishlab chiqarishga berish") },
  IN_PRODUCTION: { status: 'READY', action: tr("Tayyor deb belgilash") },
  READY: { status: 'SHIPPED', action: tr("Jo'natildi") },
  SHIPPED: { status: 'COMPLETED', action: tr("Yakunlash") },
};

export const isFinalStatus = (s: OrderStatus) => s === 'COMPLETED' || s === 'CANCELLED';

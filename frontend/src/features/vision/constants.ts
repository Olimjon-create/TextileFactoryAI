import type { DeviceKind, EventStatus, EventType, RuleAction } from './types';
import { tr } from '@/i18n';

export const DEVICE_KIND_LABELS: Record<DeviceKind, string> = {
  CAMERA: tr("Kamera (AI)"),
  EDGE: tr("AI hisoblash qutisi"),
  SCANNER: tr("Skaner"),
  SENSOR: tr("Mashina sensori"),
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  COUNT: tr("Sanoq"),
  DEFECT: tr("Brak"),
  MACHINE_STATE: tr("Mashina holati"),
  CUSTOM: tr("Boshqa kuzatuv"),
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  PENDING: tr("Tasdiqlash kutilmoqda"),
  APPLIED: tr("Qo'llandi"),
  REJECTED: tr("Rad etildi"),
  STORED: tr("Saqlandi"),
};

export const EVENT_STATUS_COLORS: Record<EventStatus, 'warning' | 'success' | 'error' | 'default'> = {
  PENDING: 'warning',
  APPLIED: 'success',
  REJECTED: 'error',
  STORED: 'default',
};

export const RULE_ACTION_LABELS: Record<RuleAction, string> = {
  AUTO_APPLY: tr("Avtomatik qo'llash"),
  REVIEW: tr("Odam tasdiqlaydi"),
  STORE_ONLY: tr("Faqat saqlash"),
};

export const RULE_ACTION_HINTS: Record<RuleAction, string> = {
  AUTO_APPLY: tr("Ishonch chegaradan yuqori bo'lsa darhol ishlab chiqarish yozuvi / mashina holati bo'ladi"),
  REVIEW: tr("Har bir hodisa «Tasdiqlash kutilmoqda» navbatiga tushadi"),
  STORE_ONLY: tr("Tizimga ta'sir qilmaydi — tahlil va modelni o'qitish uchun saqlanadi"),
};

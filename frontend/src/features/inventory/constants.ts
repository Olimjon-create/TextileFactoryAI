import type { MovementInput, MovementType, StockState } from './types';
import { tr } from '@/i18n';

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  RECEIPT: tr("Kirim"),
  ISSUE: tr("Ishlab chiqarishga"),
  RETURN: tr("Qaytarildi"),
  WRITE_OFF: tr("Hisobdan chiqarildi"),
  ADJUSTMENT: tr("Inventarizatsiya"),
  TRANSFER_OUT: tr("Ko'chirildi (chiqdi)"),
  TRANSFER_IN: tr("Ko'chirildi (keldi)"),
};

export const MOVEMENT_TYPE_COLORS: Record<MovementType, 'success' | 'warning' | 'info' | 'error' | 'default' | 'secondary'> = {
  RECEIPT: 'success',
  ISSUE: 'warning',
  RETURN: 'info',
  WRITE_OFF: 'error',
  ADJUSTMENT: 'secondary',
  TRANSFER_OUT: 'default',
  TRANSFER_IN: 'default',
};

export const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[];

export const MOVEMENT_INPUTS: { value: MovementInput; label: string; hint: string }[] = [
  { value: 'RECEIPT', label: tr("Kirim"), hint: tr("Yetkazib beruvchidan yoki xariddan kelgan material") },
  { value: 'ISSUE', label: tr("Ishlab chiqarishga berish"), hint: tr("Kesish/tikuv sexiga chiqarilgan material") },
  { value: 'RETURN', label: tr("Qaytarish"), hint: tr("Sexdan ortib qaytgan material") },
  { value: 'TRANSFER', label: tr("Ko'chirish"), hint: tr("Bir ombor joyidan boshqasiga") },
  { value: 'WRITE_OFF', label: tr("Hisobdan chiqarish"), hint: tr("Brak, shikastlangan yoki yo'qolgan material") },
  { value: 'ADJUSTMENT', label: tr("Inventarizatsiya"), hint: tr("Sanoq natijasini kiriting — farq avtomatik hisoblanadi") },
];

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  low: tr("Kam qolgan"),
  out: tr("Tugagan"),
  in: tr("Mavjud"),
};

export const formatQty = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 }).format(value);

export const formatSignedQty = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatQty(Math.abs(value))}`;

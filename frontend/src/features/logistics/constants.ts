import type { FgMovementInput, ProductMovementType, ShipmentStatus } from './types';
import { tr } from '@/i18n';

export const FG_MOVEMENT_LABELS: Record<ProductMovementType, string> = {
  PRODUCTION: tr("Ishlab chiqarishdan"),
  SHIPMENT: tr("Jo'natildi"),
  RETURN: tr("Mijozdan qaytdi"),
  WRITE_OFF: tr("Hisobdan chiqarildi"),
  ADJUSTMENT: tr("Inventarizatsiya"),
  RECEIPT: tr("Kirim"),
  TRANSFER_OUT: tr("Ko'chirildi (chiqdi)"),
  TRANSFER_IN: tr("Ko'chirildi (keldi)"),
};

export const FG_MOVEMENT_COLORS: Record<ProductMovementType, 'success' | 'warning' | 'info' | 'error' | 'secondary'> = {
  PRODUCTION: 'success',
  SHIPMENT: 'warning',
  RETURN: 'info',
  WRITE_OFF: 'error',
  ADJUSTMENT: 'secondary',
  RECEIPT: 'success',
  TRANSFER_OUT: 'secondary',
  TRANSFER_IN: 'secondary',
};

export const FG_MOVEMENT_INPUTS: { value: FgMovementInput; label: string; hint: string }[] = [
  { value: 'RECEIPT', label: tr("Kirim"), hint: tr("Tashqaridan kelgan mahsulot yoki boshlang'ich qoldiq omborga kiradi") },
  { value: 'TRANSFER', label: tr("Ko'chirish"), hint: tr("Mahsulot bir ombor joyidan boshqasiga o'tadi — umumiy qoldiq o'zgarmaydi") },
  { value: 'RETURN', label: tr("Mijozdan qaytdi"), hint: tr("Qaytarilgan tayyor mahsulot omborga kiradi") },
  { value: 'WRITE_OFF', label: tr("Hisobdan chiqarish"), hint: tr("Shikastlangan yoki yo'qolgan mahsulot") },
  { value: 'ADJUSTMENT', label: tr("Inventarizatsiya"), hint: tr("Sanoq natijasini kiriting — farq avtomatik hisoblanadi") },
];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PREPARING: tr("Tayyorlanmoqda"),
  SHIPPED: tr("Yo'lda"),
  DELIVERED: tr("Yetkazildi"),
  CANCELLED: tr("Bekor qilindi"),
};

export const SHIPMENT_STATUS_COLORS: Record<ShipmentStatus, 'default' | 'info' | 'success' | 'error'> = {
  PREPARING: 'default',
  SHIPPED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'error',
};

export const variantLabel = (size: string | null, color: string | null) => [size, color].filter(Boolean).join(' · ');

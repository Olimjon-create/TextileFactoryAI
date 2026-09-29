import type { Department, EmployeeStatus, MachineStatus, MachineType, MaintenanceKind, PayType, ProductionStage } from './types';
import { tr } from '@/i18n';

export const STAGE_LABELS: Record<ProductionStage, string> = {
  CUTTING: tr("Kesish (bichish)"),
  SEWING: tr("Tikuv"),
  FINISHING: tr("Pardoz"),
  QUALITY_CONTROL: tr("Sifat nazorati"),
  PACKING: tr("Qadoqlash"),
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  ...STAGE_LABELS,
  WAREHOUSE: tr("Ombor"),
  MAINTENANCE: tr("Mexaniklar"),
  ADMINISTRATION: tr("Ma'muriyat"),
  OTHER: tr("Boshqa"),
};

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  MONTHLY: tr("Oylik"),
  HOURLY: tr("Soatbay"),
  PIECE: tr("Ishbay (donabay)"),
};

export const PAY_RATE_UNIT: Record<PayType, string> = {
  MONTHLY: tr("so'm / oy"),
  HOURLY: tr("so'm / soat"),
  PIECE: tr("so'm / dona"),
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: tr("Ishlayapti"),
  ON_LEAVE: tr("Ta'tilda"),
  TERMINATED: tr("Bo'shagan"),
};

export const EMPLOYEE_STATUS_COLORS: Record<EmployeeStatus, 'success' | 'warning' | 'default'> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  TERMINATED: 'default',
};

export const MACHINE_TYPE_LABELS: Record<MachineType, string> = {
  CUTTING: tr("Bichish mashinasi"),
  SPREADING: tr("Mato yoyish"),
  LOCKSTITCH: tr("To'g'ri chok (universal)"),
  OVERLOCK: tr("Overlok"),
  COVERSTITCH: tr("Rasposhivalka"),
  BUTTONHOLE: tr("Ilgak (petlya)"),
  BUTTON_ATTACH: tr("Tugma qadash"),
  BARTACK: tr("Zakrepka"),
  EMBROIDERY: tr("Kashta"),
  PRINTING: tr("Bosma"),
  PRESS: tr("Dazmol / press"),
  KNITTING: tr("To'quv"),
  OTHER: tr("Boshqa"),
};

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  WORKING: tr("Ishlayapti"),
  IDLE: tr("Bo'sh turibdi"),
  BROKEN: tr("Buzilgan"),
  MAINTENANCE: tr("Texnik xizmatda"),
};

export const MACHINE_STATUS_COLORS: Record<MachineStatus, 'success' | 'default' | 'error' | 'warning'> = {
  WORKING: 'success',
  IDLE: 'default',
  BROKEN: 'error',
  MAINTENANCE: 'warning',
};

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  PREVENTIVE: tr("Rejali texnik xizmat"),
  REPAIR: tr("Ta'mirlash"),
};

export const keys = <T extends string>(r: Record<T, unknown>) => Object.keys(r) as T[];

export function formatDuration(minutes: number): string {
  if (minutes < 60) return tr("{0} daq", minutes);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  return [days && tr("{0} kun", days), hours && tr("{0} soat", hours), !days && mins && tr("{0} daq", mins)].filter(Boolean).join(' ');
}

export const hhmm = (t: string) => t.slice(0, 5);

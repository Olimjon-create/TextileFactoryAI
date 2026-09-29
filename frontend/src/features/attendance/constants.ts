import type { AttendanceStatus, DayState, LeaveStatus, LeaveType } from './types';
import { tr } from '@/i18n';

type ChipColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

export const DAY_STATE_LABELS: Record<DayState, string> = {
  PRESENT: tr("Keldi"),
  LATE: tr("Kechikdi"),
  ABSENT: tr("Kelmadi"),
  LEAVE: tr("Javobda"),
  SICK: tr("Kasal"),
  VACATION: tr("Ta'tilda"),
  NOT_MARKED: tr("Belgilanmagan"),
};

export const DAY_STATE_COLORS: Record<DayState, ChipColor> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'error',
  LEAVE: 'info',
  SICK: 'secondary',
  VACATION: 'info',
  NOT_MARKED: 'default',
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: tr("Keldi"),
  ABSENT: tr("Kelmadi (sababsiz)"),
  LEAVE: tr("Javob berilgan"),
  SICK: tr("Kasal"),
  VACATION: tr("Ta'til"),
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  PERSONAL: tr("Shaxsiy ish"),
  FAMILY: tr("Oilaviy sabab"),
  SICK: tr("Kasallik"),
  VACATION: tr("Ta'til"),
  OTHER: tr("Boshqa"),
};

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: tr("Kutilmoqda"),
  APPROVED: tr("Javob berildi"),
  REJECTED: tr("Rad etildi"),
};

export const LEAVE_STATUS_COLORS: Record<LeaveStatus, ChipColor> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'default',
};

export const keys = <T extends string>(o: Record<T, unknown>) => Object.keys(o) as T[];

export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '—');

export function duration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? tr("{0} s {1} d", h, String(m).padStart(2, '0')) : tr("{0} daq", m);
}

export function isoDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

const WEEKDAYS = [tr("Yakshanba"), tr("Dushanba"), tr("Seshanba"), tr("Chorshanba"), tr("Payshanba"), tr("Juma"), tr("Shanba")];
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS[dt.getDay()]}, ${d}-${MONTHS[m - 1]}`;
}

export const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1][0].toUpperCase()}${MONTHS[m - 1].slice(1)} ${y}`;
}

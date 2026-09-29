import type { CustomerStatus, CustomerType } from './types';
import { tr } from '@/i18n';

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: tr("Faol"),
  LEAD: tr("Potensial"),
  INACTIVE: tr("Nofaol"),
};

export const CUSTOMER_STATUS_COLORS: Record<CustomerStatus, 'success' | 'info' | 'default'> = {
  ACTIVE: 'success',
  LEAD: 'info',
  INACTIVE: 'default',
};

export const CUSTOMER_STATUS_HINTS: Record<CustomerStatus, string> = {
  ACTIVE: tr("Hozir ishlayotgan mijoz"),
  LEAD: tr("Muzokara bosqichidagi, hali buyurtma bermagan mijoz"),
  INACTIVE: tr("Hamkorlik to'xtatilgan"),
};

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  COMPANY: tr("Kompaniya"),
  INDIVIDUAL: tr("Jismoniy shaxs"),
};

export const CUSTOMER_STATUSES: CustomerStatus[] = ['ACTIVE', 'LEAD', 'INACTIVE'];
export const CUSTOMER_TYPES: CustomerType[] = ['COMPANY', 'INDIVIDUAL'];

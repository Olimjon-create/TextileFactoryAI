import type { FactoryBrief } from '@/shared/types';

export type CustomerType = 'COMPANY' | 'INDIVIDUAL';
export type CustomerStatus = 'LEAD' | 'ACTIVE' | 'INACTIVE';

export interface Customer {
  id: number;
  factory_id: number;
  factory: FactoryBrief | null;
  customer_code: string;
  name: string;
  customer_type: CustomerType;
  status: CustomerStatus;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerPage {
  items: Customer[];
  total: number;
}

export interface CustomerStats {
  total: number;
  by_status: Record<CustomerStatus, number>;
}

export interface CustomerPayload {
  name: string;
  customer_code: string | null;
  customer_type: CustomerType;
  status: CustomerStatus;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  address: string | null;
  notes: string | null;
  factory_id?: number;
}

export interface CustomerFilters {
  search?: string;
  status?: CustomerStatus | '';
  customer_type?: CustomerType | '';
  country?: string;
  factory_id?: number | '';
  offset?: number;
  limit?: number;
}

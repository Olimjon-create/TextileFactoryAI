import type { Movement } from '@/features/inventory/types';
import type { MaterialType, MaterialUnit } from '@/features/products/types';

export type PurchaseStatus = 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';

export interface Ref {
  id: number;
  code: string | null;
  name: string;
}

export interface Supplier {
  id: number;
  factory_id: number;
  code: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  address: string | null;
  tax_id: string | null;
  payment_terms_days: number | null;
  lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  open_orders: number;
  received_value: number;
}

export interface SupplierStats {
  orders_total: number;
  open_orders: number;
  overdue_orders: number;
  received_value: number;
  open_value: number;
  on_time_pct: number | null;
  avg_lead_days: number | null;
}

export interface SupplierDetail extends Supplier {
  stats: SupplierStats;
}

export interface SupplierPage {
  items: Supplier[];
  total: number;
}

export interface SupplierPayload {
  name: string;
  code?: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  address: string | null;
  tax_id: string | null;
  payment_terms_days: number | null;
  lead_time_days: number | null;
  notes: string | null;
  factory_id?: number;
  is_active?: boolean;
}

export interface PurchaseLine {
  id: number;
  material: Ref;
  material_type: MaterialType;
  unit: MaterialUnit;
  quantity: number;
  unit_price: number;
  amount: number;
  received: number;
  remaining: number;
  note: string | null;
}

export interface PurchaseOrder {
  id: number;
  factory_id: number;
  number: string;
  supplier: Ref;
  status: PurchaseStatus;
  order_date: string;
  expected_date: string | null;
  order_id: number | null;
  order_number: string | null;
  currency: string;
  notes: string | null;
  ordered_at: string | null;
  closed_at: string | null;
  created_at: string;
  created_by_name: string | null;
  items_count: number;
  total_amount: number;
  received_amount: number;
  received_pct: number;
  is_overdue: boolean;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  lines: PurchaseLine[];
  receipts: Movement[];
}

export interface PurchaseOrderPage {
  items: PurchaseOrder[];
  total: number;
}

export interface PurchaseLinePayload {
  material_id: number;
  quantity: number;
  unit_price: number;
  note?: string | null;
}

export interface PurchaseOrderPayload {
  supplier_id: number;
  order_date?: string | null;
  expected_date: string | null;
  order_id?: number | null;
  currency?: string;
  notes: string | null;
  items: PurchaseLinePayload[];
}

export interface PurchaseFilters {
  status?: PurchaseStatus | '';
  supplier_id?: number | '';
  order_id?: number | '';
  overdue?: boolean;
  open_only?: boolean;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface ReceivePayload {
  location_id: number;
  lines: { item_id: number; quantity: number }[];
  document_no: string | null;
  note: string | null;
}

export interface ProcurementSummary {
  suppliers_count: number;
  open_orders: number;
  overdue_orders: number;
  drafts: number;
  open_value: number;
  expected_7d: number;
}

export interface PurchasePrefill {
  order_id?: number | null;
  order_number?: string | null;
  lines: { material_id: number; quantity: number }[];
}

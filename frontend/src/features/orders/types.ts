import type { MaterialType, MaterialUnit } from '@/features/products/types';
import type { FactoryBrief } from '@/shared/types';

/** STORE — mijoz katalogdan bergan; MANUAL — menejer CRM'dagi mijoz uchun kiritgan (B2B) */
export type OrderSource = 'STORE' | 'MANUAL';

export type OrderStatus =
  | 'NEW'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'READY'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderItem {
  id: number;
  product_id: number | null;
  product_name: string;
  product_code: string;
  size: string | null;
  color: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface OrderListItem {
  id: number;
  order_number: string | null;
  factory_id: number;
  factory: FactoryBrief | null;
  customer_id: number | null;
  customer_name: string;
  customer_phone: string;
  status: OrderStatus;
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  total_amount: number;
  currency: string;
  items_count: number;
  total_quantity: number;
  source: OrderSource;
  due_date: string | null;
  /** Muddati o'tgan, hali jo'natilmagan */
  is_overdue: boolean;
  created_at: string;
  paid_at: string | null;
}

export interface Order extends OrderListItem {
  customer: { id: number; name: string; customer_code: string } | null;
  delivery_address: string | null;
  comment: string | null;
  payment_provider: string;
  payment_reference: string | null;
  card_last4: string | null;
  items: OrderItem[];
  updated_at: string;
}

export interface OrderPage {
  items: OrderListItem[];
  total: number;
}

export interface OrderSummary {
  new_count: number;
  by_status: Record<OrderStatus, number>;
}

export interface ManualOrderLine {
  product_id: number;
  quantity: number;
  size: string | null;
  color: string | null;
  unit_price: number | null;
}

export interface ManualOrderPayload {
  customer_id: number;
  items: ManualOrderLine[];
  due_date: string | null;
  delivery_address: string | null;
  comment: string | null;
}

export interface OrderUpdatePayload {
  due_date?: string | null;
  delivery_address?: string | null;
  comment?: string | null;
}

// ---------- material ehtiyoji ----------

export type RequirementStatus = 'NOT_LINKED' | 'SHORTAGE' | 'ENOUGH' | 'ISSUED' | 'OVERUSED';

export interface MaterialRequirement {
  material_id: number | null;
  material_code: string | null;
  material_name: string;
  material_type: MaterialType;
  unit: MaterialUnit;
  planned: number;
  issued: number;
  remaining: number;
  available: number;
  shortage: number;
  /** Yuborilgan xarid buyurtmalarida kelishi kutilayotgan (barcha buyurtmalar uchun) */
  on_order: number;
  variance: number;
  variance_pct: number | null;
  unit_cost: number | null;
  planned_cost: number | null;
  issued_cost: number | null;
  status: RequirementStatus;
  products: string[];
}

export interface OrderMaterials {
  order_id: number;
  lines: MaterialRequirement[];
  products_without_bom: string[];
  shortage_count: number;
  not_linked_count: number;
  overused_count: number;
  planned_cost: number;
  issued_cost: number;
  complete: boolean;
}

export interface IssuePayload {
  mode: 'ISSUE' | 'RETURN';
  lines: { material_id: number; quantity: number; location_id?: number | null }[];
  note?: string | null;
}

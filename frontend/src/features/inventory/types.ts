import type { MaterialType, MaterialUnit } from '@/features/products/types';

export type MovementType = 'RECEIPT' | 'ISSUE' | 'RETURN' | 'WRITE_OFF' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN';
/** Foydalanuvchi kiritadigan amal (TRANSFER — ikki yozuvga aylanadi) */
export type MovementInput = 'RECEIPT' | 'ISSUE' | 'RETURN' | 'WRITE_OFF' | 'ADJUSTMENT' | 'TRANSFER';
export type StockState = 'low' | 'out' | 'in';

export interface Material {
  id: number;
  factory_id: number;
  factory_name: string | null;
  code: string;
  name: string;
  material_type: MaterialType;
  unit: MaterialUnit;
  color: string | null;
  min_stock: number;
  unit_cost: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stock: number;
  stock_value: number | null;
  is_low: boolean;
}

export interface LocationStock {
  location_id: number;
  location_code: string;
  location_name: string;
  quantity: number;
}

export interface MaterialDetail extends Material {
  locations: LocationStock[];
  bom_usage_count: number;
}

export interface MaterialPage {
  items: Material[];
  total: number;
}

export interface MaterialFilters {
  search?: string;
  material_type?: MaterialType | '';
  stock_state?: StockState | '';
  is_active?: boolean | '';
  factory_id?: number | '';
  offset?: number;
  limit?: number;
}

export interface MaterialPayload {
  code: string;
  name: string;
  material_type: MaterialType;
  unit: MaterialUnit;
  color: string | null;
  min_stock: number;
  unit_cost: number | null;
  notes: string | null;
  factory_id?: number;
  is_active?: boolean;
}

export interface WarehouseLocation {
  id: number;
  factory_id: number;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
  materials_count: number;
}

export interface Ref {
  id: number;
  code: string;
  name: string;
}

export interface Movement {
  id: number;
  factory_id: number;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number | null;
  material: Ref;
  material_unit: MaterialUnit;
  location: Ref;
  order_id: number | null;
  order_number: string | null;
  document_no: string | null;
  note: string | null;
  transfer_group: string | null;
  purchase_item_id?: number | null;
  created_by_name: string | null;
  created_at: string;
}

export interface MovementPage {
  items: Movement[];
  total: number;
}

export interface MovementFilters {
  material_id?: number | '';
  order_id?: number | '';
  location_id?: number | '';
  movement_type?: MovementType | '';
  search?: string;
  date_from?: string;
  date_to?: string;
  factory_id?: number | '';
  offset?: number;
  limit?: number;
}

export interface MovementPayload {
  movement_type: MovementInput;
  material_id: number;
  location_id: number;
  to_location_id?: number | null;
  quantity: number;
  unit_cost?: number | null;
  document_no?: string | null;
  note?: string | null;
}

export interface InventorySummary {
  materials_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  stock_value: number;
  locations_count: number;
  movements_today: number;
  receipts_30d: number;
  issues_30d: number;
}

import type { FactoryBrief } from '@/shared/types';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type ProductionUnit = 'PIECE' | 'PAIR' | 'SET' | 'DOZEN';
export type MaterialType =
  | 'FABRIC'
  | 'THREAD'
  | 'BUTTON'
  | 'ZIPPER'
  | 'LABEL'
  | 'ELASTIC'
  | 'INTERLINING'
  | 'PACKAGING'
  | 'ACCESSORY'
  | 'OTHER';
export type MaterialUnit =
  | 'METER'
  | 'CENTIMETER'
  | 'SQUARE_METER'
  | 'KILOGRAM'
  | 'GRAM'
  | 'PIECE'
  | 'PAIR'
  | 'SPOOL';

export interface BOMItem {
  id: number;
  product_id: number;
  /** Ombor katalogidagi material (bog'langan bo'lsa) */
  material_id: number | null;
  material_code: string | null;
  material_type: MaterialType;
  material_name: string;
  quantity: number;
  unit: MaterialUnit;
  waste_percent: number;
  notes: string | null;
  created_at: string;
}

export interface ProductListItem {
  id: number;
  factory_id: number;
  factory: FactoryBrief | null;
  name: string;
  code: string;
  category: string;
  description: string | null;
  sizes: string[];
  colors: string[];
  unit: ProductionUnit;
  status: ProductStatus;
  price: number | null;
  image_url: string | null;
  model_image_url: string | null;
  bom_items_count: number;
  created_at: string;
  updated_at: string;
}

export interface Product extends ProductListItem {
  bom_items: BOMItem[];
}

export interface ProductPayload {
  name: string;
  code: string;
  category: string;
  description: string | null;
  sizes: string[];
  colors: string[];
  unit: ProductionUnit;
  status: ProductStatus;
  price: number | null;
  image_url: string | null;
  model_image_url: string | null;
  factory_id?: number;
}

export interface BOMItemPayload {
  material_id?: number | null;
  material_type: MaterialType;
  material_name: string;
  quantity: number;
  unit: MaterialUnit;
  waste_percent: number;
  notes: string | null;
}

export interface ProductFilters {
  search?: string;
  category?: string;
  status?: ProductStatus | '';
  factory_id?: number | '';
}

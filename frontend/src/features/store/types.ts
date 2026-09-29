import type { ProductionUnit } from '@/features/products/types';

export interface StoreFactoryCard {
  id: number;
  name: string;
  city: string | null;
  short_description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  product_count: number;
  categories: string[];
  min_price: number | null;
}

/** Bosh sahifa kollaji: surat bosilganda shu zavod va mahsulotga o'tiladi */
export interface StoreFeaturedProduct {
  product_id: number;
  product_name: string;
  factory_id: number;
  factory_name: string;
  image_url: string;
  price: number;
}

export interface StoreProduct {
  id: number;
  name: string;
  code: string;
  category: string;
  description: string | null;
  sizes: string[];
  colors: string[];
  unit: ProductionUnit;
  price: number;
  image_url: string | null;
  model_image_url: string | null;
}

export interface StoreFactoryDetail {
  id: number;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  short_description: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  products: StoreProduct[];
}

export interface CheckoutPayload {
  factory_id: number;
  items: { product_id: number; quantity: number; size: string | null; color: string | null }[];
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  comment: string | null;
}

export interface PublicOrder {
  order_number: string | null;
  public_token: string;
  factory_id: number;
  factory_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  status: 'PENDING_PAYMENT' | 'NEW' | 'CONFIRMED' | 'IN_PRODUCTION' | 'READY' | 'SHIPPED' | 'COMPLETED' | 'CANCELLED';
  payment_status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  card_last4: string | null;
  total_amount: number;
  currency: string;
  items: {
    product_name: string;
    product_code: string;
    size: string | null;
    color: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
  }[];
  created_at: string;
  paid_at: string | null;
}

export interface CheckoutResponse {
  order: PublicOrder;
  payment: { provider: string; test_mode: boolean; checkout_url: string | null };
}

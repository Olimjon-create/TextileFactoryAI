export type ProductMovementType = 'PRODUCTION' | 'SHIPMENT' | 'RETURN' | 'WRITE_OFF' | 'ADJUSTMENT' | 'RECEIPT' | 'TRANSFER_OUT' | 'TRANSFER_IN';
export type FgMovementInput = 'RECEIPT' | 'RETURN' | 'WRITE_OFF' | 'ADJUSTMENT' | 'TRANSFER';
export type ShipmentStatus = 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

export interface Ref {
  id: number;
  code: string | null;
  name: string;
}

export interface StockRow {
  product: Ref;
  size: string | null;
  color: string | null;
  quantity: number;
  locations: { location: Ref; quantity: number }[];
  unit_price: number | null;
  value: number | null;
}

export interface StockPage {
  items: StockRow[];
  total: number;
}

export interface FgMovement {
  id: number;
  movement_type: ProductMovementType;
  quantity: number;
  product: Ref;
  size: string | null;
  color: string | null;
  location: Ref;
  work_order_id: number | null;
  work_order_number: string | null;
  shipment_id: number | null;
  shipment_number: string | null;
  order_id: number | null;
  order_number: string | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface FgMovementPage {
  items: FgMovement[];
  total: number;
}

export interface FgMovementPayload {
  movement_type: FgMovementInput;
  product_id: number;
  size: string | null;
  color: string | null;
  location_id: number;
  to_location_id?: number | null;
  quantity: number;
  order_id?: number | null;
  note: string | null;
}

export interface WorkOrderStock {
  work_order_id: number;
  packed: number;
  received: number;
  remaining: number;
}

export interface FgSummary {
  skus: number;
  units: number;
  value: number;
  received_30d: number;
  shipped_30d: number;
  shipments_preparing: number;
  shipments_in_transit: number;
  shipments_late: number;
}

export interface Shipment {
  id: number;
  factory_id: number;
  number: string;
  order_id: number;
  order_number: string | null;
  customer_name: string;
  customer_phone: string;
  status: ShipmentStatus;
  planned_date: string | null;
  delivery_address: string | null;
  carrier: string | null;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  tracking_no: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  received_by: string | null;
  notes: string | null;
  created_at: string;
  created_by_name: string | null;
  items_count: number;
  total_quantity: number;
  is_late: boolean;
}

export interface ShipmentLine {
  id: number;
  order_item_id: number;
  product_id: number | null;
  product_name: string;
  product_code: string;
  size: string | null;
  color: string | null;
  quantity: number;
  in_stock: number;
}

export interface ShipmentDetail extends Shipment {
  lines: ShipmentLine[];
}

export interface ShipmentPage {
  items: Shipment[];
  total: number;
}

export interface TransportFields {
  planned_date: string | null;
  delivery_address: string | null;
  carrier: string | null;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  tracking_no: string | null;
  notes: string | null;
}

export interface ShipmentPayload extends TransportFields {
  order_id: number;
  items: { order_item_id: number; quantity: number }[];
}

export interface OrderShippingLine {
  order_item_id: number;
  product_id: number | null;
  product_name: string;
  product_code: string;
  size: string | null;
  color: string | null;
  ordered: number;
  shipped: number;
  preparing: number;
  remaining: number;
  in_stock: number;
}

export interface OrderShipping {
  order_id: number;
  order_status: string;
  lines: OrderShippingLine[];
  shipments: Shipment[];
  fully_shipped: boolean;
}

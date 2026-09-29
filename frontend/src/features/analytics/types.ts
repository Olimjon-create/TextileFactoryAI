import type { InventorySummary } from '@/features/inventory/types';
import type { FgSummary } from '@/features/logistics/types';
import type { ProcurementSummary } from '@/features/procurement/types';
import type { ProductionSummary } from '@/features/production/types';
import type { ResourcesSummary } from '@/features/resources/types';

export interface FactorySettings {
  factory_id: number;
  overhead_percent: number;
  monthly_work_hours: number;
  defect_alert_percent: number;
  low_margin_percent: number;
}

export interface CostLine {
  material_id: number;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  cost: number;
  unpriced: boolean;
}

export interface LaborLine {
  employee_id: number | null;
  name: string;
  pay_type: string | null;
  good: number;
  minutes: number;
  cost: number;
  unpriced_logs: number;
}

export interface OrderCosting {
  order_id: number;
  order_number: string | null;
  currency: string;
  revenue: number;
  ordered_qty: number;
  produced_qty: number;
  material_planned: number;
  material_actual: number;
  labor: number;
  overhead_percent: number;
  overhead: number;
  total_cost: number;
  cost_per_unit: number | null;
  margin: number;
  margin_pct: number | null;
  low_margin: boolean;
  materials: CostLine[];
  labor_lines: LaborLine[];
  warnings: string[];
}

export interface DayPoint {
  day: string;
  value: number;
  extra: number;
}

export interface Overview {
  sales: {
    by_status: Record<string, number>;
    open_orders: number;
    overdue: number;
    due_7d: number;
    revenue_30d: number;
    orders_30d: number;
    revenue_by_day: DayPoint[];
  } | null;
  production: { summary: ProductionSummary; packed_by_day: DayPoint[]; top_defects: { reason: string; quantity: number }[] } | null;
  inventory: InventorySummary | null;
  finished_goods: FgSummary | null;
  procurement: ProcurementSummary | null;
  resources: ResourcesSummary | null;
  material_issued_30d: number | null;
}

export type ReportKind = 'production' | 'defects' | 'employees' | 'sales' | 'costing' | 'inventory' | 'suppliers';

export interface ReportInfo {
  kind: ReportKind;
  title: string;
  description: string;
  uses_dates: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'money' | 'percent' | 'date';
}

export interface ReportTable {
  kind: ReportKind;
  title: string;
  date_from: string | null;
  date_to: string | null;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, string | number | null> | null;
}

export interface AppNotification {
  key: string;
  type: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  path: string;
  at: string | null;
  read: boolean;
}

export interface NotificationList {
  items: AppNotification[];
  unread: number;
}

export type RevenuePeriod = 'day' | 'week' | 'month' | 'year';

export interface RevenueBucket {
  start: string;
  end: string;
  label: string;
  full_label: string;
  revenue: number;
  orders: number;
  current: boolean;
}

export interface RevenueStats {
  period: RevenuePeriod;
  date_from: string;
  date_to: string;
  buckets: RevenueBucket[];
  total: number;
  orders: number;
  average_order: number;
  prev_total: number;
  prev_orders: number;
  change_pct: number | null;
  best: RevenueBucket | null;
  quick: { today: number; week: number; month: number; year: number };
  by_factory: { factory_id: number; name: string; revenue: number; orders: number }[];
}

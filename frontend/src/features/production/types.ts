import type { Department, ProductionStage } from '@/features/resources/types';

export type WorkOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type LogSource = 'MANUAL' | 'SCANNER' | 'CAMERA';
export type UnitKind = 'BUNDLE' | 'BOX';

export interface Ref {
  id: number;
  code: string | null;
  name: string;
}

export interface StageProgress {
  stage: ProductionStage;
  good: number;
  defect: number;
  available: number;
  remaining: number;
  defect_rate: number | null;
}

export interface WorkOrder {
  id: number;
  factory_id: number;
  number: string;
  order_id: number | null;
  order_number: string | null;
  customer_name: string | null;
  product_id: number | null;
  product_name: string;
  product_code: string;
  size: string | null;
  color: string | null;
  quantity: number;
  overcut_pct: number;
  status: WorkOrderStatus;
  line: Ref | null;
  planned_start: string | null;
  planned_end: string | null;
  priority: number;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  progress: StageProgress[];
  current_stage: ProductionStage | null;
  finished: number;
  percent: number;
  is_late: boolean;
}

export interface ProductionLog {
  id: number;
  work_order_id: number;
  work_order_number: string | null;
  stage: ProductionStage;
  work_date: string;
  quantity_good: number;
  quantity_defect: number;
  defect_reason: string | null;
  fabric_used: number | null;
  fabric_waste: number | null;
  duration_minutes: number | null;
  employee: Ref | null;
  machine: Ref | null;
  line: Ref | null;
  shift: Ref | null;
  unit_code: string | null;
  source: LogSource;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface TrackingUnit {
  id: number;
  work_order_id: number;
  work_order_number: string;
  kind: UnitKind;
  code: string;
  quantity: number;
  size: string | null;
  color: string | null;
  product_name: string;
  note: string | null;
  created_at: string;
  stages_done: ProductionStage[];
}

export interface FabricUsage {
  planned: number | null;
  used: number;
  waste: number;
  waste_pct: number | null;
  per_piece: number | null;
  per_piece_planned: number | null;
}

export interface WorkOrderDetail extends WorkOrder {
  logs: ProductionLog[];
  units: TrackingUnit[];
  fabric: FabricUsage;
}

export interface WorkOrderPayload {
  product_id: number;
  quantity: number;
  size?: string | null;
  color?: string | null;
  line_id?: number | null;
  planned_start?: string | null;
  planned_end?: string | null;
  priority?: number;
  overcut_pct?: number;
  notes?: string | null;
}

export interface WorkOrderFilters {
  search?: string;
  status?: WorkOrderStatus | '';
  active?: boolean | '';
  late?: boolean | '';
  line_id?: number | '';
  order_id?: number | '';
  offset?: number;
  limit?: number;
}

export interface LogPayload {
  stage: ProductionStage;
  quantity_good: number;
  quantity_defect: number;
  defect_reason?: string | null;
  fabric_used?: number | null;
  fabric_waste?: number | null;
  duration_minutes?: number | null;
  work_date?: string | null;
  employee_id?: number | null;
  machine_id?: number | null;
  unit_code?: string | null;
  source?: LogSource;
  note?: string | null;
}

export interface TraceResult {
  kind: 'BUNDLE' | 'BOX' | 'WORK_ORDER' | 'ORDER' | 'MATERIAL' | 'MACHINE' | 'SHIPMENT' | 'PURCHASE_ORDER';
  code: string;
  title: string;
  subtitle: string | null;
  path: string;
  work_order: WorkOrder | null;
  unit: TrackingUnit | null;
  logs: ProductionLog[];
}

export interface EmployeeKpi {
  employee: Ref;
  department: Department;
  line: Ref | null;
  days_worked: number;
  good: number;
  defect: number;
  defect_rate: number | null;
  daily_norm: number | null;
  norm_total: number | null;
  efficiency_pct: number | null;
  minutes: number;
  per_hour: number | null;
}

export interface StageOutput {
  stage: ProductionStage;
  good: number;
  defect: number;
  defect_rate: number | null;
}

export interface ProductionSummary {
  work_orders_active: number;
  work_orders_late: number;
  completed_30d: number;
  output_today: StageOutput[];
  output_7d: StageOutput[];
  fabric_used_30d: number;
  fabric_waste_30d: number;
  waste_pct_30d: number | null;
}

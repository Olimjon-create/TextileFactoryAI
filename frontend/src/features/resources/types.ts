export type ProductionStage = 'CUTTING' | 'SEWING' | 'FINISHING' | 'QUALITY_CONTROL' | 'PACKING';
export type Department = ProductionStage | 'WAREHOUSE' | 'MAINTENANCE' | 'ADMINISTRATION' | 'OTHER';
export type PayType = 'MONTHLY' | 'HOURLY' | 'PIECE';
export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type MachineType =
  | 'CUTTING'
  | 'SPREADING'
  | 'LOCKSTITCH'
  | 'OVERLOCK'
  | 'COVERSTITCH'
  | 'BUTTONHOLE'
  | 'BUTTON_ATTACH'
  | 'BARTACK'
  | 'EMBROIDERY'
  | 'PRINTING'
  | 'PRESS'
  | 'KNITTING'
  | 'OTHER';
export type MachineStatus = 'WORKING' | 'IDLE' | 'BROKEN' | 'MAINTENANCE';
export type MaintenanceKind = 'PREVENTIVE' | 'REPAIR';

export interface Brief {
  id: number;
  code: string | null;
  name: string;
}

export interface ProductionLine {
  id: number;
  factory_id: number;
  code: string;
  name: string;
  stage: ProductionStage;
  capacity_per_shift: number | null;
  is_active: boolean;
  employees_count: number;
  machines_count: number;
  machines_down: number;
}

export interface LinePayload {
  code: string;
  name: string;
  stage: ProductionStage;
  capacity_per_shift: number | null;
  is_active?: boolean;
  factory_id?: number;
}

export interface Shift {
  id: number;
  factory_id: number;
  name: string;
  start_time: string; // "08:00:00"
  end_time: string;
  break_minutes: number;
  is_active: boolean;
  work_minutes: number;
  is_night: boolean;
  employees_count: number;
}

export interface ShiftPayload {
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_active?: boolean;
  factory_id?: number;
}

export interface Employee {
  id: number;
  factory_id: number;
  employee_code: string;
  full_name: string;
  phone: string | null;
  position: string | null;
  department: Department;
  line: Brief | null;
  shift: Brief | null;
  user_id: number | null;
  user_email: string | null;
  hire_date: string | null;
  pay_type: PayType;
  /** Faqat egasi/menejer ko'radi, boshqalarga null */
  pay_rate: number | null;
  daily_norm: number | null;
  status: EmployeeStatus;
  notes: string | null;
  created_at: string;
}

export interface EmployeePayload {
  employee_code?: string | null;
  full_name: string;
  phone: string | null;
  position: string | null;
  department: Department;
  line_id: number | null;
  shift_id: number | null;
  hire_date: string | null;
  pay_type?: PayType;
  pay_rate?: number | null;
  daily_norm: number | null;
  status: EmployeeStatus;
  notes: string | null;
  factory_id?: number;
}

export interface EmployeeFilters {
  search?: string;
  department?: Department | '';
  line_id?: number | '';
  shift_id?: number | '';
  status?: EmployeeStatus | '';
  factory_id?: number | '';
  offset?: number;
  limit?: number;
}

export interface Machine {
  id: number;
  factory_id: number;
  code: string;
  name: string;
  machine_type: MachineType;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  line: Brief | null;
  status: MachineStatus;
  status_since: string;
  purchase_date: string | null;
  maintenance_interval_days: number | null;
  last_maintenance_date: string | null;
  next_maintenance_date: string | null;
  maintenance_overdue: boolean;
  maintenance_due_soon: boolean;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MachinePayload {
  code: string;
  name: string;
  machine_type: MachineType;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  line_id: number | null;
  purchase_date: string | null;
  maintenance_interval_days: number | null;
  last_maintenance_date: string | null;
  notes: string | null;
  status?: MachineStatus;
  is_active?: boolean;
  factory_id?: number;
}

export interface MachineFilters {
  search?: string;
  status?: MachineStatus | '';
  machine_type?: MachineType | '';
  line_id?: number | '';
  maintenance?: 'overdue' | 'due_soon' | '';
  is_active?: boolean | '';
  factory_id?: number | '';
  offset?: number;
  limit?: number;
}

export interface StatusPeriod {
  id: number;
  status: MachineStatus;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  reason: string | null;
  created_by_name: string | null;
}

export interface MaintenanceRecord {
  id: number;
  kind: MaintenanceKind;
  performed_at: string;
  description: string;
  parts_used: string | null;
  duration_minutes: number | null;
  cost: number | null;
  technician: Brief | null;
  technician_name: string | null;
  created_at: string;
}

export interface MachineStats {
  period_days: number;
  downtime_minutes: number;
  broken_minutes: number;
  maintenance_minutes: number;
  working_minutes: number;
  availability_pct: number;
  breakdowns: number;
  repair_cost: number;
}

export interface MachineDetail extends Machine {
  stats: MachineStats;
  history: StatusPeriod[];
  maintenance: MaintenanceRecord[];
}

export interface MaintenancePayload {
  kind: MaintenanceKind;
  description: string;
  performed_at?: string | null;
  parts_used?: string | null;
  duration_minutes?: number | null;
  cost?: number | null;
  technician_id?: number | null;
  technician_name?: string | null;
  set_status?: MachineStatus | null;
}

export interface ResourcesSummary {
  employees_active: number;
  employees_on_leave: number;
  employees_by_department: Record<string, number>;
  machines_total: number;
  machines_by_status: Record<MachineStatus, number>;
  maintenance_overdue: number;
  maintenance_due_soon: number;
  downtime_hours_30d: number;
  availability_pct_30d: number;
  lines_active: number;
}

export interface Page<T> {
  items: T[];
  total: number;
}

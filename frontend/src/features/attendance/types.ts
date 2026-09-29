import type { Department } from '@/features/resources/types';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LEAVE' | 'SICK' | 'VACATION';
export type DayState = 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | 'SICK' | 'VACATION' | 'NOT_MARKED';
export type StateFilter = DayState | 'AT_WORK';
export type LeaveType = 'PERSONAL' | 'SICK' | 'VACATION' | 'FAMILY' | 'OTHER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface EmployeeBrief {
  id: number;
  employee_code: string;
  full_name: string;
  phone: string | null;
  position: string | null;
  department: Department;
  shift_name: string | null;
  shift_start: string | null; // "08:00:00"
  shift_end: string | null;
}

export interface AttendanceRecord {
  id: number;
  work_date: string;
  status: AttendanceStatus;
  check_in: string | null;
  check_out: string | null;
  late_minutes: number;
  worked_minutes: number | null;
  note: string | null;
  leave_request_id: number | null;
}

export interface LeaveBrief {
  id: number;
  leave_type: LeaveType;
  status: LeaveStatus;
  start_time: string | null;
  end_time: string | null;
  reason: string;
}

export interface DailyRow {
  employee: EmployeeBrief;
  record: AttendanceRecord | null;
  state: DayState;
  at_work: boolean;
  leave: LeaveBrief | null;
}

export interface DailySummary {
  total: number;
  present: number;
  late: number;
  at_work: number;
  absent: number;
  on_leave: number;
  sick: number;
  not_marked: number;
  worked_minutes: number;
}

export interface DailyBoard {
  date: string;
  is_today: boolean;
  now: string | null;
  rows: DailyRow[];
  summary: DailySummary;
}

export interface DailyFilters {
  day?: string;
  search?: string;
  department?: Department | '';
  shift_id?: number | '';
  state?: StateFilter | '';
}

export interface AttendanceUpsertPayload {
  employee_id: number;
  work_date: string;
  status: AttendanceStatus;
  check_in?: string | null;
  check_out?: string | null;
  note?: string | null;
}

export interface EmployeeMonthRow {
  employee: EmployeeBrief;
  present_days: number;
  late_days: number;
  late_minutes: number;
  absent_days: number;
  leave_days: number;
  sick_days: number;
  vacation_days: number;
  worked_minutes: number;
}

export interface MonthlyReport {
  month: string;
  rows: EmployeeMonthRow[];
}

export interface LeaveRequest {
  id: number;
  employee: EmployeeBrief;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  days: number;
  reason: string;
  status: LeaveStatus;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface LeavePage {
  items: LeaveRequest[];
  total: number;
  pending: number;
}

export interface EmployeeMonthDetail {
  employee: EmployeeBrief;
  month: string;
  days: AttendanceRecord[];
  leaves: LeaveRequest[];
  totals: EmployeeMonthRow;
}

export interface LeavePayload {
  employee_id: number;
  leave_type: LeaveType;
  start_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  reason: string;
  approve?: boolean;
}

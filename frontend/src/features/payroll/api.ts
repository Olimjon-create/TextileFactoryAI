import { api } from '@/shared/api/client';
import type { Department, PayType } from '@/features/resources/types';

export type AdjustmentKind = 'BONUS' | 'DEDUCTION' | 'ADVANCE';

export interface PayrollRow {
  employee_id: number;
  factory_id: number;
  employee_code: string;
  full_name: string;
  position: string | null;
  department: Department;
  pay_type: PayType;
  pay_rate: number | null;
  pieces: number;
  hours: number;
  present_days: number;
  absent_days: number;
  base: number;
  bonus: number;
  deduction: number;
  advance: number;
  accrued: number;
  to_pay: number;
  payment_id: number | null;
  paid_amount: number | null;
  paid_at: string | null;
}

export interface PayrollReport {
  month: string;
  rows: PayrollRow[];
  totals: {
    employees: number;
    base: number;
    bonus: number;
    deduction: number;
    advance: number;
    to_pay: number;
    paid: number;
    unpaid: number;
    missing_rate: number;
  };
}

export interface Adjustment {
  id: number;
  employee_id: number;
  kind: AdjustmentKind;
  amount: number;
  note: string | null;
  created_at: string;
}

export const payrollApi = {
  report: (month: string, factoryId?: number | '') =>
    api.get<PayrollReport>('/payroll', { params: { month, factory_id: factoryId || undefined } }).then((r) => r.data),
  adjustments: (month: string, employeeId: number) =>
    api.get<Adjustment[]>('/payroll/adjustments', { params: { month, employee_id: employeeId } }).then((r) => r.data),
  addAdjustment: (data: { employee_id: number; month: string; kind: AdjustmentKind; amount: number; note: string | null }) =>
    api.post<Adjustment>('/payroll/adjustments', data).then((r) => r.data),
  deleteAdjustment: (id: number) => api.delete(`/payroll/adjustments/${id}`).then(() => undefined),
  pay: (employeeId: number, month: string) =>
    api.post<PayrollRow>('/payroll/payments', { employee_id: employeeId, month }).then((r) => r.data),
  cancelPayment: (id: number) => api.delete(`/payroll/payments/${id}`).then(() => undefined),
  sendPayslips: (month: string, factoryId?: number | '') =>
    api
      .post<{ sent: number; not_linked: number }>('/payroll/payslips/send', { month }, { params: { factory_id: factoryId || undefined } })
      .then((r) => r.data),
};

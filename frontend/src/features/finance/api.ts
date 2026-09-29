import { api } from '@/shared/api/client';

export type ExpenseCategory = 'RENT' | 'UTILITIES' | 'TAX' | 'TRANSPORT' | 'MAINTENANCE' | 'MARKETING' | 'OFFICE' | 'OTHER';

export interface Expense {
  id: number;
  factory_id: number;
  expense_date: string;
  category: ExpenseCategory;
  amount: number;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface ProfitLoss {
  month: string;
  revenue: number;
  orders: number;
  materials: number;
  payroll: number;
  expenses: number;
  expenses_by_category: { category: ExpenseCategory; amount: number }[];
  total_costs: number;
  profit: number;
  margin_pct: number | null;
  payroll_missing_rate: number;
  items: Expense[];
}

export const financeApi = {
  profitLoss: (month: string, factoryId?: number | '') =>
    api.get<ProfitLoss>('/finance/profit-loss', { params: { month, factory_id: factoryId || undefined } }).then((r) => r.data),
  addExpense: (data: { expense_date: string; category: ExpenseCategory; amount: number; note: string | null; factory_id?: number | null }) =>
    api.post<Expense>('/finance/expenses', data).then((r) => r.data),
  deleteExpense: (id: number) => api.delete(`/finance/expenses/${id}`).then(() => undefined),
};

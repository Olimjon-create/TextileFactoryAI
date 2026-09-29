import { api } from '@/shared/api/client';
import type {
  AttendanceRecord,
  AttendanceUpsertPayload,
  DailyBoard,
  DailyFilters,
  EmployeeMonthDetail,
  LeavePage,
  LeavePayload,
  LeaveRequest,
  LeaveStatus,
  MonthlyReport,
} from './types';

const clean = (f: object) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '' && v !== undefined && v !== null));

export const attendanceApi = {
  daily: (filters: DailyFilters = {}) => api.get<DailyBoard>('/attendance/daily', { params: clean(filters) }).then((r) => r.data),
  checkIn: (employeeId: number, workDate?: string, at?: string) =>
    api.post<AttendanceRecord>('/attendance/check-in', clean({ employee_id: employeeId, work_date: workDate, at })).then((r) => r.data),
  checkOut: (employeeId: number, workDate?: string, at?: string) =>
    api.post<AttendanceRecord>('/attendance/check-out', clean({ employee_id: employeeId, work_date: workDate, at })).then((r) => r.data),
  upsert: (data: AttendanceUpsertPayload) => api.put<AttendanceRecord>('/attendance', data).then((r) => r.data),
  remove: (id: number) => api.delete(`/attendance/${id}`),
  monthly: (filters: { month?: string; search?: string; department?: string }) =>
    api.get<MonthlyReport>('/attendance/monthly', { params: clean(filters) }).then((r) => r.data),
  employeeMonth: (employeeId: number, month?: string) =>
    api.get<EmployeeMonthDetail>(`/attendance/employees/${employeeId}`, { params: clean({ month }) }).then((r) => r.data),

  leaves: (filters: { status?: LeaveStatus | ''; search?: string; employee_id?: number; offset?: number; limit?: number }) =>
    api.get<LeavePage>('/leave-requests', { params: clean(filters) }).then((r) => r.data),
  createLeave: (data: LeavePayload) => api.post<LeaveRequest>('/leave-requests', data).then((r) => r.data),
  approveLeave: (id: number, note?: string) => api.post<LeaveRequest>(`/leave-requests/${id}/approve`, { note: note || null }).then((r) => r.data),
  rejectLeave: (id: number, note?: string) => api.post<LeaveRequest>(`/leave-requests/${id}/reject`, { note: note || null }).then((r) => r.data),
  removeLeave: (id: number) => api.delete(`/leave-requests/${id}`),
};

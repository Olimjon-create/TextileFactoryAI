import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { DEPARTMENT_LABELS } from '@/features/resources/constants';
import type { Department } from '@/features/resources/types';
import { attendanceApi } from '../api';
import { duration, keys } from '../constants';
import type { EmployeeMonthRow } from '../types';
import { tr } from '@/i18n';

interface Props {
  month: string;
  onMonthChange: (m: string) => void;
  onOpenEmployee: (id: number) => void;
  refreshKey: number;
}

const Num = ({ v, color }: { v: number; color?: string }) => (
  <Typography component="span" sx={{ fontWeight: 700, fontSize: 14, color: v ? color : 'text.disabled' }}>
    {v || '—'}
  </Typography>
);

export default function MonthlyTab({ month, onMonthChange, onOpenEmployee, refreshKey }: Props) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [rows, setRows] = useState<EmployeeMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await attendanceApi.monthly({ month, search: search.trim(), department })).rows);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [month, search, department]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const total = rows.reduce(
    (a, r) => ({ worked: a.worked + r.worked_minutes, late: a.late + r.late_days, absent: a.absent + r.absent_days, leave: a.leave + r.leave_days + r.vacation_days + r.sick_days }),
    { worked: 0, late: 0, absent: 0, leave: 0 },
  );

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Xodim ismi yoki telefon...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 240px', maxWidth: 340 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField type="month" label={tr("Oy")} value={month} onChange={(e) => e.target.value && onMonthChange(e.target.value)} sx={{ width: 180 }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select label={tr("Bo'lim")} value={department} onChange={(e) => setDepartment(e.target.value as Department | '')} sx={{ width: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {keys(DEPARTMENT_LABELS).map((d) => (
              <MenuItem key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </MenuItem>
            ))}
          </TextField>
        </FilterBar>
        <Box sx={{ px: 2, pb: 2, display: 'flex', gap: 3, flexWrap: 'wrap', color: 'text.secondary', fontSize: 14 }}>
          <span>
            {tr("Jami ishlangan:")}{' '}<b>{duration(total.worked)}</b>
          </span>
          <span>
            {tr("Kechikishlar:")}{' '}<b>{total.late}</b>
          </span>
          <span>
            {tr("Kelmagan kunlar:")}{' '}<b>{total.absent}</b>
          </span>
          <span>
            {tr("Javob / kasal / ta'til:")}{' '}<b>{total.leave}</b>
          </span>
        </Box>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && rows.length === 0 && <MobileListSkeleton />}
            {rows.map((r) => (
              <MobileListItem
                key={r.employee.id}
                overline={r.employee.employee_code}
                title={r.employee.full_name}
                subtitle={tr("Keldi {0} kun · {1} · kechikdi {2} · kelmadi {3} · javob {4} · kasal {5}", r.present_days, duration(r.worked_minutes), r.late_days, r.absent_days, r.leave_days + r.vacation_days, r.sick_days)}
                onClick={() => onOpenEmployee(r.employee.id)}
              />
            ))}
            {!loading && rows.length === 0 && <MobileListEmpty>{tr("Ma'lumot yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Xodim")}</TableCell>
                  <TableCell>{tr("Telefon")}</TableCell>
                  <TableCell align="center">{tr("Keldi (kun)")}</TableCell>
                  <TableCell align="center">{tr("Kechikdi")}</TableCell>
                  <TableCell align="center">{tr("Kelmadi")}</TableCell>
                  <TableCell align="center">{tr("Javob")}</TableCell>
                  <TableCell align="center">{tr("Kasal")}</TableCell>
                  <TableCell align="center">{tr("Ta'til")}</TableCell>
                  <TableCell align="right">{tr("Ishlagan vaqt")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && rows.length === 0 && <TableRowsSkeleton cols={9} />}
                {rows.map((r) => (
                  <TableRow key={r.employee.id} hover sx={{ cursor: 'pointer' }} onClick={() => onOpenEmployee(r.employee.id)}>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{r.employee.full_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[r.employee.employee_code, r.employee.position].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{r.employee.phone ?? '—'}</TableCell>
                    <TableCell align="center"><Num v={r.present_days} color="success.main" /></TableCell>
                    <TableCell align="center">
                      <Num v={r.late_days} color="warning.main" />
                      {r.late_minutes > 0 && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {duration(r.late_minutes)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center"><Num v={r.absent_days} color="error.main" /></TableCell>
                    <TableCell align="center"><Num v={r.leave_days} color="info.main" /></TableCell>
                    <TableCell align="center"><Num v={r.sick_days} color="secondary.main" /></TableCell>
                    <TableCell align="center"><Num v={r.vacation_days} color="info.main" /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{duration(r.worked_minutes)}</TableCell>
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Ma'lumot yo'q")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </>
  );
}

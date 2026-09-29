import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  ListItemIcon,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  alpha,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import SickOutlinedIcon from '@mui/icons-material/SickOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { resourcesApi } from '@/features/resources/api';
import { DEPARTMENT_LABELS } from '@/features/resources/constants';
import type { Department, Shift } from '@/features/resources/types';
import { attendanceApi } from '../api';
import { DAY_STATE_COLORS, DAY_STATE_LABELS, duration, hhmm, isoDate, keys, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, longDate, shiftDate } from '../constants';
import type { AttendanceStatus, DailyBoard, DailyRow, EmployeeBrief, StateFilter } from '../types';
import LeaveDialog from './LeaveDialog';
import MarkDialog from './MarkDialog';
import { tr } from '@/i18n';

interface Props {
  canEdit: boolean;
  canApprove: boolean;
  onOpenEmployee: (id: number) => void;
  /** Javob so'rovi yaratilganda boshqa tablar yangilansin */
  onLeaveChanged: () => void;
  refreshKey: number;
}

const SUMMARY: { key: StateFilter | ''; label: string; field: keyof DailyBoard['summary']; color: string }[] = [
  { key: '', label: tr("Jami xodim"), field: 'total', color: 'text.primary' },
  { key: 'PRESENT', label: tr("Keldi"), field: 'present', color: 'success.main' },
  { key: 'AT_WORK', label: tr("Hozir ishda"), field: 'at_work', color: 'primary.main' },
  { key: 'LATE', label: tr("Kechikdi"), field: 'late', color: 'warning.main' },
  { key: 'ABSENT', label: tr("Kelmadi"), field: 'absent', color: 'error.main' },
  { key: 'LEAVE', label: tr("Javobda"), field: 'on_leave', color: 'info.main' },
  { key: 'SICK', label: tr("Kasal"), field: 'sick', color: 'secondary.main' },
  { key: 'NOT_MARKED', label: tr("Belgilanmagan"), field: 'not_marked', color: 'text.secondary' },
];

export default function DailyTab({ canEdit, canApprove, onOpenEmployee, onLeaveChanged, refreshKey }: Props) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const [day, setDay] = useState(isoDate());
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [shiftId, setShiftId] = useState<number | ''>('');
  const [state, setState] = useState<StateFilter | ''>('');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState<{ anchor: HTMLElement; row: DailyRow } | null>(null);
  const [mark, setMark] = useState<{ row: DailyRow; status?: AttendanceStatus } | null>(null);
  const [leaveFor, setLeaveFor] = useState<EmployeeBrief | null>(null);
  const [removing, setRemoving] = useState<DailyRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBoard(await attendanceApi.daily({ day, search: search.trim(), department, shift_id: shiftId, state }));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [day, search, department, shiftId, state]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, refreshKey]);
  useEffect(() => {
    resourcesApi.shifts().then(setShifts).catch(() => undefined);
  }, []);
  // Bugungi jadval har daqiqada yangilanadi (boshqa qurilmadan belgilanganlar ham ko'rinsin)
  useEffect(() => {
    if (day !== isoDate()) return;
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [day, load]);

  const isToday = day === isoDate();

  const doCheck = async (row: DailyRow, kind: 'in' | 'out') => {
    // O'tgan kun uchun vaqtni qo'lda kiritish kerak
    if (!isToday) {
      setMark({ row, status: 'PRESENT' });
      return;
    }
    setBusy(row.employee.id);
    try {
      const r = kind === 'in' ? await attendanceApi.checkIn(row.employee.id) : await attendanceApi.checkOut(row.employee.id);
      toast.success(
        kind === 'in'
          ? tr("{0} keldi — {1}{2}", row.employee.full_name, hhmm(r.check_in), r.late_minutes ? tr(" ({0} daq kechikdi)", r.late_minutes) : '')
          : tr("{0} ketdi — {1}, ishladi: {2}", row.employee.full_name, hhmm(r.check_out), duration(r.worked_minutes)),
      );
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!removing?.record) return;
    try {
      await attendanceApi.remove(removing.record.id);
      toast.success(tr("Yozuv o'chirildi"));
      setRemoving(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
      setRemoving(null);
    }
  };

  const stateChip = (row: DailyRow) => (
    <Chip
      size="small"
      label={row.at_work ? tr("Ishda") : row.state === 'NOT_MARKED' && isToday ? tr("Hali kelmadi") : DAY_STATE_LABELS[row.state]}
      color={row.at_work ? 'primary' : DAY_STATE_COLORS[row.state]}
      variant={row.state === 'PRESENT' && !row.at_work ? 'outlined' : 'filled'}
    />
  );

  const leaveHint = (row: DailyRow) =>
    row.leave && (
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: row.leave.status === 'PENDING' ? 'warning.main' : 'info.main', fontWeight: 600 }}>
        {row.leave.status === 'PENDING' ? tr("Javob so'ragan") : LEAVE_STATUS_LABELS[row.leave.status]}: {LEAVE_TYPE_LABELS[row.leave.leave_type].toLowerCase()}
        {row.leave.start_time ? ` ${hhmm(row.leave.start_time)}–${hhmm(row.leave.end_time)}` : ''}
      </Typography>
    );

  const inCell = (row: DailyRow) =>
    row.record?.check_in ? (
      <Box>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{hhmm(row.record.check_in)}</Typography>
        {row.record.late_minutes > 0 && (
          <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 700 }}>
            +{duration(row.record.late_minutes)} {tr("kech")}
          </Typography>
        )}
      </Box>
    ) : (
      <Typography color="text.disabled">—</Typography>
    );

  const actionButtons = (row: DailyRow) => {
    if (!canEdit) return null;
    const r = row.record;
    const present = r?.status === 'PRESENT' && !!r.check_in;
    return (
      <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', alignItems: 'center' }}>
        {!present && (
          <Button size="small" variant="contained" color="success" startIcon={<LoginRoundedIcon />} disabled={busy === row.employee.id} onClick={() => doCheck(row, 'in')}>
            {tr("Keldi")}
          </Button>
        )}
        {present && !r?.check_out && (
          <Button size="small" variant="outlined" startIcon={<LogoutRoundedIcon />} disabled={busy === row.employee.id} onClick={() => doCheck(row, 'out')}>
            {tr("Ketdi")}
          </Button>
        )}
        <IconButton size="small" aria-label={tr("Boshqa amallar")} onClick={(e) => setMenu({ anchor: e.currentTarget, row })}>
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  };

  const s = board?.summary;
  const rows = board?.rows ?? [];

  return (
    <>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Sana tanlash */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <IconButton onClick={() => setDay(shiftDate(day, -1))} aria-label={tr("Oldingi kun")}>
          <ChevronLeftIcon />
        </IconButton>
        <TextField type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} sx={{ width: 170 }} fullWidth={false} />
        <IconButton onClick={() => setDay(shiftDate(day, 1))} aria-label={tr("Keyingi kun")}>
          <ChevronRightIcon />
        </IconButton>
        {!isToday && (
          <Button size="small" onClick={() => setDay(isoDate())}>
            {tr("Bugun")}
          </Button>
        )}
        <Typography sx={{ ml: 1, fontWeight: 800, fontSize: 17 }}>{longDate(day)}</Typography>
        {board?.now && (
          <Typography color="text.secondary" sx={{ fontWeight: 600 }}>
            {tr("· hozir")}{' '}{hhmm(board.now)}
          </Typography>
        )}
      </Box>

      {/* Qisqa hisobot — bosilganda filtr bo'ladi */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)', lg: 'repeat(8, 1fr)' }, gap: 1.25, mb: 2.5 }}>
        {SUMMARY.map((c) => {
          const active = state === c.key;
          return (
            <ButtonBase
              key={c.label}
              onClick={() => setState(active ? '' : c.key)}
              sx={(t) => ({
                p: 1.5,
                borderRadius: '16px',
                textAlign: 'left',
                display: 'block',
                bgcolor: 'background.paper',
                boxShadow: t.palette.mode === 'light' ? '0 1px 2px rgba(40,32,18,0.05)' : `0 0 0 1px ${t.palette.divider}`,
                outline: active ? `2px solid ${t.palette.primary.main}` : 'none',
                transition: 'transform .15s',
                '&:hover': { transform: 'translateY(-1px)', bgcolor: alpha(t.palette.primary.main, 0.03) },
              })}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
                {c.key === 'NOT_MARKED' && isToday ? tr("Hali kelmadi") : c.label}
              </Typography>
              <Typography sx={{ fontSize: 26, fontWeight: 800, color: c.color, lineHeight: 1.2 }}>{s ? s[c.field] : '·'}</Typography>
            </ButtonBase>
          );
        })}
      </Box>

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Ism, tabel raqami, telefon...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 240px', maxWidth: 340 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Bo'lim")} value={department} onChange={(e) => setDepartment(e.target.value as Department | '')} sx={{ width: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {keys(DEPARTMENT_LABELS).map((d) => (
              <MenuItem key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label={tr("Smena")} value={shiftId} onChange={(e) => setShiftId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 170 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {shifts.map((sh) => (
              <MenuItem key={sh.id} value={sh.id}>
                {sh.name} ({hhmm(sh.start_time)}–{hhmm(sh.end_time)})
              </MenuItem>
            ))}
          </TextField>
        </FilterBar>
        {loading && <LinearProgress />}

        {isMobile ? (
          <Box>
            {loading && !board && <MobileListSkeleton />}
            {rows.map((row) => (
              <MobileListItem
                key={row.employee.id}
                overline={`${row.employee.employee_code} · ${row.employee.shift_name ?? 'smenasiz'}`}
                title={row.employee.full_name}
                subtitle={
                  <>
                    {row.record?.check_in ? tr("Keldi {0}", hhmm(row.record.check_in)) : ''}
                    {row.record?.check_out ? tr(" · ketdi {0} · {1}", hhmm(row.record.check_out), duration(row.record.worked_minutes)) : ''}
                    {row.record?.late_minutes ? tr(" · +{0} daq", row.record.late_minutes) : ''}
                    {row.employee.phone && !row.record?.check_in ? row.employee.phone : ''}
                    {leaveHint(row)}
                  </>
                }
                trailing={stateChip(row)}
                onClick={() => onOpenEmployee(row.employee.id)}
                actions={actionButtons(row)}
              />
            ))}
            {!loading && rows.length === 0 && <MobileListEmpty>{tr("Xodim topilmadi")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Xodim")}</TableCell>
                  <TableCell>{tr("Telefon")}</TableCell>
                  <TableCell>{tr("Smena")}</TableCell>
                  <TableCell>{tr("Keldi")}</TableCell>
                  <TableCell>{tr("Ketdi")}</TableCell>
                  <TableCell>{tr("Ishladi")}</TableCell>
                  <TableCell>{tr("Holat")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && !board && <TableRowsSkeleton cols={8} />}
                {rows.map((row) => (
                  <TableRow key={row.employee.id} hover>
                    <TableCell>
                      <Link component="button" underline="hover" color="inherit" onClick={() => onOpenEmployee(row.employee.id)} sx={{ fontWeight: 700, fontSize: 14, textAlign: 'left' }}>
                        {row.employee.full_name}
                      </Link>
                      <Typography variant="body2" color="text.secondary">
                        {[row.employee.employee_code, row.employee.position].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {row.employee.phone ? (
                        <Link href={`tel:${row.employee.phone}`} underline="hover">
                          {row.employee.phone}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {row.employee.shift_name ?? '—'}
                      {row.employee.shift_start && (
                        <Typography variant="body2" color="text.secondary">
                          {hhmm(row.employee.shift_start)}–{hhmm(row.employee.shift_end)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{inCell(row)}</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{row.record?.check_out ? hhmm(row.record.check_out) : row.at_work ? <Typography color="primary.main" sx={{ fontSize: 13, fontWeight: 700 }}>{tr("ishda")}</Typography> : '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{duration(row.record?.worked_minutes)}</TableCell>
                    <TableCell>
                      {stateChip(row)}
                      {leaveHint(row)}
                      {row.record?.note && row.state !== 'LEAVE' && (
                        <Tooltip title={row.record.note}>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, maxWidth: 180 }} noWrap>
                            {row.record.note}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {actionButtons(row)}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {state || search || department || shiftId ? tr("Filtrlarga mos xodim topilmadi") : tr("Faol xodimlar yo'q — avval «Xodimlar» bo'limida xodim qo'shing")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {menu && [
          <MenuItem key="absent" onClick={() => (setMark({ row: menu.row, status: 'ABSENT' }), setMenu(null))}>
            <ListItemIcon><PersonOffOutlinedIcon fontSize="small" color="error" /></ListItemIcon>
            {tr("Kelmadi (sababsiz)")}
          </MenuItem>,
          <MenuItem key="leave" onClick={() => (setLeaveFor(menu.row.employee), setMenu(null))}>
            <ListItemIcon><EventAvailableOutlinedIcon fontSize="small" color="info" /></ListItemIcon>
            {tr("Javob berish")}
          </MenuItem>,
          <MenuItem key="sick" onClick={() => (setMark({ row: menu.row, status: 'SICK' }), setMenu(null))}>
            <ListItemIcon><SickOutlinedIcon fontSize="small" color="secondary" /></ListItemIcon>
            {tr("Kasal")}
          </MenuItem>,
          <MenuItem key="edit" onClick={() => (setMark({ row: menu.row }), setMenu(null))}>
            <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
            {tr("Vaqtni tahrirlash")}
          </MenuItem>,
          <MenuItem key="history" onClick={() => (onOpenEmployee(menu.row.employee.id), setMenu(null))}>
            <ListItemIcon><HistoryOutlinedIcon fontSize="small" /></ListItemIcon>
            {tr("Oylik tarix")}
          </MenuItem>,
          menu.row.record && (
            <MenuItem key="del" onClick={() => (setRemoving(menu.row), setMenu(null))} sx={{ color: 'error.main' }}>
              <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
              {tr("Yozuvni o'chirish")}
            </MenuItem>
          ),
        ]}
      </Menu>

      <MarkDialog
        row={mark?.row ?? null}
        date={day}
        initialStatus={mark?.status}
        onClose={() => setMark(null)}
        onSaved={(msg) => {
          setMark(null);
          toast.success(msg);
          load();
        }}
      />
      <LeaveDialog
        open={!!leaveFor}
        employee={leaveFor}
        date={day}
        canApprove={canApprove}
        onClose={() => setLeaveFor(null)}
        onSaved={(msg) => {
          setLeaveFor(null);
          toast.success(msg);
          load();
          onLeaveChanged();
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title={tr("Yozuvni o'chirish")}
        message={tr("{0} — {1} kungi davomat yozuvi o'chiriladi.", removing?.employee.full_name, longDate(day))}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { attendanceApi } from '../api';
import { hhmm, keys, LEAVE_STATUS_COLORS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, shortDate } from '../constants';
import type { LeaveRequest, LeaveStatus } from '../types';
import { tr } from '@/i18n';

interface Props {
  canEdit: boolean;
  canApprove: boolean;
  refreshKey: number;
  onChanged: () => void;
  onPendingCount: (n: number) => void;
  onOpenEmployee: (id: number) => void;
}

const period = (l: LeaveRequest) =>
  `${shortDate(l.start_date)}${l.end_date !== l.start_date ? ` – ${shortDate(l.end_date)}` : ''}${l.start_time ? `, ${hhmm(l.start_time)}–${hhmm(l.end_time)}` : ''}`;

export default function LeavesTab({ canEdit, canApprove, refreshKey, onChanged, onPendingCount, onOpenEmployee }: Props) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const [status, setStatus] = useState<LeaveStatus | ''>('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<LeaveRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decide, setDecide] = useState<{ leave: LeaveRequest; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [removing, setRemoving] = useState<LeaveRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await attendanceApi.leaves({ status, search: search.trim(), offset: page * rowsPerPage, limit: rowsPerPage });
      setItems(res.items);
      setTotal(res.total);
      onPendingCount(res.pending);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [status, search, page, rowsPerPage, onPendingCount]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load, refreshKey]);
  useEffect(() => setPage(0), [status, search, rowsPerPage]);

  const submitDecision = async () => {
    if (!decide) return;
    try {
      if (decide.approve) await attendanceApi.approveLeave(decide.leave.id, note);
      else await attendanceApi.rejectLeave(decide.leave.id, note);
      toast.success(decide.approve ? tr("{0}ga javob berildi", decide.leave.employee.full_name) : tr("So'rov rad etildi"));
      setDecide(null);
      load();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e));
      setDecide(null);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await attendanceApi.removeLeave(removing.id);
      toast.success(tr("So'rov bekor qilindi"));
      setRemoving(null);
      load();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e));
      setRemoving(null);
    }
  };

  const actions = (l: LeaveRequest) => (
    <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'flex-end', alignItems: 'center' }}>
      {canApprove && l.status === 'PENDING' && (
        <>
          <Button size="small" variant="contained" color="success" startIcon={<CheckRoundedIcon />} onClick={() => (setNote(''), setDecide({ leave: l, approve: true }))}>
            {tr("Javob berish")}
          </Button>
          <Button size="small" variant="outlined" color="error" startIcon={<CloseRoundedIcon />} onClick={() => (setNote(''), setDecide({ leave: l, approve: false }))}>
            {tr("Rad etish")}
          </Button>
        </>
      )}
      {canEdit && (
        <Tooltip title={tr("Bekor qilish (o'chirish)")}>
          <IconButton size="small" onClick={() => setRemoving(l)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );

  const statusChip = (l: LeaveRequest) => <Chip size="small" label={LEAVE_STATUS_LABELS[l.status]} color={LEAVE_STATUS_COLORS[l.status]} />;

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
            placeholder={tr("Xodim, telefon yoki sabab...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 240px', maxWidth: 340 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Holati")} value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus | '')} sx={{ width: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {keys(LEAVE_STATUS_LABELS).map((s) => (
              <MenuItem key={s} value={s}>
                {LEAVE_STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && items.length === 0 && <MobileListSkeleton />}
            {items.map((l) => (
              <MobileListItem
                key={l.id}
                overline={tr("{0} · {1} · {2} kun", LEAVE_TYPE_LABELS[l.leave_type], period(l), l.days)}
                title={l.employee.full_name}
                subtitle={l.reason}
                trailing={statusChip(l)}
                onClick={() => onOpenEmployee(l.employee.id)}
                actions={actions(l)}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Javob so'rovlari yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 980 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Xodim")}</TableCell>
                  <TableCell>{tr("Sabab turi")}</TableCell>
                  <TableCell>{tr("Muddat")}</TableCell>
                  <TableCell>{tr("Sababi")}</TableCell>
                  <TableCell>{tr("Holat")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={6} />}
                {items.map((l) => (
                  <TableRow key={l.id} hover>
                    <TableCell>
                      <Link component="button" underline="hover" color="inherit" onClick={() => onOpenEmployee(l.employee.id)} sx={{ fontWeight: 700, fontSize: 14 }}>
                        {l.employee.full_name}
                      </Link>
                      <Typography variant="body2" color="text.secondary">
                        {l.employee.phone ? (
                          <Link href={`tel:${l.employee.phone}`} underline="hover" color="inherit">
                            {l.employee.phone}
                          </Link>
                        ) : (
                          l.employee.employee_code
                        )}
                      </Typography>
                    </TableCell>
                    <TableCell>{LEAVE_TYPE_LABELS[l.leave_type]}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{period(l)}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {l.start_time ? tr('soatbay') : tr("{0} kun", l.days)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography sx={{ fontSize: 14 }}>{l.reason}</Typography>
                      {l.decision_note && (
                        <Typography variant="body2" color="text.secondary">
                          {tr("Izoh:")}{' '}{l.decision_note}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {statusChip(l)}
                      {l.decided_by_name && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {l.decided_by_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {actions(l)}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {status || search ? tr("Filtrlarga mos so'rov topilmadi") : tr("Hali javob so'rovlari yo'q")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => setRowsPerPage(Number(e.target.value))}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage={tr("Sahifada:")}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
        />
      </Card>

      <Dialog open={!!decide} onClose={() => setDecide(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{decide?.approve ? tr("Javob berish") : tr("So'rovni rad etish")}</DialogTitle>
        <DialogContent>
          {decide && (
            <Typography sx={{ mb: 2 }}>
              <b>{decide.leave.employee.full_name}</b> — {LEAVE_TYPE_LABELS[decide.leave.leave_type].toLowerCase()}, {period(decide.leave)}
              <Typography component="span" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                {decide.leave.reason}
              </Typography>
            </Typography>
          )}
          <TextField label={tr("Izoh (ixtiyoriy)")} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setDecide(null)}>
            {tr("Bekor qilish")}
          </Button>
          <Button variant="contained" color={decide?.approve ? 'success' : 'error'} onClick={submitDecision}>
            {decide?.approve ? tr("Javob berish") : tr("Rad etish")}
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={!!removing}
        title={tr("So'rovni bekor qilish")}
        message={tr("{0}ning so'rovi o'chiriladi.{1}", removing?.employee.full_name, removing?.status === 'APPROVED' ? tr(" Davomatdagi «javob» kunlari ham olib tashlanadi.") : '')}
        confirmText={tr("Bekor qilish")}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

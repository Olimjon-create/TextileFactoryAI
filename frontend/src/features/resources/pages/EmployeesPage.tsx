import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
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
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import ExportButton from '@/shared/components/ExportButton';
import { fetchAll } from '@/shared/utils/csv';
import { formatDate } from '@/shared/utils/dates';
import { resourcesApi } from '../api';
import EmployeeFormDialog from '../components/EmployeeFormDialog';
import { DEPARTMENT_LABELS, EMPLOYEE_STATUS_COLORS, EMPLOYEE_STATUS_LABELS, keys, PAY_TYPE_LABELS } from '../constants';
import { useResourcePermissions } from '../permissions';
import type { Department, Employee, EmployeeStatus, ProductionLine } from '../types';
import { tr } from '@/i18n';

export default function EmployeesPage() {
  const isMobile = useIsMobile();
  const toast = useToast();
  const { canEditWorkforce, canSeePay } = useResourcePermissions();
  const [items, setItems] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<Department | ''>('');
  const [lineId, setLineId] = useState<number | ''>('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('ACTIVE');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; employee: Employee | null }>({ open: false, employee: null });
  const [deleting, setDeleting] = useState<Employee | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await resourcesApi.employees({ search: search.trim(), department, line_id: lineId, status, offset: page * rowsPerPage, limit: rowsPerPage });
      setItems(res.items);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, department, lineId, status, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [search, department, lineId, status, rowsPerPage]);
  useEffect(() => {
    resourcesApi.lines().then(setLines).catch(() => undefined);
  }, []);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await resourcesApi.removeEmployee(deleting.id);
      toast.success(tr("Xodim o'chirildi"));
      setDeleting(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const actions = (e: Employee) =>
    canEditWorkforce && (
      <>
        <Tooltip title={tr("Tahrirlash")}>
          <IconButton size="small" onClick={() => setDialog({ open: true, employee: e })}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={tr("O'chirish")}>
          <IconButton size="small" color="error" onClick={() => setDeleting(e)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </>
    );
  const statusChip = (e: Employee) => <Chip size="small" label={EMPLOYEE_STATUS_LABELS[e.status]} color={EMPLOYEE_STATUS_COLORS[e.status]} />;
  const pay = (e: Employee) => (e.pay_rate !== null ? `${formatMoney(e.pay_rate)} · ${PAY_TYPE_LABELS[e.pay_type].toLowerCase()}` : '—');
  const cols = canSeePay ? 8 : 7;

  const exportHeaders = [tr("Tabel"), 'F.I.Sh.', tr("Telefon"), tr("Lavozim"), tr("Bo'lim"), tr("Liniya"), tr("Smena"), tr("Ishga kirgan"), tr("Holati"), tr("Kunlik me'yor")];
  const exportRows = async () =>
    (
      await fetchAll((offset, limit) => resourcesApi.employees({ search: search.trim(), department, line_id: lineId, status, offset, limit }))
    ).map((e) => [
      e.employee_code,
      e.full_name,
      e.phone,
      e.position,
      DEPARTMENT_LABELS[e.department],
      e.line?.name,
      e.shift?.name,
      e.hire_date ? formatDate(e.hire_date) : null,
      EMPLOYEE_STATUS_LABELS[e.status],
      e.daily_norm,
      ...(canSeePay ? [PAY_TYPE_LABELS[e.pay_type], e.pay_rate] : []),
    ]);

  return (
    <>
      <PageHeader
        title={tr("Xodimlar")}
        subtitle={tr("Bo'lim, liniya, smena va ish me'yori — KPI va tannarx shu ma'lumotlarga tayanadi")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <ExportButton name="xodimlar" headers={canSeePay ? [...exportHeaders, "Ish haqi turi", 'Stavka'] : exportHeaders} load={exportRows} />
            {canEditWorkforce && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, employee: null })}>
                {tr("Yangi xodim")}
              </Button>
            )}
          </Box>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Ism, tabel raqami, telefon, lavozim...")}
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
          <TextField select label={tr("Liniya")} value={lineId} onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 170 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {lines.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.code} — {l.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label={tr("Holati")} value={status} onChange={(e) => setStatus(e.target.value as EmployeeStatus | '')} sx={{ width: 150 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {keys(EMPLOYEE_STATUS_LABELS).map((s) => (
              <MenuItem key={s} value={s}>
                {EMPLOYEE_STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && items.length === 0 && <MobileListSkeleton />}
            {items.map((e) => (
              <MobileListItem
                key={e.id}
                overline={`${e.employee_code} · ${DEPARTMENT_LABELS[e.department]}`}
                title={e.full_name}
                subtitle={[e.position, e.line?.code, e.shift?.name].filter(Boolean).join(' · ') || undefined}
                trailing={statusChip(e)}
                meta={e.daily_norm ? <Typography variant="caption" color="text.secondary">{tr("Me'yor:")}{' '}{e.daily_norm} {tr("dona/smena")}</Typography> : undefined}
                actions={actions(e)}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Xodim topilmadi")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Tabel")}</TableCell>
                  <TableCell>{tr("Xodim")}</TableCell>
                  <TableCell>{tr("Bo'lim")}</TableCell>
                  <TableCell>{tr("Liniya / smena")}</TableCell>
                  <TableCell align="right">{tr("Me'yor")}</TableCell>
                  {canSeePay && <TableCell align="right">{tr("Ish haqi")}</TableCell>}
                  <TableCell>{tr("Holati")}</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={cols} />}
                {items.map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{e.employee_code}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{e.full_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[e.position, e.phone].filter(Boolean).join(' · ') || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>{DEPARTMENT_LABELS[e.department]}</TableCell>
                    <TableCell>
                      {e.line ? `${e.line.code} — ${e.line.name}` : '—'}
                      <Typography variant="body2" color="text.secondary">
                        {e.shift?.name ?? ''}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{e.daily_norm ? tr("{0} dona", e.daily_norm) : '—'}</TableCell>
                    {canSeePay && <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{pay(e)}</TableCell>}
                    <TableCell>{statusChip(e)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {actions(e)}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={cols} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {search || department || lineId ? tr("Filtrlarga mos xodim topilmadi") : tr("Xodimlar hali qo'shilmagan")}
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
      <EmployeeFormDialog
        open={dialog.open}
        employee={dialog.employee}
        onClose={() => setDialog({ open: false, employee: null })}
        onSaved={() => {
          setDialog({ open: false, employee: null });
          load();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={tr("Xodimni o'chirish")}
        message={tr("\"{0}\" o'chiriladi. Ishdan ketgan xodimni o'chirish o'rniga holatini «Bo'shagan» qilish tavsiya etiladi — tarix saqlanadi.", deleting?.full_name)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

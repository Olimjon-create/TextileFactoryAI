import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { resourcesApi } from '../api';
import { MachineStatusChip, MaintenanceDue } from '../components/MachineChips';
import MachineFormDialog from '../components/MachineFormDialog';
import { formatDuration, keys, MACHINE_STATUS_COLORS, MACHINE_STATUS_LABELS, MACHINE_TYPE_LABELS } from '../constants';
import { useResourcePermissions } from '../permissions';
import type { Machine, MachineStatus, MachineType, ProductionLine, ResourcesSummary } from '../types';
import { tr } from '@/i18n';

const since = (iso: string) => formatDuration(Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)));

export default function MachinesPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { canEditMachines } = useResourcePermissions();
  const [items, setItems] = useState<Machine[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ResourcesSummary | null>(null);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MachineStatus | ''>('');
  const [type, setType] = useState<MachineType | ''>('');
  const [lineId, setLineId] = useState<number | ''>('');
  const [maintenance, setMaintenance] = useState<'overdue' | 'due_soon' | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        resourcesApi.machines({ search: search.trim(), status, machine_type: type, line_id: lineId, maintenance, offset: page * rowsPerPage, limit: rowsPerPage }),
        resourcesApi.summary(),
      ]);
      setItems(res.items);
      setTotal(res.total);
      setSummary(sum);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, status, type, lineId, maintenance, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [search, status, type, lineId, maintenance, rowsPerPage]);
  useEffect(() => {
    resourcesApi.lines().then(setLines).catch(() => undefined);
  }, []);

  const by = summary?.machines_by_status;
  const filtered = search || status || type || lineId || maintenance;

  return (
    <>
      <PageHeader
        title={tr("Mashinalar")}
        subtitle={tr("Holat, to'xtab qolish vaqti, texnik xizmat jadvali va ta'mir tarixi")}
        action={
          canEditMachines && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
              {tr("Yangi mashina")}
            </Button>
          )
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, mb: 3 }}>
        <StatCard label={tr("Faol mashinalar")} value={summary?.machines_total ?? '—'} icon={<PrecisionManufacturingOutlinedIcon />} />
        <StatCard label={tr("Ishlayapti")} value={by?.WORKING ?? '—'} icon={<PlayCircleOutlineIcon />} color="success.main" />
        <StatCard label={tr("Buzilgan")} value={by?.BROKEN ?? '—'} icon={<ReportProblemOutlinedIcon />} color="error.main" />
        <StatCard
          label={tr("Texnik xizmat muddati o'tgan")}
          value={summary?.maintenance_overdue ?? '—'}
          icon={<BuildCircleOutlinedIcon />}
          color="warning.main"
          hint={summary ? tr("{0} tasi 7 kun ichida", summary.maintenance_due_soon) : undefined}
        />
        <StatCard
          label={tr("Tayyorlik (30 kun)")}
          value={summary ? `${summary.availability_pct_30d}%` : '—'}
          icon={<SpeedOutlinedIcon />}
          color="info.main"
          hint={summary ? tr("To'xtash: {0} soat", summary.downtime_hours_30d) : undefined}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip label={tr("Barchasi")} color={status === '' && !maintenance ? 'primary' : 'default'} onClick={() => { setStatus(''); setMaintenance(''); }} />
        {keys(MACHINE_STATUS_LABELS).map((s) => (
          <Chip
            key={s}
            label={`${MACHINE_STATUS_LABELS[s]} · ${by?.[s] ?? 0}`}
            color={status === s ? (MACHINE_STATUS_COLORS[s] === 'default' ? 'primary' : MACHINE_STATUS_COLORS[s]) : 'default'}
            variant={status === s ? 'filled' : 'outlined'}
            onClick={() => setStatus(status === s ? '' : s)}
          />
        ))}
        <Chip label={tr("Xizmat muddati o'tgan")} color={maintenance === 'overdue' ? 'error' : 'default'} variant={maintenance === 'overdue' ? 'filled' : 'outlined'} onClick={() => setMaintenance(maintenance === 'overdue' ? '' : 'overdue')} />
        <Chip label={tr("Xizmat yaqinlashgan")} color={maintenance === 'due_soon' ? 'warning' : 'default'} variant={maintenance === 'due_soon' ? 'filled' : 'outlined'} onClick={() => setMaintenance(maintenance === 'due_soon' ? '' : 'due_soon')} />
      </Box>

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Inventar raqami, nom, brend, seriya...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 240px', maxWidth: 340 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Turi")} value={type} onChange={(e) => setType(e.target.value as MachineType | '')} sx={{ width: 200 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {keys(MACHINE_TYPE_LABELS).map((t) => (
              <MenuItem key={t} value={t}>
                {MACHINE_TYPE_LABELS[t]}
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
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && items.length === 0 && <MobileListSkeleton />}
            {items.map((m) => (
              <MobileListItem
                key={m.id}
                onClick={() => navigate(`/machines/${m.id}`)}
                overline={`${m.code} · ${MACHINE_TYPE_LABELS[m.machine_type]}`}
                title={m.name}
                subtitle={[m.line?.code, tr("{0} shu holatda", since(m.status_since))].filter(Boolean).join(' · ')}
                trailing={<MachineStatusChip machine={m} />}
                meta={<MaintenanceDue machine={m} />}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{filtered ? tr("Filtrlarga mos mashina topilmadi") : tr("Mashinalar hali ro'yxatga olinmagan")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Inventar")}</TableCell>
                  <TableCell>{tr("Mashina")}</TableCell>
                  <TableCell>{tr("Liniya")}</TableCell>
                  <TableCell>{tr("Holati")}</TableCell>
                  <TableCell>{tr("Keyingi texnik xizmat")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={5} />}
                {items.map((m) => (
                  <TableRow key={m.id} hover onClick={() => navigate(`/machines/${m.id}`)} sx={{ cursor: 'pointer', bgcolor: m.status === 'BROKEN' ? 'rgba(211,47,47,0.05)' : undefined }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{m.code}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{m.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[MACHINE_TYPE_LABELS[m.machine_type], m.brand].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell>{m.line ? `${m.line.code} — ${m.line.name}` : '—'}</TableCell>
                    <TableCell>
                      <MachineStatusChip machine={m} />
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                        {since(m.status_since)} {tr("shu holatda")}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <MaintenanceDue machine={m} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {filtered ? tr("Filtrlarga mos mashina topilmadi") : tr("Mashinalar hali ro'yxatga olinmagan")}
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
      <MachineFormDialog
        open={formOpen}
        machine={null}
        onClose={() => setFormOpen(false)}
        onSaved={(m) => {
          setFormOpen(false);
          navigate(`/machines/${m.id}`);
        }}
      />
    </>
  );
}

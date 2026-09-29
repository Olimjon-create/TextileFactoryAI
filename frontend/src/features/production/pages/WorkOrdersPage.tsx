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
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { resourcesApi } from '@/features/resources/api';
import type { ProductionLine } from '@/features/resources/types';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { productionApi } from '../api';
import StagePipeline from '../components/StagePipeline';
import { WorkOrderStatusChip } from '../components/WorkOrderChips';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import { STAGE_SHORT, WO_STATUS_LABELS } from '../constants';
import { useProductionPermissions } from '../permissions';
import type { ProductionSummary, WorkOrder, WorkOrderStatus } from '../types';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

type Tab = 'active' | 'late' | WorkOrderStatus | '';

export default function WorkOrdersPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { canEdit } = useProductionPermissions();
  const [items, setItems] = useState<WorkOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ProductionSummary | null>(null);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('active');
  const [lineId, setLineId] = useState<number | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        productionApi.list({
          search: search.trim(),
          active: tab === 'active',
          late: tab === 'late',
          status: tab === 'active' || tab === 'late' ? '' : tab,
          line_id: lineId,
          offset: page * rowsPerPage,
          limit: rowsPerPage,
        }),
        productionApi.summary(),
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
  }, [search, tab, lineId, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [search, tab, lineId, rowsPerPage]);
  useEffect(() => {
    resourcesApi.lines().then(setLines).catch(() => undefined);
  }, []);

  const today = summary?.output_today;
  const cut = today?.find((x) => x.stage === 'CUTTING')?.good ?? 0;
  const packed = today?.find((x) => x.stage === 'PACKING')?.good ?? 0;
  const tabs: [Tab, string][] = [
    ['active', tr("Faol · {0}", summary?.work_orders_active ?? 0)],
    ['late', tr("Kechikayotgan · {0}", summary?.work_orders_late ?? 0)],
    ['PLANNED', WO_STATUS_LABELS.PLANNED],
    ['COMPLETED', WO_STATUS_LABELS.COMPLETED],
    ['CANCELLED', WO_STATUS_LABELS.CANCELLED],
    ['', tr("Barchasi")],
  ];

  return (
    <>
      <PageHeader
        title={tr("Ish buyurtmalari")}
        subtitle={tr("Kesish → Tikuv → Pardoz → Sifat nazorati → Qadoqlash: har bir partiyaning holati")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<QrCodeScannerIcon />} component={RouterLink} to="/production/scan">
              {tr("Skaner")}
            </Button>
            {canEdit && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
                {tr("Ombor uchun")}
              </Button>
            )}
          </Box>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatCard label={tr("Faol ish buyurtmalari")} value={summary?.work_orders_active ?? '—'} icon={<AssignmentOutlinedIcon />} />
        <StatCard label={tr("Kechikayotgan")} value={summary?.work_orders_late ?? '—'} icon={<AlarmOutlinedIcon />} color="error.main" />
        <StatCard label={tr("Bugun: kesildi / qadoqlandi")} value={summary ? `${cut} / ${packed}` : '—'} icon={<TaskAltOutlinedIcon />} color="success.main" hint={summary ? tr("30 kunda tugallangan: {0}", summary.completed_30d) : undefined} />
        <StatCard
          label={tr("Kesish chiqindisi (30 kun)")}
          value={summary?.waste_pct_30d != null ? `${summary.waste_pct_30d}%` : '—'}
          icon={<ContentCutOutlinedIcon />}
          color="warning.main"
          hint={summary ? `${summary.fabric_waste_30d} / ${summary.fabric_used_30d} m` : undefined}
        />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <Chip key={key || 'all'} label={label} color={tab === key ? (key === 'late' ? 'error' : 'primary') : 'default'} variant={tab === key ? 'filled' : 'outlined'} onClick={() => setTab(key)} />
        ))}
      </Box>

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("WO raqami, mahsulot, buyurtma, mijoz...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 260px', maxWidth: 360 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Liniya")} value={lineId} onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 180 }}>
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
            {items.map((w) => (
              <MobileListItem
                key={w.id}
                onClick={() => navigate(`/production/${w.id}`)}
                overline={`${w.number}${w.order_number ? ` · ${w.order_number}` : ''}`}
                title={`${w.product_name}${w.size ? ` (${w.size}${w.color ? `, ${w.color}` : ''})` : ''}`}
                subtitle={`${w.finished} / ${w.quantity} tayyor${w.current_stage ? tr(" · hozir: {0}", STAGE_SHORT[w.current_stage]) : ''}`}
                trailing={<WorkOrderStatusChip wo={w} />}
                meta={<Box sx={{ width: '100%' }}><StagePipeline wo={w} compact /></Box>}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Ish buyurtmalari yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 1000 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Raqam")}</TableCell>
                  <TableCell>{tr("Mahsulot")}</TableCell>
                  <TableCell>{tr("Buyurtma")}</TableCell>
                  <TableCell sx={{ minWidth: 280 }}>{tr("Bosqichlar")}</TableCell>
                  <TableCell align="right">{tr("Tayyor")}</TableCell>
                  <TableCell>{tr("Muddat")}</TableCell>
                  <TableCell>{tr("Holati")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={7} />}
                {items.map((w) => (
                  <TableRow key={w.id} hover onClick={() => navigate(`/production/${w.id}`)} sx={{ cursor: 'pointer', bgcolor: w.is_late ? 'rgba(211,47,47,0.05)' : undefined }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{w.number}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{w.product_name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {[w.product_code, w.size, w.color, w.line?.code].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {w.order_number ?? <Typography variant="body2" color="text.secondary">{tr("Ombor uchun")}</Typography>}
                      {w.customer_name && (
                        <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 180 }}>
                          {w.customer_name}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <StagePipeline wo={w} compact />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Typography sx={{ fontWeight: 700 }}>
                        {w.finished} / {w.quantity}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {w.percent}%
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{w.planned_end ? formatDate(w.planned_end) : '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <WorkOrderStatusChip wo={w} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Ish buyurtmalari yo'q. Buyurtma sahifasida «Ishlab chiqarishga berish» tugmasini bosing yoki ombor uchun oching.")}
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
      <WorkOrderFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(w) => {
          setFormOpen(false);
          navigate(`/production/${w.id}`);
        }}
      />
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  InputAdornment,
  LinearProgress,
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
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { procurementApi } from '../api';
import PurchaseOrderFormDialog from '../components/PurchaseOrderFormDialog';
import PurchaseStatusChip from '../components/PurchaseStatusChip';
import { formatDate, PURCHASE_STATUS_LABELS } from '../constants';
import { useCanEditProcurement } from '../permissions';
import type { ProcurementSummary, PurchaseOrder, PurchasePrefill, PurchaseStatus } from '../types';
import { tr } from '@/i18n';

type Tab = 'open' | 'overdue' | PurchaseStatus | '';

function Received({ po }: { po: PurchaseOrder }) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary">
        {po.received_pct}%
      </Typography>
      <LinearProgress variant="determinate" value={po.received_pct} color={po.received_pct >= 100 ? 'success' : 'primary'} sx={{ height: 6, borderRadius: 3 }} />
    </Box>
  );
}

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const canEdit = useCanEditProcurement();
  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ProcurementSummary | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('open');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Buyurtma sahifasidan "Xarid qilish" bilan kelinganda forma oldindan to'ldiriladi
  const incoming = (location.state as { prefill?: PurchasePrefill } | null)?.prefill ?? null;
  const [prefill, setPrefill] = useState<PurchasePrefill | null>(incoming);
  const [formOpen, setFormOpen] = useState(!!incoming && canEdit);

  useEffect(() => {
    if (incoming) navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        procurementApi.list({
          search: search.trim(),
          open_only: tab === 'open',
          overdue: tab === 'overdue',
          status: tab === 'open' || tab === 'overdue' ? '' : tab,
          offset: page * rowsPerPage,
          limit: rowsPerPage,
        }),
        procurementApi.summary(),
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
  }, [search, tab, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [search, tab, rowsPerPage]);

  const tabs: [Tab, string][] = [
    ['open', tr("Kutilmoqda · {0}", summary?.open_orders ?? 0)],
    ['overdue', tr("Kechikayotgan · {0}", summary?.overdue_orders ?? 0)],
    ['DRAFT', `${PURCHASE_STATUS_LABELS.DRAFT} · ${summary?.drafts ?? 0}`],
    ['RECEIVED', PURCHASE_STATUS_LABELS.RECEIVED],
    ['CLOSED', PURCHASE_STATUS_LABELS.CLOSED],
    ['CANCELLED', PURCHASE_STATUS_LABELS.CANCELLED],
    ['', tr("Barchasi")],
  ];

  return (
    <>
      <PageHeader
        title={tr("Xarid buyurtmalari")}
        subtitle={tr("Yetkazib beruvchilardan material buyurtma qilish va omborga qabul qilish")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<StorefrontOutlinedIcon />} component={RouterLink} to="/suppliers">
              {tr("Yetkazib beruvchilar")}
            </Button>
            {canEdit && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => {
                  setPrefill(null);
                  setFormOpen(true);
                }}
              >
                {tr("Xarid buyurtmasi")}
              </Button>
            )}
          </Box>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatCard label={tr("Kutilayotgan buyurtmalar")} value={summary?.open_orders ?? '—'} icon={<LocalShippingOutlinedIcon />} />
        <StatCard label={tr("Kechikayotgan")} value={summary?.overdue_orders ?? '—'} icon={<AlarmOutlinedIcon />} color="error.main" />
        <StatCard label={tr("Yo'ldagi tovar qiymati")} value={summary ? formatMoney(summary.open_value) : '—'} icon={<PaymentsOutlinedIcon />} color="success.main" />
        <StatCard label={tr("7 kun ichida keladi")} value={summary?.expected_7d ?? '—'} icon={<EventOutlinedIcon />} color="info.main" hint={summary ? tr("{0} ta faol yetkazib beruvchi", summary.suppliers_count) : undefined} />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <Chip key={key || 'all'} label={label} color={tab === key ? (key === 'overdue' ? 'error' : 'primary') : 'default'} variant={tab === key ? 'filled' : 'outlined'} onClick={() => setTab(key)} />
        ))}
      </Box>

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("PO raqami, yetkazib beruvchi, material...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 260px', maxWidth: 380 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && items.length === 0 && <MobileListSkeleton />}
            {items.map((po) => (
              <MobileListItem
                key={po.id}
                onClick={() => navigate(`/purchases/${po.id}`)}
                overline={`${po.number}${po.order_number ? ` · ${po.order_number}` : ''}`}
                title={po.supplier.name}
                subtitle={tr("{0} qator · {1} · kutiladi {2}", po.items_count, formatMoney(po.total_amount, po.currency), formatDate(po.expected_date))}
                trailing={<PurchaseStatusChip po={po} />}
                meta={po.status !== 'DRAFT' && po.status !== 'CANCELLED' ? <Box sx={{ width: '100%' }}><Received po={po} /></Box> : undefined}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Xarid buyurtmalari yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 960 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Raqam")}</TableCell>
                  <TableCell>{tr("Yetkazib beruvchi")}</TableCell>
                  <TableCell>{tr("Buyurtma uchun")}</TableCell>
                  <TableCell align="right">{tr("Summa")}</TableCell>
                  <TableCell>{tr("Qabul qilindi")}</TableCell>
                  <TableCell>{tr("Kutilgan sana")}</TableCell>
                  <TableCell>{tr("Holati")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={7} />}
                {items.map((po) => (
                  <TableRow key={po.id} hover onClick={() => navigate(`/purchases/${po.id}`)} sx={{ cursor: 'pointer', bgcolor: po.is_overdue ? 'rgba(211,47,47,0.05)' : undefined }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{po.number}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{po.supplier.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {po.items_count} {tr("qator ·")}{' '}{formatDate(po.order_date)}
                      </Typography>
                    </TableCell>
                    <TableCell>{po.order_number ?? <Typography variant="body2" color="text.secondary">{tr("Ombor uchun")}</Typography>}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatMoney(po.total_amount, po.currency)}
                    </TableCell>
                    <TableCell>{po.status === 'DRAFT' || po.status === 'CANCELLED' ? '—' : <Received po={po} />}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(po.expected_date)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <PurchaseStatusChip po={po} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Xarid buyurtmalari yo'q. Buyurtmaning material ehtiyojidan yoki «Xarid buyurtmasi» tugmasi orqali yarating.")}
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
      <PurchaseOrderFormDialog
        open={formOpen}
        prefill={prefill}
        onClose={() => setFormOpen(false)}
        onSaved={(po) => {
          setFormOpen(false);
          navigate(`/purchases/${po.id}`);
        }}
      />
    </>
  );
}

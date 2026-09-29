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
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import type { Factory } from '@/shared/types';
import { formatMoney } from '@/shared/utils/money';
import { ordersApi } from '../api';
import CreateOrderDialog from '../components/CreateOrderDialog';
import DueDate from '../components/DueDate';
import OrderStatusChip from '../components/OrderStatusChip';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS, ORDER_STATUSES } from '../constants';
import { useNewOrders } from '../NewOrdersContext';
import { useCanManageOrders } from '../permissions';
import type { OrderListItem, OrderStatus, OrderSummary } from '../types';
import { formatDate, formatDateTime } from '@/shared/utils/dates';
import ExportButton from '@/shared/components/ExportButton';
import { fetchAll } from '@/shared/utils/csv';
import { tr } from '@/i18n';

const REFRESH_MS = 30_000;

export default function OrdersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { refresh: refreshBadge } = useNewOrders();
  const isMobile = useIsMobile();
  const canManage = useCanManageOrders();

  const [orders, setOrders] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [overdue, setOverdue] = useState(false);
  const [source, setSource] = useState<'STORE' | 'MANUAL' | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        ordersApi.list({ search: search.trim(), status, factory_id: factoryId, overdue: overdue || '', source, offset: page * rowsPerPage, limit: rowsPerPage }),
        ordersApi.summary(),
      ]);
      setOrders(res.items);
      setTotal(res.total);
      setSummary(sum);
      setError('');
      refreshBadge();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, status, factoryId, overdue, source, page, rowsPerPage, refreshBadge]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    const interval = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [load]);

  useEffect(() => setPage(0), [search, status, factoryId, overdue, source, rowsPerPage]);

  useEffect(() => {
    if (isSuperAdmin) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [isSuperAdmin]);

  const allCount = summary ? Object.values(summary.by_status).reduce((a, b) => a + b, 0) : 0;

  const exportRows = async () =>
    (
      await fetchAll((offset, limit) =>
        ordersApi.list({ search: search.trim(), status, factory_id: factoryId, overdue: overdue || '', source, offset, limit }),
      )
    ).map((o) => [
      o.order_number,
      formatDateTime(o.paid_at ?? o.created_at),
      o.customer_name,
      o.customer_phone,
      o.factory?.name,
      o.source === 'STORE' ? tr("Katalog") : tr("Menejer"),
      ORDER_STATUS_LABELS[o.status],
      o.payment_status === 'PAID' ? tr("To'langan") : tr("To'lanmagan"),
      o.items_count,
      o.total_quantity,
      o.total_amount,
      o.currency,
      o.due_date ? formatDate(o.due_date) : null,
      o.is_overdue ? tr("Ha") : '',
    ]);

  return (
    <>
      <PageHeader
        title={tr("Buyurtmalar")}
        subtitle={tr("Katalog orqali to'langan va menejer kiritgan (B2B) buyurtmalar")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <ExportButton
              name="buyurtmalar"
              headers={['Raqam', 'Sana', 'Mijoz', 'Telefon', 'Fabrika', 'Manba', 'Holat', "To'lov", 'Qatorlar', 'Dona', 'Summa', 'Valyuta', 'Muddat', 'Kechikkan']}
              load={exportRows}
            />
            {canManage && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
                {tr("Yangi buyurtma")}
              </Button>
            )}
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          flexWrap: { xs: 'nowrap', md: 'wrap' },
          overflowX: { xs: 'auto', md: 'visible' },
          mx: { xs: -2, md: 0 },
          px: { xs: 2, md: 0 },
          pb: { xs: 0.5, md: 0 },
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          '& .MuiChip-root': { flexShrink: 0 },
        }}
      >
        <Chip label={tr("Barchasi · {0}", allCount)} color={status === '' && !overdue ? 'primary' : 'default'} onClick={() => { setStatus(''); setOverdue(false); }} />
        <Chip label={tr("Kechikkanlar")} color={overdue ? 'error' : 'default'} variant={overdue ? 'filled' : 'outlined'} onClick={() => setOverdue((v) => !v)} />
        {ORDER_STATUSES.map((s) => (
          <Chip
            key={s}
            label={`${ORDER_STATUS_LABELS[s]} · ${summary?.by_status[s] ?? 0}`}
            color={status === s ? ORDER_STATUS_COLORS[s] === 'default' ? 'primary' : ORDER_STATUS_COLORS[s] : 'default'}
            variant={status === s ? 'filled' : 'outlined'}
            onClick={() => setStatus(s)}
          />
        ))}
      </Box>

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Buyurtma raqami, mijoz ismi yoki telefoni...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 280px', maxWidth: 380 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Manba")} value={source} onChange={(e) => setSource(e.target.value as 'STORE' | 'MANUAL' | '')} sx={{ width: 170 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            <MenuItem value="MANUAL">{tr("Qo'lda (B2B)")}</MenuItem>
            <MenuItem value="STORE">{tr("Katalog")}</MenuItem>
          </TextField>
          {isSuperAdmin && (
            <TextField
              select
              label={tr("Fabrika")}
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ width: 220 }}
            >
              <MenuItem value="">{tr("Barchasi")}</MenuItem>
              {factories.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && orders.length === 0 && <MobileListSkeleton />}
            {orders.map((o) => (
              <Box key={o.id} sx={{ bgcolor: o.status === 'NEW' ? 'rgba(2,136,209,0.06)' : undefined }}>
                <MobileListItem
                  onClick={() => navigate(`/orders/${o.id}`)}
                  overline={`${o.order_number} · ${formatDateTime(o.paid_at ?? o.created_at)}`}
                  title={o.customer_name}
                  subtitle={[o.customer_phone, isSuperAdmin ? o.factory?.name : null].filter(Boolean).join(' · ')}
                  trailing={
                    <>
                      <OrderStatusChip status={o.status} />
                      <Typography variant="body2" sx={{ fontWeight: 700, mt: 0.75, whiteSpace: 'nowrap' }}>
                        {formatMoney(o.total_amount, o.currency)}
                      </Typography>
                    </>
                  }
                  meta={
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary">
                        {o.items_count ? <>{o.items_count} {tr("xil ·")}{' '}{o.total_quantity} {tr("ta")}</> : '—'}
                      </Typography>
                      <DueDate order={o} />
                    </Box>
                  }
                />
              </Box>
            ))}
            {!loading && orders.length === 0 && (
              <MobileListEmpty>
                {search || status ? tr("Filtrlarga mos buyurtma topilmadi") : tr("Hali buyurtmalar yo'q. To'langan buyurtmalar shu yerda paydo bo'ladi.")}
              </MobileListEmpty>
            )}
          </Box>
        ) : (
        <TableContainer>
          <Table sx={{ minWidth: 820 }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Raqam")}</TableCell>
                <TableCell>{tr("Sana")}</TableCell>
                <TableCell>{tr("Mijoz")}</TableCell>
                {isSuperAdmin && <TableCell>{tr("Fabrika")}</TableCell>}
                <TableCell align="center">{tr("Mahsulotlar")}</TableCell>
                <TableCell>{tr("Muddat")}</TableCell>
                <TableCell align="right">{tr("Summa")}</TableCell>
                <TableCell>{tr("Status")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && orders.length === 0 && <TableRowsSkeleton cols={isSuperAdmin ? 8 : 7} />}
              {orders.map((o) => (
                <TableRow
                  key={o.id}
                  hover
                  onClick={() => navigate(`/orders/${o.id}`)}
                  sx={{ cursor: 'pointer', bgcolor: o.is_overdue ? 'rgba(211,47,47,0.07)' : o.status === 'NEW' ? 'rgba(2,136,209,0.05)' : undefined }}
                >
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {o.order_number}
                    {o.source === 'MANUAL' && <Chip size="small" label="B2B" variant="outlined" sx={{ ml: 1, height: 20, fontFamily: 'inherit' }} />}
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(o.paid_at ?? o.created_at)}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{o.customer_name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {o.customer_phone}
                    </Typography>
                  </TableCell>
                  {isSuperAdmin && <TableCell>{o.factory?.name ?? '—'}</TableCell>}
                  <TableCell align="center">
                    {o.items_count ? <>{o.items_count} {tr("xil ·")}{' '}{o.total_quantity} {tr("ta")}</> : '—'}
                  </TableCell>
                  <TableCell>
                    <DueDate order={o} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {formatMoney(o.total_amount, o.currency)}
                  </TableCell>
                  <TableCell>
                    <OrderStatusChip status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
              {!loading && orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 8 : 7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {search || status ? tr("Filtrlarga mos buyurtma topilmadi") : tr("Hali buyurtmalar yo'q. Mijozlar katalogdan to'lagan buyurtmalar shu yerda paydo bo'ladi.")}
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
      <CreateOrderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(o) => {
          setCreateOpen(false);
          navigate(`/orders/${o.id}`);
        }}
      />
    </>
  );
}

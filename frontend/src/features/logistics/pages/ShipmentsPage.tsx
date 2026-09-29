import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
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
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { logisticsApi } from '../api';
import ShipmentStatusChip from '../components/ShipmentStatusChip';
import { SHIPMENT_STATUS_LABELS } from '../constants';
import type { FgSummary, Shipment, ShipmentStatus } from '../types';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

type Tab = 'late' | ShipmentStatus | '';

const day = (v: string | null) => (v ? formatDate(v.length === 10 ? `${v}T00:00:00` : v) : '—');

export default function ShipmentsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<FgSummary | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        logisticsApi.shipments({ search: search.trim(), late: tab === 'late', status: tab === 'late' ? '' : tab, offset: page * rowsPerPage, limit: rowsPerPage }),
        logisticsApi.summary(),
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
    ['', tr("Barchasi")],
    ['PREPARING', `${SHIPMENT_STATUS_LABELS.PREPARING} · ${summary?.shipments_preparing ?? 0}`],
    ['SHIPPED', `${SHIPMENT_STATUS_LABELS.SHIPPED} · ${summary?.shipments_in_transit ?? 0}`],
    ['late', tr("Kechikayotgan · {0}", summary?.shipments_late ?? 0)],
    ['DELIVERED', SHIPMENT_STATUS_LABELS.DELIVERED],
    ['CANCELLED', SHIPMENT_STATUS_LABELS.CANCELLED],
  ];
  const transport = (s: Shipment) => [s.carrier, s.vehicle_no, s.driver_name].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader title={tr("Jo'natmalar")} subtitle={tr("Buyurtmalarni mijozga yetkazish: tayyorlash → yo'lga chiqarish → yetkazildi. Yangi jo'natma buyurtma sahifasidan yaratiladi.")} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {tabs.map(([key, label]) => (
          <Chip key={key || 'all'} label={label} color={tab === key ? (key === 'late' ? 'error' : 'primary') : 'default'} variant={tab === key ? 'filled' : 'outlined'} onClick={() => setTab(key)} />
        ))}
      </Box>
      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("SH raqami, buyurtma, mijoz, mashina, trek...")}
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
            {items.map((s) => (
              <MobileListItem
                key={s.id}
                onClick={() => navigate(`/shipments/${s.id}`)}
                overline={`${s.number} · ${s.order_number ?? ''}`}
                title={s.customer_name}
                subtitle={[tr("{0} dona", s.total_quantity), transport(s), s.shipped_at ? tr("jo'natildi {0}", day(s.shipped_at)) : s.planned_date ? tr("reja {0}", day(s.planned_date)) : null].filter(Boolean).join(' · ')}
                trailing={<ShipmentStatusChip sh={s} />}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Jo'natmalar yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 960 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Raqam")}</TableCell>
                  <TableCell>{tr("Buyurtma / mijoz")}</TableCell>
                  <TableCell align="right">{tr("Dona")}</TableCell>
                  <TableCell>{tr("Transport")}</TableCell>
                  <TableCell>{tr("Reja")}</TableCell>
                  <TableCell>{tr("Jo'natildi / yetkazildi")}</TableCell>
                  <TableCell>{tr("Holati")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={7} />}
                {items.map((s) => (
                  <TableRow key={s.id} hover onClick={() => navigate(`/shipments/${s.id}`)} sx={{ cursor: 'pointer', bgcolor: s.is_late ? 'rgba(211,47,47,0.05)' : undefined }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{s.number}</TableCell>
                    <TableCell>
                      {s.order_number}
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 220 }}>
                        {s.customer_name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {s.total_quantity}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{transport(s) || '—'}</Typography>
                      {s.tracking_no && (
                        <Typography variant="caption" color="text.secondary">
                          {tr("Trek:")}{' '}{s.tracking_no}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{day(s.planned_date)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {day(s.shipped_at)}
                      {s.delivered_at && (
                        <Typography variant="body2" color="success.main">
                          {day(s.delivered_at)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusChip sh={s} />
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Jo'natmalar yo'q. Buyurtma sahifasida «Jo'natma tayyorlash» tugmasini bosing.")}
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
    </>
  );
}

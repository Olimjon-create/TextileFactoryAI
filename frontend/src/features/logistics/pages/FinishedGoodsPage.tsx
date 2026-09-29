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
  Link,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import AddIcon from '@mui/icons-material/Add';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { inventoryApi } from '@/features/inventory/api';
import type { WarehouseLocation } from '@/features/inventory/types';
import { getErrorMessage } from '@/shared/api/client';
import ExportButton from '@/shared/components/ExportButton';
import FilterBar from '@/shared/components/FilterBar';
import { fetchAll } from '@/shared/utils/csv';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { logisticsApi } from '../api';
import FgMovementDialog from '../components/FgMovementDialog';
import { FG_MOVEMENT_COLORS, FG_MOVEMENT_LABELS, variantLabel } from '../constants';
import { useLogisticsPermissions } from '../permissions';
import type { FgMovement, FgMovementInput, FgSummary, ProductMovementType, StockRow } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

type View = 'stock' | 'movements';

function Source({ m }: { m: FgMovement }) {
  if (m.work_order_id)
    return (
      <Link component={RouterLink} to={`/production/${m.work_order_id}`} onClick={(e) => e.stopPropagation()}>
        {m.work_order_number}
      </Link>
    );
  if (m.shipment_id)
    return (
      <Link component={RouterLink} to={`/shipments/${m.shipment_id}`} onClick={(e) => e.stopPropagation()}>
        {m.shipment_number}
      </Link>
    );
  if (m.order_id)
    return (
      <Link component={RouterLink} to={`/orders/${m.order_id}`} onClick={(e) => e.stopPropagation()}>
        {m.order_number}
      </Link>
    );
  return <>—</>;
}

const signed = (q: number) => `${q > 0 ? '+' : q < 0 ? '−' : ''}${Math.abs(q)}`;

export default function FinishedGoodsPage() {
  const isMobile = useIsMobile();
  const { canEdit } = useLogisticsPermissions();
  const [view, setView] = useState<View>('stock');
  const [summary, setSummary] = useState<FgSummary | null>(null);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [moves, setMoves] = useState<FgMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [type, setType] = useState<ProductMovementType | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ row: StockRow | null; kind: FgMovementInput } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const common = { search: search.trim(), location_id: locationId, offset: page * rowsPerPage, limit: rowsPerPage };
      const [sum, res] = await Promise.all([
        logisticsApi.summary(),
        view === 'stock' ? logisticsApi.stock(common) : logisticsApi.movements({ ...common, movement_type: type }),
      ]);
      setSummary(sum);
      if (view === 'stock') setStock(res.items as StockRow[]);
      else setMoves(res.items as FgMovement[]);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [view, search, locationId, type, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [view, search, locationId, type, rowsPerPage]);
  useEffect(() => {
    inventoryApi.locations().then(setLocations).catch(() => undefined);
  }, []);

  const where = (r: StockRow) => r.locations.map((l) => `${l.location.code}: ${l.quantity}`).join(' · ');

  return (
    <>
      <PageHeader
        title={tr("Tayyor mahsulot ombori")}
        subtitle={tr("Sotuvga tayyor mahsulot: kirim, joylar bo'yicha qoldiq, ko'chirish, jo'natma va inventarizatsiya")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <ExportButton
              name="tayyor-mahsulot-qoldigi"
              headers={['Kod', 'Mahsulot', "O'lcham", 'Rang', 'Joylar', 'Qoldiq (dona)', 'Narxi', 'Qiymati']}
              load={async () =>
                (await fetchAll((offset, limit) => logisticsApi.stock({ search: search.trim(), location_id: locationId, offset, limit }))).map((r) => [
                  r.product.code,
                  r.product.name,
                  r.size,
                  r.color,
                  where(r),
                  r.quantity,
                  r.unit_price,
                  r.value,
                ])
              }
            />
            {canEdit && (
              <>
                <Button variant="outlined" startIcon={<TuneIcon />} onClick={() => setDialog({ row: null, kind: 'ADJUSTMENT' })}>
                  {tr("Boshqa amallar")}
                </Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ row: null, kind: 'RECEIPT' })}>
                  {tr("Kirim")}
                </Button>
              </>
            )}
          </Box>
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatCard label={tr("Omborda (dona)")} value={summary?.units ?? '—'} icon={<Inventory2OutlinedIcon />} hint={summary ? tr("{0} ta variant", summary.skus) : undefined} />
        <StatCard label={tr("Sotuv narxida qiymati")} value={summary ? formatMoney(summary.value) : '—'} icon={<PaymentsOutlinedIcon />} color="success.main" />
        <StatCard label={tr("30 kunda qabul qilindi")} value={summary?.received_30d ?? '—'} icon={<MoveToInboxOutlinedIcon />} color="info.main" />
        <StatCard
          label={tr("30 kunda jo'natildi")}
          value={summary?.shipped_30d ?? '—'}
          icon={<LocalShippingOutlinedIcon />}
          color="warning.main"
          hint={summary ? tr("Yo'lda: {0} jo'natma", summary.shipments_in_transit) : undefined}
        />
      </Box>

      <Card>
        <Tabs value={view} onChange={(_, v) => setView(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="stock" label={tr("Qoldiq")} />
          <Tab value="movements" label={tr("Harakatlar")} />
        </Tabs>
        <FilterBar>
          <TextField
            placeholder={view === 'stock' ? tr("Mahsulot, kod, o'lcham, rang...") : tr("Mahsulot, WO, jo'natma, buyurtma...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 240px', maxWidth: 360 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Joy")} value={locationId} onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {locations.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.code} — {l.name}
              </MenuItem>
            ))}
          </TextField>
          {view === 'movements' && (
            <TextField select label={tr("Turi")} value={type} onChange={(e) => setType(e.target.value as ProductMovementType | '')} sx={{ width: 200 }}>
              <MenuItem value="">{tr("Barchasi")}</MenuItem>
              {(Object.keys(FG_MOVEMENT_LABELS) as ProductMovementType[]).map((t) => (
                <MenuItem key={t} value={t}>
                  {FG_MOVEMENT_LABELS[t]}
                </MenuItem>
              ))}
            </TextField>
          )}
        </FilterBar>
        {loading && <LinearProgress />}

        {view === 'stock' &&
          (isMobile ? (
            <Box>
              {loading && stock.length === 0 && <MobileListSkeleton />}
              {stock.map((r) => (
                <MobileListItem
                  key={`${r.product.id}-${r.size}-${r.color}`}
                  overline={r.product.code}
                  title={`${r.product.name}${variantLabel(r.size, r.color) ? ` (${variantLabel(r.size, r.color)})` : ''}`}
                  subtitle={where(r)}
                  trailing={<Typography sx={{ fontWeight: 700 }}>{r.quantity} {tr("dona")}</Typography>}
                  onClick={canEdit ? () => setDialog({ row: r, kind: 'TRANSFER' }) : undefined}
                />
              ))}
              {!loading && stock.length === 0 && <MobileListEmpty>{tr("Omborda tayyor mahsulot yo'q")}</MobileListEmpty>}
            </Box>
          ) : (
            <TableContainer>
              <Table sx={{ minWidth: 820 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{tr("Mahsulot")}</TableCell>
                    <TableCell>{tr("O'lcham / rang")}</TableCell>
                    <TableCell>{tr("Joylar")}</TableCell>
                    <TableCell align="right">{tr("Qoldiq")}</TableCell>
                    <TableCell align="right">{tr("Qiymati")}</TableCell>
                    {canEdit && <TableCell />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && stock.length === 0 && <TableRowsSkeleton cols={canEdit ? 6 : 5} />}
                  {stock.map((r) => (
                    <TableRow key={`${r.product.id}-${r.size}-${r.color}`} hover>
                      <TableCell>
                        <Link component={RouterLink} to={`/products/${r.product.id}`} sx={{ fontWeight: 600 }}>
                          {r.product.name}
                        </Link>
                        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                          {r.product.code}
                        </Typography>
                      </TableCell>
                      <TableCell>{variantLabel(r.size, r.color) || '—'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {r.locations.map((l) => (
                            <Chip key={l.location.id} size="small" variant="outlined" label={`${l.location.code}: ${l.quantity}`} />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {r.quantity} {tr("dona")}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {formatMoney(r.value)}
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right">
                          <Tooltip title={tr("Ko'chirish, hisobdan chiqarish, inventarizatsiya")}>
                            <IconButton size="small" onClick={() => setDialog({ row: r, kind: 'TRANSFER' })}>
                              <TuneIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {!loading && stock.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        {tr("Omborda tayyor mahsulot yo'q. «Kirim» tugmasi bilan mavjud mahsulotni kiriting — o'zingiz ishlab chiqargani esa ish buyurtmasidagi «Omborga topshirish» orqali avtomatik tushadi.")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          ))}

        {view === 'movements' &&
          (isMobile ? (
            <Box>
              {loading && moves.length === 0 && <MobileListSkeleton />}
              {moves.map((m) => (
                <MobileListItem
                  key={m.id}
                  overline={`${formatDateTime(m.created_at)} · ${m.location.code}`}
                  title={`${m.product.name}${variantLabel(m.size, m.color) ? ` (${variantLabel(m.size, m.color)})` : ''}`}
                  subtitle={[m.work_order_number, m.shipment_number, m.order_number, m.note, m.created_by_name].filter(Boolean).join(' · ') || undefined}
                  trailing={
                    <Typography sx={{ fontWeight: 700, color: m.quantity > 0 ? 'success.main' : 'error.main' }}>
                      {signed(m.quantity)}
                    </Typography>
                  }
                  meta={<Chip size="small" variant="outlined" color={FG_MOVEMENT_COLORS[m.movement_type]} label={FG_MOVEMENT_LABELS[m.movement_type]} />}
                />
              ))}
              {!loading && moves.length === 0 && <MobileListEmpty>{tr("Harakatlar yo'q")}</MobileListEmpty>}
            </Box>
          ) : (
            <TableContainer>
              <Table sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{tr("Sana")}</TableCell>
                    <TableCell>{tr("Turi")}</TableCell>
                    <TableCell>{tr("Mahsulot")}</TableCell>
                    <TableCell>{tr("Joy")}</TableCell>
                    <TableCell align="right">{tr("Miqdor")}</TableCell>
                    <TableCell>{tr("Hujjat")}</TableCell>
                    <TableCell>{tr("Kim / izoh")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && moves.length === 0 && <TableRowsSkeleton cols={7} />}
                  {moves.map((m) => (
                    <TableRow key={m.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.created_at)}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color={FG_MOVEMENT_COLORS[m.movement_type]} label={FG_MOVEMENT_LABELS[m.movement_type]} />
                      </TableCell>
                      <TableCell>
                        {m.product.name}
                        <Typography variant="body2" color="text.secondary">
                          {[m.product.code, m.size, m.color].filter(Boolean).join(' · ')}
                        </Typography>
                      </TableCell>
                      <TableCell>{m.location.code}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: m.quantity > 0 ? 'success.main' : 'error.main' }}>
                        {signed(m.quantity)}
                      </TableCell>
                      <TableCell>
                        <Source m={m} />
                      </TableCell>
                      <TableCell>
                        {m.created_by_name ?? '—'}
                        {m.note && (
                          <Typography variant="body2" color="text.secondary">
                            {m.note}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && moves.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                        {tr("Harakatlar yo'q")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          ))}
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
      <FgMovementDialog
        open={!!dialog}
        row={dialog?.row}
        initialKind={dialog?.kind}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          load();
        }}
      />
    </>
  );
}

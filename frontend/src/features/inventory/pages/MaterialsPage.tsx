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
import SwapVertIcon from '@mui/icons-material/SwapVert';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import RemoveShoppingCartOutlinedIcon from '@mui/icons-material/RemoveShoppingCartOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { keysOf, MATERIAL_TYPE_LABELS, MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import type { MaterialType } from '@/features/products/types';
import { getErrorMessage } from '@/shared/api/client';
import ExportButton from '@/shared/components/ExportButton';
import FilterBar from '@/shared/components/FilterBar';
import { fetchAll } from '@/shared/utils/csv';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import type { Factory } from '@/shared/types';
import { formatMoney } from '@/shared/utils/money';
import { inventoryApi } from '../api';
import MaterialFormDialog from '../components/MaterialFormDialog';
import MovementFormDialog from '../components/MovementFormDialog';
import { formatQty, STOCK_STATE_LABELS } from '../constants';
import { useCanEditInventory } from '../permissions';
import type { InventorySummary, Material, StockState } from '../types';
import { tr } from '@/i18n';

function StockCell({ m }: { m: Material }) {
  const unit = MATERIAL_UNIT_LABELS[m.unit];
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
      {m.stock <= 0 ? (
        <Chip size="small" color="error" label={tr("Tugagan")} />
      ) : m.is_low ? (
        <Chip size="small" color="warning" label={tr("Kam")} />
      ) : null}
      <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
        {formatQty(m.stock)} {unit}
      </Typography>
    </Box>
  );
}

export default function MaterialsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canEdit = useCanEditInventory();
  const isMobile = useIsMobile();

  const [items, setItems] = useState<Material[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<MaterialType | ''>('');
  const [stockState, setStockState] = useState<StockState | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [movement, setMovement] = useState<{ open: boolean; material: Material | null }>({ open: false, material: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, sum] = await Promise.all([
        inventoryApi.materials({
          search: search.trim(),
          material_type: type,
          stock_state: stockState,
          is_active: showInactive ? false : true,
          factory_id: factoryId,
          offset: page * rowsPerPage,
          limit: rowsPerPage,
        }),
        inventoryApi.summary(factoryId),
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
  }, [search, type, stockState, showInactive, factoryId, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => setPage(0), [search, type, stockState, showInactive, factoryId, rowsPerPage]);

  useEffect(() => {
    if (isSuperAdmin) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [isSuperAdmin]);

  const openMovement = (material: Material | null) => setMovement({ open: true, material });
  const filtered = search || type || stockState || showInactive;

  const exportRows = async () =>
    (
      await fetchAll((offset, limit) =>
        inventoryApi.materials({ search: search.trim(), material_type: type, stock_state: stockState, is_active: !showInactive, factory_id: factoryId, offset, limit }),
      )
    ).map((m) => [
      m.code,
      m.name,
      MATERIAL_TYPE_LABELS[m.material_type],
      m.color,
      m.factory_name,
      m.stock,
      MATERIAL_UNIT_LABELS[m.unit],
      m.min_stock,
      m.unit_cost,
      m.stock_value,
    ]);

  return (
    <>
      <PageHeader
        title={tr("Materiallar")}
        subtitle={tr("Ombordagi materiallar katalogi va real qoldiq")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <ExportButton
              name="materiallar"
              headers={['Kod', 'Material', 'Turi', 'Rang', 'Fabrika', 'Qoldiq', "O'lchov", 'Minimal', 'Tannarx', 'Qiymati']}
              load={exportRows}
            />
            {canEdit && (
              <>
                <Button variant="outlined" startIcon={<SwapVertIcon />} onClick={() => openMovement(null)}>
                  {tr("Kirim / chiqim")}
                </Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
                  {tr("Yangi material")}
                </Button>
              </>
            )}
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatCard label={tr("Faol materiallar")} value={summary?.materials_count ?? '—'} icon={<Inventory2OutlinedIcon />} />
        <StatCard label={tr("Kam qolgan")} value={summary?.low_stock_count ?? '—'} icon={<WarningAmberOutlinedIcon />} color="warning.main" />
        <StatCard label={tr("Tugagan")} value={summary?.out_of_stock_count ?? '—'} icon={<RemoveShoppingCartOutlinedIcon />} color="error.main" />
        <StatCard label={tr("Ombor qiymati")} value={summary ? formatMoney(summary.stock_value) : '—'} icon={<PaymentsOutlinedIcon />} color="success.main" />
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip label={tr("Barchasi")} color={stockState === '' ? 'primary' : 'default'} onClick={() => setStockState('')} />
        {keysOf(STOCK_STATE_LABELS).map((s) => (
          <Chip
            key={s}
            label={STOCK_STATE_LABELS[s]}
            color={stockState === s ? (s === 'out' ? 'error' : s === 'low' ? 'warning' : 'primary') : 'default'}
            variant={stockState === s ? 'filled' : 'outlined'}
            onClick={() => setStockState(s)}
          />
        ))}
        <Chip label={tr("Nofaollar")} variant={showInactive ? 'filled' : 'outlined'} color={showInactive ? 'default' : 'default'} onClick={() => setShowInactive((v) => !v)} />
      </Box>

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Kod, nom yoki rang...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 260px', maxWidth: 360 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Turi")} value={type} onChange={(e) => setType(e.target.value as MaterialType | '')} sx={{ width: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {keysOf(MATERIAL_TYPE_LABELS).map((t) => (
              <MenuItem key={t} value={t}>
                {MATERIAL_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>
          {isSuperAdmin && (
            <TextField
              select
              label={tr("Fabrika")}
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ width: 200 }}
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
            {loading && items.length === 0 && <MobileListSkeleton />}
            {items.map((m) => (
              <MobileListItem
                key={m.id}
                onClick={() => navigate(`/inventory/materials/${m.id}`)}
                overline={`${m.code} · ${MATERIAL_TYPE_LABELS[m.material_type]}`}
                title={m.name}
                subtitle={[m.color, isSuperAdmin ? m.factory_name : null].filter(Boolean).join(' · ') || undefined}
                trailing={<StockCell m={m} />}
                meta={
                  <Typography variant="caption" color="text.secondary">
                    {tr("Min:")}{' '}{formatQty(m.min_stock)} · {m.stock_value !== null ? formatMoney(m.stock_value) : tr("narx yo'q")}
                  </Typography>
                }
              />
            ))}
            {!loading && items.length === 0 && (
              <MobileListEmpty>{filtered ? tr("Filtrlarga mos material topilmadi") : tr("Katalog bo'sh. «Yangi material» orqali qo'shing.")}</MobileListEmpty>
            )}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Kod")}</TableCell>
                  <TableCell>{tr("Material")}</TableCell>
                  <TableCell>{tr("Turi")}</TableCell>
                  {isSuperAdmin && <TableCell>{tr("Fabrika")}</TableCell>}
                  <TableCell align="right">{tr("Qoldiq")}</TableCell>
                  <TableCell align="right">{tr("Minimal")}</TableCell>
                  <TableCell align="right">{tr("Tannarx")}</TableCell>
                  <TableCell align="right">{tr("Qiymati")}</TableCell>
                  {canEdit && <TableCell align="right" />}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={8} />}
                {items.map((m) => (
                  <TableRow
                    key={m.id}
                    hover
                    onClick={() => navigate(`/inventory/materials/${m.id}`)}
                    sx={{ cursor: 'pointer', opacity: m.is_active ? 1 : 0.6 }}
                  >
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{m.code}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{m.name}</Typography>
                      {m.color && (
                        <Typography variant="body2" color="text.secondary">
                          {m.color}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>{MATERIAL_TYPE_LABELS[m.material_type]}</TableCell>
                    {isSuperAdmin && <TableCell>{m.factory_name}</TableCell>}
                    <TableCell align="right">
                      <StockCell m={m} />
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {m.min_stock ? `${formatQty(m.min_stock)} ${MATERIAL_UNIT_LABELS[m.unit]}` : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{m.unit_cost !== null ? formatMoney(m.unit_cost) : '—'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {m.stock_value !== null ? formatMoney(m.stock_value) : '—'}
                    </TableCell>
                    {canEdit && (
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        <Tooltip title={tr("Kirim / chiqim")}>
                          <IconButton size="small" onClick={() => openMovement(m)}>
                            <MoveToInboxOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {filtered ? tr("Filtrlarga mos material topilmadi") : tr("Katalog bo'sh. «Yangi material» orqali mato, ip, tugma va boshqa materiallarni qo'shing.")}
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

      <MaterialFormDialog
        open={formOpen}
        material={null}
        onClose={() => setFormOpen(false)}
        onSaved={(m) => {
          setFormOpen(false);
          navigate(`/inventory/materials/${m.id}`);
        }}
      />
      <MovementFormDialog
        open={movement.open}
        material={movement.material}
        onClose={() => setMovement({ open: false, material: null })}
        onSaved={() => {
          setMovement({ open: false, material: null });
          load();
        }}
      />
    </>
  );
}

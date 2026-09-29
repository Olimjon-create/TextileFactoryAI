import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, InputAdornment, LinearProgress, MenuItem, TablePagination, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import PageHeader from '@/shared/components/PageHeader';
import { inventoryApi } from '../api';
import MovementFormDialog from '../components/MovementFormDialog';
import MovementsTable from '../components/MovementsTable';
import { MOVEMENT_TYPE_LABELS, MOVEMENT_TYPES } from '../constants';
import { useCanEditInventory } from '../permissions';
import type { Movement, MovementType, WarehouseLocation } from '../types';
import { tr } from '@/i18n';

export default function MovementsPage() {
  const canEdit = useCanEditInventory();
  const [items, setItems] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<MovementType | ''>('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.movements({
        search: search.trim(),
        movement_type: type,
        location_id: locationId,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        offset: page * rowsPerPage,
        limit: rowsPerPage,
      });
      setItems(res.items);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, type, locationId, dateFrom, dateTo, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [search, type, locationId, dateFrom, dateTo, rowsPerPage]);
  useEffect(() => {
    inventoryApi.locations(true).then(setLocations).catch(() => undefined);
  }, []);

  const filtered = search || type || locationId || dateFrom || dateTo;

  return (
    <>
      <PageHeader
        title={tr("Kirim-chiqim jurnali")}
        subtitle={tr("Ombordagi har bir harakat: kim, qachon, qancha va qaysi hujjat bilan")}
        action={
          canEdit && (
            <Button variant="contained" startIcon={<SwapVertIcon />} onClick={() => setFormOpen(true)}>
              {tr("Yangi harakat")}
            </Button>
          )
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Material, hujjat raqami yoki izoh...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 260px', maxWidth: 340 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Turi")} value={type} onChange={(e) => setType(e.target.value as MovementType | '')} sx={{ width: 200 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {MOVEMENT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {MOVEMENT_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={tr("Joy")}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
            sx={{ width: 180 }}
          >
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {locations.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.code} — {l.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField type="date" label={tr("Dan")} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} sx={{ width: 160 }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label={tr("Gacha")} value={dateTo} onChange={(e) => setDateTo(e.target.value)} sx={{ width: 160 }} slotProps={{ inputLabel: { shrink: true } }} />
        </FilterBar>
        {loading && <LinearProgress />}
        <MovementsTable
          movements={items}
          loading={loading}
          emptyText={filtered ? tr("Filtrlarga mos harakat topilmadi") : tr("Hali harakat yo'q. «Yangi harakat» orqali birinchi kirimni kiriting.")}
        />
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
      <MovementFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => {
          setFormOpen(false);
          load();
        }}
      />
    </>
  );
}

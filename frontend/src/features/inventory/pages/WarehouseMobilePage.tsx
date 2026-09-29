import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import CameraScanner from '@/shared/components/CameraScanner';
import PageHeader from '@/shared/components/PageHeader';
import { useToast } from '@/shared/components/Toast';
import { inventoryApi } from '../api';
import type { Material, MaterialDetail, MovementInput, WarehouseLocation } from '../types';
import { intlLocale, tr } from '@/i18n';

type Operation = Extract<MovementInput, 'RECEIPT' | 'ISSUE' | 'TRANSFER' | 'ADJUSTMENT'>;

const OPERATIONS: { value: Operation; label: string; icon: ReactNode; color: 'success' | 'warning' | 'info' | 'secondary' }[] = [
  { value: 'RECEIPT', label: tr('Kirim'), icon: <SouthWestIcon />, color: 'success' },
  { value: 'ISSUE', label: tr('Chiqim'), icon: <NorthEastIcon />, color: 'warning' },
  { value: 'TRANSFER', label: tr("Ko'chirish"), icon: <SwapHorizIcon />, color: 'info' },
  { value: 'ADJUSTMENT', label: tr('Sanash'), icon: <FactCheckOutlinedIcon />, color: 'secondary' },
];

const num = (v: number) => v.toLocaleString(intlLocale(), { maximumFractionDigits: 3 });

export default function WarehouseMobilePage() {
  const toast = useToast();
  const [operation, setOperation] = useState<Operation>('RECEIPT');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Material[]>([]);
  const [locationId, setLocationId] = useState<number | ''>('');
  const [toLocationId, setToLocationId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [scanning, setScanning] = useState<'material' | 'location' | 'to' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inventoryApi.locations().then(setLocations).catch((e) => setError(getErrorMessage(e)));
  }, []);

  const openMaterial = useCallback(async (id: number) => {
    setError('');
    try {
      const detail = await inventoryApi.material(id);
      setMaterial(detail);
      setResults([]);
      setSearch('');
      setQuantity('');
      const withStock = detail.locations.find((l) => l.quantity > 0);
      setLocationId((cur) => cur || withStock?.location_id || '');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  const findByText = useCallback(async (text: string) => {
    const value = text.trim();
    if (!value) return;
    const res = await inventoryApi.materials({ search: value, limit: 20 });
    const exact = res.items.find((m) => m.code.toLowerCase() === value.toLowerCase());
    if (exact) return openMaterial(exact.id);
    if (res.items.length === 1) return openMaterial(res.items[0].id);
    setResults(res.items);
    if (!res.items.length) setError(tr('«{0}» bo\'yicha material topilmadi', value));
  }, [openMaterial]);

  const handleCode = useCallback(async (raw: string) => {
    const target = scanning;
    setScanning(null);
    setError('');
    const value = raw.trim();
    const loc = /^TCL:(\d+)$/i.exec(value);
    const mat = /^TCM:(\d+)$/i.exec(value);
    if (loc) {
      const id = Number(loc[1]);
      if (!locations.some((l) => l.id === id)) {
        setError(tr('Bu ombor joyi topilmadi'));
        return;
      }
      if (target === 'to') setToLocationId(id);
      else setLocationId(id);
      return;
    }
    if (mat) return openMaterial(Number(mat[1]));
    try {
      await findByText(value);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [scanning, locations, openMaterial, findByText]);

  useEffect(() => {
    if (search.trim().length < 2 || material) return;
    const t = setTimeout(() => findByText(search).catch(() => undefined), 350);
    return () => clearTimeout(t);
  }, [search, material, findByText]);

  const stockAt = (id: number | '') => material?.locations.find((l) => l.location_id === id)?.quantity ?? 0;
  const qty = Number(quantity.replace(',', '.'));
  const cost = unitCost ? Number(unitCost.replace(/\s/g, '').replace(',', '.')) : null;
  const unit = material ? MATERIAL_UNIT_LABELS[material.unit] : '';
  const valid =
    !!material && locationId !== '' && Number.isFinite(qty) &&
    (operation === 'ADJUSTMENT' ? qty >= 0 : qty > 0) &&
    (operation !== 'TRANSFER' || (toLocationId !== '' && toLocationId !== locationId)) &&
    (operation !== 'ISSUE' && operation !== 'TRANSFER' ? true : qty <= stockAt(locationId));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !material) return;
    setBusy(true);
    setError('');
    try {
      await inventoryApi.createMovement({
        movement_type: operation,
        material_id: material.id,
        location_id: locationId,
        to_location_id: operation === 'TRANSFER' ? Number(toLocationId) : null,
        quantity: qty,
        unit_cost: operation === 'RECEIPT' && cost ? cost : null,
        note: tr('Omborchi rejimi'),
      });
      toast.success(tr('{0}: {1} {2} saqlandi', OPERATIONS.find((o) => o.value === operation)!.label, num(qty), unit));
      setQuantity('');
      setUnitCost('');
      setMaterial(await inventoryApi.material(material.id));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const op = OPERATIONS.find((o) => o.value === operation)!;

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto' }}>
      <PageHeader title={tr('Omborchi rejimi')} subtitle={tr('QR kodni skanerlang yoki materialni qidiring — kirim, chiqim, ko\'chirish va sanash')} />

      <ToggleButtonGroup exclusive fullWidth value={operation} onChange={(_, v) => v && setOperation(v)} sx={{ mb: 2, '& .MuiToggleButton-root': { py: 1.5, flexDirection: 'column', gap: 0.5, fontWeight: 700 } }}>
        {OPERATIONS.map((o) => (
          <ToggleButton key={o.value} value={o.value} color={o.color}>
            {o.icon}
            {o.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {!material ? (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Button fullWidth size="large" variant="contained" startIcon={<QrCodeScannerIcon />} onClick={() => setScanning('material')} sx={{ py: 2, mb: 2, fontSize: 17 }}>
              {tr('Materialni skanerlash')}
            </Button>
            <TextField
              fullWidth
              placeholder={tr('yoki material kodi / nomi')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCode(search);
                }
              }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
            />
            {results.length > 0 && (
              <List dense sx={{ mt: 1 }}>
                {results.map((m) => (
                  <ListItemButton key={m.id} onClick={() => openMaterial(m.id)}>
                    <ListItemText primary={m.name} secondary={`${m.code} · ${num(m.stock)} ${MATERIAL_UNIT_LABELS[m.unit]}`} />
                  </ListItemButton>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="h6" sx={{ lineHeight: 1.25 }}>{material.name}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {material.code} · {tr('Jami')}: <b>{num(material.stock)} {unit}</b>
                </Typography>
              </Box>
              <IconButton onClick={() => { setMaterial(null); setQuantity(''); }} aria-label={tr('Boshqa material')}>
                <CloseIcon />
              </IconButton>
            </Box>
            {material.locations.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
                {material.locations.map((l) => (
                  <Chip key={l.location_id} size="small" variant={l.location_id === locationId ? 'filled' : 'outlined'} color={l.location_id === locationId ? 'primary' : 'default'}
                    label={`${l.location_code}: ${num(l.quantity)}`} onClick={() => setLocationId(l.location_id)} />
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {material && (
        <Card component="form" onSubmit={submit}>
          <CardContent sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField select fullWidth label={operation === 'TRANSFER' ? tr('Qayerdan') : tr('Ombor joyi')} value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>{l.code} — {l.name} ({num(stockAt(l.id))})</MenuItem>
                ))}
              </TextField>
              <IconButton onClick={() => setScanning('location')} aria-label={tr('Joyni skanerlash')} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
                <QrCodeScannerIcon />
              </IconButton>
            </Box>
            {operation === 'TRANSFER' && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField select fullWidth label={tr('Qayerga')} value={toLocationId} onChange={(e) => setToLocationId(Number(e.target.value))}>
                  {locations.filter((l) => l.id !== locationId).map((l) => (
                    <MenuItem key={l.id} value={l.id}>{l.code} — {l.name}</MenuItem>
                  ))}
                </TextField>
                <IconButton onClick={() => setScanning('to')} aria-label={tr('Joyni skanerlash')} sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  <QrCodeScannerIcon />
                </IconButton>
              </Box>
            )}
            <TextField
              label={operation === 'ADJUSTMENT' ? tr('Haqiqiy sanalgan miqdor') : tr('Miqdor')}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              autoFocus
              helperText={
                operation === 'ADJUSTMENT'
                  ? tr('Dasturda: {0} {1} — farq avtomatik tuzatiladi', num(stockAt(locationId)), unit)
                  : operation !== 'RECEIPT'
                    ? tr('Bu joyda bor: {0} {1}', num(stockAt(locationId)), unit)
                    : undefined
              }
              error={(operation === 'ISSUE' || operation === 'TRANSFER') && qty > stockAt(locationId)}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment>, sx: { fontSize: 24, fontWeight: 700 } } }}
            />
            {operation === 'RECEIPT' && (
              <TextField label={tr("Narxi (1 birlik, so'm) — ixtiyoriy")} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" />
            )}
            <Button type="submit" size="large" variant="contained" color={op.color} disabled={!valid || busy} startIcon={op.icon} sx={{ py: 1.75, fontSize: 17 }}>
              {busy ? tr('Saqlanmoqda...') : tr('{0}ni saqlash', op.label)}
            </Button>
          </CardContent>
        </Card>
      )}

      {!material && locations.length === 0 && (
        <Card>
          <CardActionArea href="/inventory/locations">
            <CardContent>
              <Typography color="text.secondary">{tr("Avval «Ombor joylari» bo'limida kamida bitta joy yarating.")}</Typography>
            </CardContent>
          </CardActionArea>
        </Card>
      )}

      <CameraScanner open={scanning !== null} onClose={() => setScanning(null)} onResult={handleCode} />
    </Box>
  );
}

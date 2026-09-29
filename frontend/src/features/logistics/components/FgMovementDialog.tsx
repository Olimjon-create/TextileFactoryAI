import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { inventoryApi } from '@/features/inventory/api';
import NoLocationsAlert from '@/features/inventory/components/NoLocationsAlert';
import type { WarehouseLocation } from '@/features/inventory/types';
import { productsApi } from '@/features/products/api';
import type { ProductListItem } from '@/features/products/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { logisticsApi } from '../api';
import { FG_MOVEMENT_INPUTS } from '../constants';
import type { FgMovementInput, StockRow } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  row?: StockRow | null;
  initialKind?: FgMovementInput;
  onClose: () => void;
  onSaved: () => void;
}

export default function FgMovementDialog({ open, row, initialKind = 'RECEIPT', onClose, onSaved }: Props) {
  const [kind, setKind] = useState<FgMovementInput>(initialKind);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [locations, setLocations] = useState<WarehouseLocation[] | null>(null);
  const [product, setProduct] = useState<ProductListItem | null>(null);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [locationId, setLocationId] = useState<number | ''>('');
  const [toLocationId, setToLocationId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<number | null>(null);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setKind(initialKind);
    setQuantity('');
    setNote('');
    setSize(row?.size ?? '');
    setColor(row?.color ?? '');
    setToLocationId('');
    setLocations(null);
    Promise.all([productsApi.list(), inventoryApi.locations()])
      .then(([ps, ls]) => {
        setProducts(ps);
        setLocations(ls);
        setProduct(row ? ps.find((p) => p.id === row.product.id) ?? null : null);
        setLocationId(row?.locations.length === 1 ? row.locations[0].location.id : ls.length === 1 ? ls[0].id : '');
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [open, row, initialKind, save.reset]);

  useEffect(() => {
    if (!open || !product || locationId === '') {
      setCurrent(null);
      return;
    }
    let alive = true;
    logisticsApi
      .stock({ product_id: product.id, location_id: locationId, limit: 200 })
      .then((res) => {
        if (!alive) return;
        const hit = res.items.find((r) => (r.size ?? '') === size && (r.color ?? '') === color);
        setCurrent(hit?.quantity ?? 0);
      })
      .catch(() => alive && setCurrent(null));
    return () => {
      alive = false;
    };
  }, [open, product, locationId, size, color]);

  const qty = Number(quantity);
  const qtyOk = quantity !== '' && Number.isInteger(qty) && (kind === 'ADJUSTMENT' ? qty >= 0 : qty > 0);
  const variantOk = !!product && (!product.sizes.length || !!size) && (!product.colors.length || !!color);
  const isTransfer = kind === 'TRANSFER';
  const overdraw = (kind === 'WRITE_OFF' || isTransfer) && current !== null && qty > current;
  const targetOk = !isTransfer || (toLocationId !== '' && toLocationId !== locationId);
  const valid =
    variantOk && locationId !== '' && targetOk && qtyOk && !overdraw && !(kind === 'ADJUSTMENT' && current !== null && qty === current);
  const hint = FG_MOVEMENT_INPUTS.find((x) => x.value === kind)!.hint;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !product) return;
    setError('');
    try {
      await save.run(() =>
        logisticsApi.createMovement({
          movement_type: kind,
          product_id: product.id,
          size: size || null,
          color: color || null,
          location_id: Number(locationId),
          to_location_id: isTransfer ? Number(toLocationId) : null,
          quantity: qty,
          note: note.trim() || null,
        }),
      );
      toast.success(tr("Tayyor mahsulot ombori yangilandi"));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{tr("Tayyor mahsulot ombori")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {locations?.length === 0 && (
              <NoLocationsAlert
                factoryId={product?.factory_id}
                onCreated={(l) => {
                  setLocations([l]);
                  setLocationId(l.id);
                }}
              />
            )}
            <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_, v) => v && setKind(v)} sx={{ flexWrap: 'wrap' }}>
              {FG_MOVEMENT_INPUTS.map((m) => (
                <ToggleButton key={m.value} value={m.value}>
                  {m.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Typography variant="body2" color="text.secondary">
              {hint}{tr(". O'z ishlab chiqarishingizdan qabul — ish buyurtmasi sahifasida, mijozga jo'natish — «Jo'natmalar» orqali.")}
            </Typography>
            <Autocomplete
              options={products}
              value={product}
              onChange={(_, p) => {
                setProduct(p);
                setSize('');
                setColor('');
              }}
              getOptionLabel={(p) => `${p.code} — ${p.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              renderInput={(params) => <TextField {...params} label={tr("Mahsulot")} required />}
            />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField select label={tr("O'lcham")} value={size} onChange={(e) => setSize(e.target.value)} disabled={!product?.sizes.length}>
                {(product?.sizes ?? []).map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Rang")} value={color} onChange={(e) => setColor(e.target.value)} disabled={!product?.colors.length}>
                {(product?.colors ?? []).map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            {isTransfer && (
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
                <LocationSelect label={tr("Qayerdan")} value={locationId} onChange={setLocationId} locations={locations ?? []} />
                <LocationSelect
                  label={tr("Qayerga")}
                  value={toLocationId}
                  onChange={setToLocationId}
                  locations={(locations ?? []).filter((l) => l.id !== locationId)}
                  helperText={locations && locations.length < 2 ? tr("Ko'chirish uchun kamida 2 ta joy kerak") : undefined}
                />
              </Box>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: isTransfer ? '1fr' : '1fr 1fr' }}>
              {!isTransfer && <LocationSelect label={tr("Ombor joyi")} value={locationId} onChange={setLocationId} locations={locations ?? []} />}
              <TextField
                label={kind === 'ADJUSTMENT' ? tr("Sanoq natijasi (dona)") : tr("Miqdor (dona)")}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="numeric"
                error={(quantity !== '' && !qtyOk) || overdraw}
                helperText={
                  current === null
                    ? undefined
                    : kind === 'ADJUSTMENT' && qtyOk
                      ? tr("Hozir {0} → farq {1}{2}", current, qty - current > 0 ? '+' : '', qty - current)
                      : tr("Joyda hozir: {0} dona", current)
                }
              />
            </Box>
            <TextField label={tr("Izoh")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'WRITE_OFF' ? tr("Sababi") : undefined} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={!valid} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

function LocationSelect({
  label,
  value,
  onChange,
  locations,
  helperText,
}: {
  label: string;
  value: number | '';
  onChange: (id: number) => void;
  locations: WarehouseLocation[];
  helperText?: string;
}) {
  return (
    <TextField select label={label} required value={value} onChange={(e) => onChange(Number(e.target.value))} helperText={helperText}>
      {locations.map((l) => (
        <MenuItem key={l.id} value={l.id}>
          {l.code} — {l.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

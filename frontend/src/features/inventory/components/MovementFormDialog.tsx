import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { inventoryApi } from '../api';
import { formatQty, MOVEMENT_INPUTS } from '../constants';
import type { Material, MaterialDetail, MovementInput, WarehouseLocation } from '../types';
import NoLocationsAlert from './NoLocationsAlert';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  material?: Material | null;
  initialType?: MovementInput;
  onClose: () => void;
  onSaved: () => void;
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));

export default function MovementFormDialog({ open, material: preset, initialType = 'RECEIPT', onClose, onSaved }: Props) {
  const [type, setType] = useState<MovementInput>(initialType);
  const [material, setMaterial] = useState<Material | null>(null);
  const [detail, setDetail] = useState<MaterialDetail | null>(null);
  const [options, setOptions] = useState<Material[]>([]);
  const [query, setQuery] = useState('');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [locationId, setLocationId] = useState<number | ''>('');
  const [toLocationId, setToLocationId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [documentNo, setDocumentNo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setType(initialType);
    setMaterial(preset ?? null);
    setDetail(null);
    setLocationId('');
    setToLocationId('');
    setQuantity('');
    setUnitCost(preset?.unit_cost != null ? String(preset.unit_cost) : '');
    setDocumentNo('');
    setNote('');
  }, [open, preset, initialType, save.reset]);

  useEffect(() => {
    if (!open || preset) return;
    const t = setTimeout(() => {
      inventoryApi
        .materials({ search: query.trim(), is_active: true, limit: 20 })
        .then((r) => setOptions(r.items))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, preset]);

  useEffect(() => {
    if (!material) {
      setDetail(null);
      return;
    }
    inventoryApi.material(material.id).then(setDetail).catch(() => undefined);
    setLocationsLoaded(false);
    inventoryApi
      .locations(false, material.factory_id)
      .then((ls) => {
        setLocations(ls);
        setLocationsLoaded(true);
        if (ls.length === 1) setLocationId(ls[0].id);
      })
      .catch(() => undefined);
    if (!preset) setUnitCost(material.unit_cost != null ? String(material.unit_cost) : '');
  }, [material, preset]);

  const unit = material ? MATERIAL_UNIT_LABELS[material.unit] : '';
  const stockAt = (id: number | '') => detail?.locations.find((l) => l.location_id === id)?.quantity ?? 0;
  const available = stockAt(locationId);
  const qty = num(quantity);
  const cost = num(unitCost);
  const isOut = type === 'ISSUE' || type === 'WRITE_OFF' || type === 'TRANSFER';
  const isAdjust = type === 'ADJUSTMENT';

  const qtyError = useMemo(() => {
    if (quantity === '') return '';
    if (qty === null || !Number.isFinite(qty) || qty < 0 || (!isAdjust && qty === 0)) return tr("To'g'ri miqdor kiriting");
    if (isOut && locationId !== '' && qty > available) return tr("Bu joyda faqat {0} {1} bor", formatQty(available), unit);
    if (isAdjust && locationId !== '' && qty === available) return tr("Joriy qoldiq bilan bir xil — tuzatish kerak emas");
    return '';
  }, [quantity, qty, isAdjust, isOut, locationId, available, unit]);

  const valid =
    !!material &&
    locationId !== '' &&
    quantity !== '' &&
    !qtyError &&
    (type !== 'TRANSFER' || (toLocationId !== '' && toLocationId !== locationId)) &&
    (cost === null || (Number.isFinite(cost) && cost >= 0));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !material) return;
    setError('');
    try {
      await save.run(() =>
        inventoryApi.createMovement({
          movement_type: type,
          material_id: material.id,
          location_id: Number(locationId),
          to_location_id: type === 'TRANSFER' ? Number(toLocationId) : null,
          quantity: qty ?? 0,
          unit_cost: type === 'RECEIPT' || type === 'RETURN' ? cost : null,
          document_no: documentNo.trim() || null,
          note: note.trim() || null,
        }),
      );
      toast.success(tr("{0}: {1} saqlandi", MOVEMENT_INPUTS.find((m) => m.value === type)?.label, material.code));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const hint = MOVEMENT_INPUTS.find((m) => m.value === type)?.hint;

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{tr("Ombor harakati")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={type}
                onChange={(_, v: MovementInput | null) => v && setType(v)}
                sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiToggleButton-root': { borderRadius: '8px !important', border: 1, borderColor: 'divider' } }}
              >
                {MOVEMENT_INPUTS.map((m) => (
                  <ToggleButton key={m.value} value={m.value} sx={{ textTransform: 'none', px: 1.5 }}>
                    {m.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              {hint && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  {hint}
                </Typography>
              )}
            </Box>

            <Autocomplete
              options={preset ? [preset] : options}
              value={material}
              disabled={!!preset}
              onChange={(_, v) => {
                setMaterial(v);
                setLocationId('');
                setToLocationId('');
              }}
              onInputChange={(_, v, reason) => reason === 'input' && setQuery(v)}
              getOptionLabel={(m) => `${m.code} — ${m.name}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(x) => x}
              noOptionsText={tr("Material topilmadi — avval katalogga qo'shing")}
              renderOption={(props, m) => (
                <li {...props} key={m.id}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
                      {m.code} — {m.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {tr("Qoldiq:")}{' '}{formatQty(m.stock)} {MATERIAL_UNIT_LABELS[m.unit]}
                      {m.factory_name ? ` · ${m.factory_name}` : ''}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label={tr("Material")} required placeholder={tr("Kod yoki nom bo'yicha qidiring")} />}
            />

            {material && locationsLoaded && locations.length === 0 && (
              <NoLocationsAlert
                factoryId={material.factory_id}
                onCreated={(l) => {
                  setLocations([l]);
                  setLocationId(l.id);
                }}
              />
            )}

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: type === 'TRANSFER' ? '1fr 1fr' : '1fr' } }}>
              <TextField
                select
                label={type === 'TRANSFER' ? tr("Qayerdan") : tr("Ombor joyi")}
                required
                value={locationId}
                onChange={(e) => setLocationId(Number(e.target.value))}
                disabled={!material}
                helperText={!material ? tr("Avval materialni tanlang") : undefined}
              >
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 2 }}>
                      <span>
                        {l.code} — {l.name}
                      </span>
                      <Typography component="span" variant="body2" color="text.secondary">
                        {formatQty(stockAt(l.id))} {unit}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
              {type === 'TRANSFER' && (
                <TextField select label={tr("Qayerga")} required value={toLocationId} onChange={(e) => setToLocationId(Number(e.target.value))} disabled={!material}>
                  {locations
                    .filter((l) => l.id !== locationId)
                    .map((l) => (
                      <MenuItem key={l.id} value={l.id}>
                        {l.code} — {l.name}
                      </MenuItem>
                    ))}
                </TextField>
              )}
            </Box>

            {material && locationId !== '' && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip size="small" label={tr("Joydagi qoldiq: {0} {1}", formatQty(available), unit)} />
                {qty !== null && !qtyError && quantity !== '' && (
                  <Chip
                    size="small"
                    color="primary"
                    variant="outlined"
                    label={tr("Keyin: {0} {1}", formatQty(isAdjust ? qty : isOut ? available - qty : available + qty), unit)}
                  />
                )}
              </Box>
            )}

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: type === 'RECEIPT' || type === 'RETURN' ? '1fr 1fr' : '1fr' } }}>
              <TextField
                label={isAdjust ? tr("Sanoqdagi haqiqiy qoldiq") : tr("Miqdor")}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                error={!!qtyError}
                helperText={qtyError || (isAdjust ? tr("Farq (ortiqcha/kamomad) avtomatik yoziladi") : undefined)}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }}
              />
              {(type === 'RECEIPT' || type === 'RETURN') && (
                <TextField
                  label={tr("Narx (1 birlik)")}
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  inputMode="decimal"
                  helperText={type === 'RECEIPT' ? tr("Materialning tannarxi yangilanadi") : undefined}
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("so'm")}</InputAdornment> } }}
                />
              )}
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <TextField label={tr("Hujjat raqami")} value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder={tr("Nakladnoy №")} slotProps={{ htmlInput: { maxLength: 50 } }} />
              <TextField label={tr("Izoh")} value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
            </Box>
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

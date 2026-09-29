import { useEffect, useState, type FormEvent } from 'react';
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
  Typography,
} from '@mui/material';
import { inventoryApi } from '@/features/inventory/api';
import type { Material } from '@/features/inventory/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { bomApi } from '../api';
import {
  DEFAULT_MATERIAL_UNIT,
  formatQuantity,
  keysOf,
  MATERIAL_TYPE_LABELS,
  MATERIAL_UNIT_LABELS,
  PRODUCTION_UNIT_LABELS,
} from '../constants';
import type { BOMItem, MaterialType, MaterialUnit, Product } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  product: Product;
  item: BOMItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function BomItemDialog({ open, product, item, onClose, onSaved }: Props) {
  const [materialType, setMaterialType] = useState<MaterialType>('FABRIC');
  const [materialName, setMaterialName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<MaterialUnit>('METER');
  const [waste, setWaste] = useState('0');
  const [notes, setNotes] = useState('');
  const [linked, setLinked] = useState<{ id: number; code: string; label: string } | null>(null);
  const [options, setOptions] = useState<Material[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setMaterialType(item?.material_type ?? 'FABRIC');
    setMaterialName(item?.material_name ?? '');
    setQuantity(item ? String(item.quantity) : '');
    setUnit(item?.unit ?? 'METER');
    setWaste(item ? String(item.waste_percent) : '0');
    setNotes(item?.notes ?? '');
    setLinked(item?.material_id ? { id: item.material_id, code: item.material_code ?? '', label: item.material_name } : null);
    setQuery('');
    setError('');
  }, [open, item, save.reset]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      inventoryApi
        .materials({ search: query.trim(), is_active: true, factory_id: product.factory_id, limit: 20 })
        .then((r) => setOptions(r.items))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, product.factory_id]);

  const pickMaterial = (m: Material | null) => {
    if (!m) {
      setLinked(null);
      return;
    }
    setLinked({ id: m.id, code: m.code, label: m.name });
    setMaterialName(m.name);
    setMaterialType(m.material_type);
    setUnit(m.unit);
  };

  const qty = Number(quantity.replace(',', '.'));
  const wastePct = Number(waste.replace(',', '.') || 0);
  const qtyValid = quantity !== '' && Number.isFinite(qty) && qty > 0 && qty <= 1_000_000;
  const wasteValid = Number.isFinite(wastePct) && wastePct >= 0 && wastePct <= 100;
  const valid = materialName.trim().length >= 2 && qtyValid && wasteValid;

  const handleTypeChange = (type: MaterialType) => {
    setMaterialType(type);
    if (!item) setUnit(DEFAULT_MATERIAL_UNIT[type]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = {
      material_id: linked?.id ?? null,
      material_type: materialType,
      material_name: materialName.trim(),
      quantity: qty,
      unit,
      waste_percent: wastePct,
      notes: notes.trim() || null,
    };
    try {
      await save.run(() => (item ? bomApi.update(product.id, item.id, payload) : bomApi.create(product.id, payload)));
      toast.success(item ? tr("Material saqlandi") : tr("Material qo'shildi"));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{item ? tr("Materialni tahrirlash") : tr("Material qo'shish")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Autocomplete
              options={options}
              value={null}
              onChange={(_, m) => pickMaterial(m)}
              onInputChange={(_, v, reason) => reason === 'input' && setQuery(v)}
              getOptionLabel={(m) => `${m.code} — ${m.name}`}
              filterOptions={(x) => x}
              blurOnSelect
              noOptionsText={tr("Katalogda topilmadi — pastda qo'lda kiriting")}
              renderOption={(props, m) => (
                <li {...props} key={m.id}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }} noWrap>
                      {m.code} — {m.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {MATERIAL_TYPE_LABELS[m.material_type]} {tr("· omborda")}{' '}{formatQuantity(m.stock)} {MATERIAL_UNIT_LABELS[m.unit]}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} label={tr("Ombor katalogidan tanlash")} placeholder={tr("Kod yoki nom")} helperText={tr("Tanlansa ehtiyoj va qoldiq avtomatik hisoblanadi")} />
              )}
            />
            {linked && (
              <Box>
                <Chip
                  color="primary"
                  variant="outlined"
                  label={tr("Katalog: {0} — {1}", linked.code, linked.label)}
                  onDelete={() => setLinked(null)}
                />
              </Box>
            )}
            <TextField select label={tr("Material turi")} value={materialType} disabled={!!linked} onChange={(e) => handleTypeChange(e.target.value as MaterialType)}>
              {keysOf(MATERIAL_TYPE_LABELS).map((t) => (
                <MenuItem key={t} value={t}>
                  {MATERIAL_TYPE_LABELS[t]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={tr("Material nomi / tavsifi")}
              value={materialName}
              onChange={(e) => setMaterialName(e.target.value)}
              required
              disabled={!!linked}
              placeholder={tr("Masalan: Kulirka 100% paxta, 180 g/m²")}
            />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField
                label={tr("Miqdor")}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
                error={quantity !== '' && !qtyValid}
                helperText={tr("1 {0} uchun", PRODUCTION_UNIT_LABELS[product.unit].toLowerCase())}
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              />
              <TextField select label={tr("O'lchov birligi")} value={unit} disabled={!!linked} onChange={(e) => setUnit(e.target.value as MaterialUnit)}>
                {keysOf(MATERIAL_UNIT_LABELS).map((u) => (
                  <MenuItem key={u} value={u}>
                    {MATERIAL_UNIT_LABELS[u]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={tr("Isrof")}
                value={waste}
                onChange={(e) => setWaste(e.target.value)}
                error={!wasteValid}
                helperText="0 – 100"
                slotProps={{
                  htmlInput: { inputMode: 'decimal' },
                  input: { endAdornment: <InputAdornment position="end">%</InputAdornment> },
                }}
              />
            </Box>
            {qtyValid && wasteValid && (
              <Typography variant="body2" color="text.secondary">
                {tr("Isrof bilan jami sarf:")}{' '}<b>{formatQuantity(qty * (1 + wastePct / 100))} {MATERIAL_UNIT_LABELS[unit]}</b>
              </Typography>
            )}
            <TextField label={tr("Izoh")} value={notes} onChange={(e) => setNotes(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
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

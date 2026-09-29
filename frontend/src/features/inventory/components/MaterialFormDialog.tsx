import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { DEFAULT_MATERIAL_UNIT, keysOf, MATERIAL_TYPE_LABELS, MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import type { MaterialType, MaterialUnit } from '@/features/products/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import type { Factory } from '@/shared/types';
import { inventoryApi } from '../api';
import type { MaterialDetail, MaterialPayload } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  material: MaterialDetail | null;
  onClose: () => void;
  onSaved: (material: MaterialDetail) => void;
}

const EMPTY = {
  code: '',
  name: '',
  material_type: 'FABRIC' as MaterialType,
  unit: 'METER' as MaterialUnit,
  color: '',
  min_stock: '',
  unit_cost: '',
  notes: '',
  is_active: true,
  factory_id: '' as number | '',
};

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));

export default function MaterialFormDialog({ open, material, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const needsFactory = user?.role === 'SUPER_ADMIN' && !material;
  const [form, setForm] = useState(EMPTY);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setForm(
      material
        ? {
            code: material.code,
            name: material.name,
            material_type: material.material_type,
            unit: material.unit,
            color: material.color ?? '',
            min_stock: material.min_stock ? String(material.min_stock) : '',
            unit_cost: material.unit_cost !== null ? String(material.unit_cost) : '',
            notes: material.notes ?? '',
            is_active: material.is_active,
            factory_id: material.factory_id,
          }
        : EMPTY,
    );
    if (needsFactory) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [open, material, needsFactory, save.reset]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const minStock = num(form.min_stock);
  const unitCost = num(form.unit_cost);
  const minError = minStock !== null && (!Number.isFinite(minStock) || minStock < 0);
  const costError = unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0);
  const codeValid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(form.code.trim());
  const valid = codeValid && form.name.trim().length >= 2 && !minError && !costError && (!needsFactory || form.factory_id !== '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const payload: MaterialPayload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      material_type: form.material_type,
      unit: form.unit,
      color: form.color.trim() || null,
      min_stock: minStock ?? 0,
      unit_cost: unitCost,
      notes: form.notes.trim() || null,
      ...(material ? { is_active: form.is_active } : {}),
      ...(needsFactory ? { factory_id: Number(form.factory_id) } : {}),
    };
    try {
      const saved = await save.run(() => (material ? inventoryApi.updateMaterial(material.id, payload) : inventoryApi.createMaterial(payload)));
      toast.success(material ? tr("O'zgarishlar saqlandi") : tr("Material katalogga qo'shildi"));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{material ? tr("Materialni tahrirlash") : tr("Yangi material")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && (
              <TextField select label={tr("Fabrika")} required value={form.factory_id} onChange={(e) => set('factory_id', Number(e.target.value))}>
                {factories.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <TextField
                label={tr("Kod")}
                required
                autoFocus={!material}
                value={form.code}
                onChange={(e) => set('code', e.target.value.toUpperCase())}
                placeholder="MAT-001"
                error={form.code !== '' && !codeValid}
                helperText={form.code !== '' && !codeValid ? tr("Lotin harflari, raqamlar, '-', '_', '.'") : undefined}
              />
              <TextField label={tr("Nomi")} required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={tr("Paxta trikotaj 180 g/m²")} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField
                select
                label={tr("Turi")}
                value={form.material_type}
                onChange={(e) => {
                  const type = e.target.value as MaterialType;
                  setForm((f) => ({ ...f, material_type: type, unit: material ? f.unit : DEFAULT_MATERIAL_UNIT[type] }));
                }}
              >
                {keysOf(MATERIAL_TYPE_LABELS).map((t) => (
                  <MenuItem key={t} value={t}>
                    {MATERIAL_TYPE_LABELS[t]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={tr("O'lchov birligi")}
                value={form.unit}
                onChange={(e) => set('unit', e.target.value as MaterialUnit)}
                helperText={material ? tr("Ombor tarixi bo'lsa o'zgarmaydi") : undefined}
              >
                {keysOf(MATERIAL_UNIT_LABELS).map((u) => (
                  <MenuItem key={u} value={u}>
                    {MATERIAL_UNIT_LABELS[u]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label={tr("Rang")} value={form.color} onChange={(e) => set('color', e.target.value)} placeholder={tr("Oq, 11-0601")} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField
                label={tr("Minimal qoldiq")}
                value={form.min_stock}
                onChange={(e) => set('min_stock', e.target.value)}
                inputMode="decimal"
                error={minError}
                helperText={minError ? tr("Musbat son kiriting") : tr("Shundan kam qolsa ogohlantiriladi")}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{MATERIAL_UNIT_LABELS[form.unit]}</InputAdornment> } }}
              />
              <TextField
                label={tr("Tannarx (1 birlik)")}
                value={form.unit_cost}
                onChange={(e) => set('unit_cost', e.target.value)}
                inputMode="decimal"
                error={costError}
                helperText={costError ? tr("Musbat son kiriting") : tr("Kirimda narx kiritilsa o'zi yangilanadi")}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("so'm")}</InputAdornment> } }}
              />
            </Box>
            <TextField label={tr("Izoh")} value={form.notes} onChange={(e) => set('notes', e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 500 } }} />
            {material && (
              <FormControlLabel
                control={<Switch checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />}
                label={tr("Faol (nofaol materialga kirim qilinmaydi)")}
              />
            )}
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

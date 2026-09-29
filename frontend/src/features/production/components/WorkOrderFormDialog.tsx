import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField } from '@mui/material';
import { productsApi } from '@/features/products/api';
import type { ProductListItem } from '@/features/products/types';
import { resourcesApi } from '@/features/resources/api';
import type { ProductionLine } from '@/features/resources/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { productionApi } from '../api';
import type { WorkOrderDetail } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  /** Tahrirlash: mahsulot va variant o'zgarmaydi */
  wo?: WorkOrderDetail | null;
  onClose: () => void;
  onSaved: (wo: WorkOrderDetail) => void;
}

/** Ombor uchun (buyurtmasiz) ish buyurtmasi yoki mavjudini tahrirlash (miqdor, liniya, muddat) */
export default function WorkOrderFormDialog({ open, wo, onClose, onSaved }: Props) {
  const [product, setProduct] = useState<ProductListItem | null>(null);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lineId, setLineId] = useState<number | ''>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [overcut, setOvercut] = useState('0');
  const [priority, setPriority] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setProduct(null);
    setSize(wo?.size ?? '');
    setColor(wo?.color ?? '');
    setQuantity(wo ? String(wo.quantity) : '');
    setLineId(wo?.line?.id ?? '');
    setStart(wo?.planned_start ?? '');
    setEnd(wo?.planned_end ?? '');
    setOvercut(wo ? String(wo.overcut_pct) : '0');
    setPriority(wo ? String(wo.priority) : '0');
    setNotes(wo?.notes ?? '');
    if (!wo) productsApi.list({ status: 'ACTIVE' }).then(setProducts).catch(() => setProducts([]));
    resourcesApi.lines().then(setLines).catch(() => setLines([]));
  }, [open, wo, save.reset]);

  const qty = Number(quantity);
  const oc = Number(overcut.replace(',', '.'));
  const pr = Number(priority);
  const valid =
    (wo || (product && (!product.sizes.length || size) && (!product.colors.length || color))) &&
    Number.isInteger(qty) && qty >= 1 && oc >= 0 && oc <= 50 && Number.isInteger(pr) && pr >= 0 && pr <= 100 && (!start || !end || end >= start);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const common = { quantity: qty, line_id: lineId === '' ? null : lineId, planned_start: start || null, planned_end: end || null, overcut_pct: oc, priority: pr, notes: notes.trim() || null };
    try {
      const saved = await save.run(() =>
        wo ? productionApi.update(wo.id, common) : productionApi.create({ ...common, product_id: product!.id, size: size || null, color: color || null }),
      );
      toast.success(wo ? tr("O'zgarishlar saqlandi") : tr("Ish buyurtmasi {0} ochildi", saved.number));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{wo ? tr("Ish buyurtmasi {0}", wo.number) : tr("Yangi ish buyurtmasi (ombor uchun)")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {!wo && (
              <>
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
                  renderInput={(params) => <TextField {...params} label={tr("Mahsulot")} required helperText={tr("Mijoz buyurtmasi uchun — buyurtma sahifasidagi «Ishlab chiqarishga berish»")} />}
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
              </>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label={tr("Reja (dona)")} required autoFocus={!!wo} value={quantity} onChange={(e) => setQuantity(e.target.value)} inputMode="numeric" error={quantity !== '' && (!Number.isInteger(qty) || qty < 1)} />
              <TextField select label={tr("Liniya")} value={lineId} onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">—</MenuItem>
                {lines.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField type="date" label={tr("Boshlanishi")} value={start} onChange={(e) => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="date" label={tr("Tugashi (reja)")} value={end} onChange={(e) => setEnd(e.target.value)} error={!!start && !!end && end < start} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField label={tr("Ortiqcha kesish")} value={overcut} onChange={(e) => setOvercut(e.target.value)} inputMode="decimal" helperText={tr("Brak zaxirasi uchun (0–50%)")} slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
              <TextField label={tr("Muhimlik")} value={priority} onChange={(e) => setPriority(e.target.value)} inputMode="numeric" helperText={tr("0–100, kattasi ro'yxatda yuqorida")} />
            </Box>
            <TextField label={tr("Izoh")} value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
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

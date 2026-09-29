import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { inventoryApi } from '@/features/inventory/api';
import { formatQty } from '@/features/inventory/constants';
import type { Material } from '@/features/inventory/types';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { formatMoney } from '@/shared/utils/money';
import { procurementApi } from '../api';
import type { PurchaseOrderDetail, PurchasePrefill, Supplier } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  /** Tahrirlash (faqat qoralama) */
  po?: PurchaseOrderDetail | null;
  prefill?: PurchasePrefill | null;
  supplierId?: number | null;
  onClose: () => void;
  onSaved: (po: PurchaseOrderDetail) => void;
}

interface Line {
  key: number;
  material: Material | null;
  quantity: string;
  price: string;
}

let seq = 0;
const newLine = (material: Material | null = null, quantity = '', price = ''): Line => ({ key: ++seq, material, quantity, price });
const num = (v: string) => Number(v.replace(/\s/g, '').replace(',', '.'));

export default function PurchaseOrderFormDialog({ open, po, prefill, supplierId, onClose, onSaved }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [expected, setExpected] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setExpected(po?.expected_date ?? '');
    setNotes(po?.notes ?? '');
    setSupplier(null);
    setLines([newLine()]);
    Promise.all([procurementApi.suppliers({ is_active: true, limit: 200 }), inventoryApi.materials({ is_active: true, limit: 200 })])
      .then(([s, m]) => {
        setSuppliers(s.items);
        setMaterials(m.items);
        const byId = new Map(m.items.map((x) => [x.id, x]));
        const wanted = po?.supplier.id ?? supplierId ?? null;
        setSupplier(s.items.find((x) => x.id === wanted) ?? null);
        if (po) {
          setLines(po.lines.map((l) => newLine(byId.get(l.material.id) ?? null, String(l.quantity), String(l.unit_price))));
        } else if (prefill?.lines.length) {
          setLines(
            prefill.lines.map((l) => {
              const mat = byId.get(l.material_id) ?? null;
              return newLine(mat, String(Math.ceil(l.quantity * 1000) / 1000), mat?.unit_cost != null ? String(mat.unit_cost) : '');
            }),
          );
        }
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [open, po, prefill, supplierId, save.reset]);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const lineValid = (l: Line) => l.material && num(l.quantity) > 0 && num(l.price) >= 0 && l.price.trim() !== '';
  const usedIds = lines.map((l) => l.material?.id).filter(Boolean);
  const duplicate = new Set(usedIds).size !== usedIds.length;
  const total = useMemo(() => lines.reduce((s, l) => s + (lineValid(l) ? num(l.quantity) * num(l.price) : 0), 0), [lines]);
  const valid = !!supplier && lines.length > 0 && lines.every(lineValid) && !duplicate;
  const hint = supplier?.lead_time_days != null && !expected ? tr("Bo'sh qolsa — {0} kundan keyin", supplier.lead_time_days) : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !supplier) return;
    setError('');
    const items = lines.map((l) => ({ material_id: l.material!.id, quantity: num(l.quantity), unit_price: num(l.price) }));
    try {
      const saved = await save.run(() =>
        po
          ? procurementApi.update(po.id, { supplier_id: supplier.id, expected_date: expected || null, notes: notes.trim() || null, items })
          : procurementApi.create({ supplier_id: supplier.id, expected_date: expected || null, notes: notes.trim() || null, order_id: prefill?.order_id ?? null, items }),
      );
      toast.success(po ? tr("O'zgarishlar saqlandi") : tr("Xarid buyurtmasi {0} yaratildi (qoralama)", saved.number));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{po ? tr("Xarid buyurtmasi {0}", po.number) : tr("Yangi xarid buyurtmasi")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {prefill?.order_number && !po && (
              <Alert severity="info">
                {prefill.order_number} {tr("buyurtmasi uchun yetishmayotgan materiallar qo'shildi. Miqdor va narxni tekshiring.")}
              </Alert>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' } }}>
              <Autocomplete
                options={suppliers}
                value={supplier}
                onChange={(_, s) => setSupplier(s)}
                getOptionLabel={(s) => `${s.code} — ${s.name}`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText={tr("Faol yetkazib beruvchi yo'q — avval qo'shing")}
                renderInput={(params) => <TextField {...params} label={tr("Yetkazib beruvchi")} required />}
              />
              <TextField type="date" label={tr("Kutilgan sana")} value={expected} onChange={(e) => setExpected(e.target.value)} helperText={hint} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>

            <Typography variant="subtitle2">{tr("Materiallar")}</Typography>
            {lines.map((l) => {
              const unit = l.material ? MATERIAL_UNIT_LABELS[l.material.unit] : '';
              return (
                <Box key={l.key} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr auto', sm: '3fr 1.2fr 1.4fr auto' }, alignItems: 'start' }}>
                  <Autocomplete
                    sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
                    options={materials}
                    value={l.material}
                    onChange={(_, m) => setLine(l.key, { material: m, price: l.price || (m?.unit_cost != null ? String(m.unit_cost) : '') })}
                    getOptionLabel={(m) => `${m.code} — ${m.name}`}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    getOptionDisabled={(m) => usedIds.includes(m.id) && m.id !== l.material?.id}
                    renderInput={(params) => (
                      <TextField {...params} label={tr("Material")} size="small" helperText={l.material ? tr("Omborda: {0} {1}", formatQty(l.material.stock), unit) : undefined} />
                    )}
                  />
                  <TextField
                    size="small"
                    label={tr("Miqdor")}
                    value={l.quantity}
                    onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                    inputMode="decimal"
                    error={l.quantity !== '' && !(num(l.quantity) > 0)}
                    slotProps={{ input: { endAdornment: unit ? <InputAdornment position="end">{unit}</InputAdornment> : undefined } }}
                  />
                  <TextField
                    size="small"
                    label={tr("Narx (birlik)")}
                    value={l.price}
                    onChange={(e) => setLine(l.key, { price: e.target.value })}
                    inputMode="decimal"
                    error={l.price !== '' && !(num(l.price) >= 0)}
                    helperText={lineValid(l) ? formatMoney(num(l.quantity) * num(l.price)) : undefined}
                  />
                  <IconButton aria-label={tr("Qatorni o'chirish")} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1} sx={{ mt: 0.5 }}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Box>
              );
            })}
            {duplicate && <Alert severity="warning">{tr("Bir material ikki marta tanlangan — miqdorini bitta qatorga yozing.")}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Button startIcon={<AddIcon />} onClick={() => setLines((ls) => [...ls, newLine()])}>
                {tr("Qator qo'shish")}
              </Button>
              <Typography sx={{ fontWeight: 700 }}>{tr("Jami:")}{' '}{formatMoney(total)}</Typography>
            </Box>
            <TextField label={tr("Izoh")} value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} />
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

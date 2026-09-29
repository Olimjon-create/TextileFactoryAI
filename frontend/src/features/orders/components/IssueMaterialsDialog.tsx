import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
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
import { formatQty } from '@/features/inventory/constants';
import type { WarehouseLocation } from '@/features/inventory/types';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { ordersApi } from '../api';
import type { MaterialRequirement, Order, OrderMaterials } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  mode: 'ISSUE' | 'RETURN';
  order: Order;
  materials: OrderMaterials;
  onClose: () => void;
  onDone: (materials: OrderMaterials) => void;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/\s/g, '').replace(',', '.')));

/** Buyurtmaga material chiqarish (miqdorlar rejadan to'ldiriladi) yoki ortganini omborga qaytarish */
export default function IssueMaterialsDialog({ open, mode, order, materials, onClose, onDone }: Props) {
  const isIssue = mode === 'ISSUE';
  const candidates: MaterialRequirement[] = materials.lines.filter((l) => l.material_id !== null && (isIssue ? true : l.issued > 0));
  const [qty, setQty] = useState<Record<number, string>>({});
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationId, setLocationId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setNote('');
    // Chiqarish: qolgan ehtiyoj (omborda borigacha); qaytarish: bo'sh — foydalanuvchi kiritadi
    setQty(
      Object.fromEntries(
        candidates.map((l) => [l.material_id!, isIssue ? String(round(Math.max(0, Math.min(l.remaining, l.available)))) || '' : '']),
      ),
    );
    inventoryApi
      .locations(false, order.factory_id)
      .then((ls) => {
        setLocations(ls);
        setLocationId(isIssue ? '' : (ls[0]?.id ?? ''));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, save.reset]);

  const errors = Object.fromEntries(
    candidates.map((l) => {
      const v = num(qty[l.material_id!] ?? '');
      let msg = '';
      if (!Number.isFinite(v) || v < 0) msg = tr("Noto'g'ri son");
      else if (isIssue && v > l.available) msg = tr("Omborda {0}", formatQty(l.available));
      else if (!isIssue && v > l.issued) msg = tr("Chiqarilgan {0}", formatQty(l.issued));
      return [l.material_id!, msg];
    }),
  );
  const lines = candidates.map((l) => ({ material_id: l.material_id!, quantity: round(num(qty[l.material_id!] ?? '')) })).filter((l) => l.quantity > 0);
  const valid = lines.length > 0 && Object.values(errors).every((e) => !e) && (isIssue || locationId !== '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      const result = await save.run(() =>
        ordersApi.issueMaterials(order.id, {
          mode,
          lines: lines.map((l) => ({ ...l, location_id: locationId === '' ? null : locationId })),
          note: note.trim() || null,
        }),
      );
      toast.success(isIssue ? tr("{0} xil material buyurtmaga chiqarildi", lines.length) : tr("{0} xil material omborga qaytarildi", lines.length));
      onDone(result);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>
          {isIssue ? tr("Buyurtmaga material chiqarish") : tr("Ortgan materialni qaytarish")} · {order.order_number}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {candidates.length === 0 ? (
              <Alert severity="info">
                {isIssue ? tr("Katalogga bog'langan material yo'q — mahsulot BOM'ida materiallarni katalogdan tanlang.") : tr("Bu buyurtmaga hali material chiqarilmagan.")}
              </Alert>
            ) : (
              <>
                <TextField
                  select
                  label={isIssue ? tr("Qaysi joydan") : tr("Qaysi joyga")}
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
                  required={!isIssue}
                  helperText={isIssue ? tr("Avtomatik — qoldig'i bor joylardan, ko'pidan boshlab") : undefined}
                >
                  {isIssue && <MenuItem value="">{tr("Avtomatik")}</MenuItem>}
                  {locations.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </MenuItem>
                  ))}
                </TextField>
                {candidates.map((l) => {
                  const unit = MATERIAL_UNIT_LABELS[l.unit];
                  const err = errors[l.material_id!];
                  return (
                    <Box key={l.material_id} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1.6fr 1fr' }, alignItems: 'center' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }} noWrap>
                          {l.material_code} — {l.material_name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {tr("Reja")}{' '}{formatQty(l.planned)} {tr("· chiqarilgan")}{' '}{formatQty(l.issued)} {tr("· omborda")}{' '}{formatQty(l.available)} {unit}
                        </Typography>
                      </Box>
                      <TextField
                        size="small"
                        label={tr("Miqdor")}
                        value={qty[l.material_id!] ?? ''}
                        onChange={(e) => setQty((q) => ({ ...q, [l.material_id!]: e.target.value }))}
                        inputMode="decimal"
                        error={!!err}
                        helperText={err || undefined}
                        slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }}
                      />
                    </Box>
                  );
                })}
                <TextField label={tr("Izoh")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("Masalan: kesish sexi, 1-partiya")} slotProps={{ htmlInput: { maxLength: 500 } }} />
                <Typography variant="caption" color="text.secondary">
                  {tr("0 yoki bo'sh qoldirilgan qatorlar yozilmaydi. Barcha qatorlar birga saqlanadi — bittasida xato bo'lsa, hech biri yozilmaydi.")}
                </Typography>
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={!valid}>
            {isIssue ? tr("Chiqarish") : tr("Qaytarish")}
          </SaveButton>
        </DialogActions>
      </form>
    </Dialog>
  );
}

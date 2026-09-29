import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { logisticsApi } from '../api';
import { variantLabel } from '../constants';
import type { OrderShippingLine, ShipmentDetail, TransportFields } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  orderId?: number;
  shipment?: ShipmentDetail | null;
  onClose: () => void;
  onSaved: (sh: ShipmentDetail) => void;
}

const EMPTY: Record<keyof TransportFields, string> = {
  planned_date: '',
  delivery_address: '',
  carrier: '',
  vehicle_no: '',
  driver_name: '',
  driver_phone: '',
  tracking_no: '',
  notes: '',
};

export default function ShipmentFormDialog({ open, orderId, shipment, onClose, onSaved }: Props) {
  const [lines, setLines] = useState<OrderShippingLine[]>([]);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();
  const editItems = !shipment || shipment.status === 'PREPARING';
  const targetOrder = shipment?.order_id ?? orderId;

  useEffect(() => {
    if (!open || !targetOrder) return;
    save.reset();
    setError('');
    setForm(
      shipment
        ? (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (shipment[k as keyof TransportFields] as string | null) ?? ''])) as typeof EMPTY)
        : EMPTY,
    );
    logisticsApi
      .orderShipping(targetOrder)
      .then((s) => {
        const own = new Map((shipment?.lines ?? []).map((l) => [l.order_item_id, l.quantity]));
        const adjusted = s.lines.map((l) => ({ ...l, remaining: l.remaining + (own.get(l.order_item_id) ?? 0) }));
        setLines(adjusted);
        setQty(
          Object.fromEntries(
            adjusted.map((l) => [l.order_item_id, shipment ? String(own.get(l.order_item_id) ?? '') : l.remaining > 0 ? String(Math.min(l.remaining, Math.max(l.in_stock, 0)) || '') : '']),
          ),
        );
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [open, targetOrder, shipment, save.reset]);

  const set = (key: keyof TransportFields, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const parsed = lines.map((l) => ({ l, v: qty[l.order_item_id]?.trim() ? Number(qty[l.order_item_id]) : 0 }));
  const bad = parsed.some(({ l, v }) => !Number.isInteger(v) || v < 0 || v > l.remaining);
  const chosen = parsed.filter(({ v }) => v > 0);
  const valid = !editItems || (!bad && chosen.length > 0);
  const short = chosen.filter(({ l, v }) => v > l.in_stock);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !targetOrder) return;
    setError('');
    const entries = Object.entries(form).filter(([k]) => editItems || k !== 'planned_date');
    const transport = Object.fromEntries(entries.map(([k, v]) => [k, v.trim() || null])) as unknown as TransportFields;
    const items = chosen.map(({ l, v }) => ({ order_item_id: l.order_item_id, quantity: v }));
    try {
      const saved = await save.run(() =>
        shipment
          ? logisticsApi.updateShipment(shipment.id, editItems ? { ...transport, items } : transport)
          : logisticsApi.createShipment({ ...transport, order_id: targetOrder, items }),
      );
      toast.success(shipment ? tr("O'zgarishlar saqlandi") : tr("Jo'natma {0} yaratildi", saved.number));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{shipment ? tr("Jo'natma {0}", shipment.number) : tr("Yangi jo'natma")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {editItems && (
              <>
                <Typography variant="subtitle2">{tr("Mahsulotlar")}</Typography>
                {lines.map((l) => {
                  const v = qty[l.order_item_id] ?? '';
                  const n = v.trim() ? Number(v) : 0;
                  const lineBad = !Number.isInteger(n) || n < 0 || n > l.remaining;
                  const variant = variantLabel(l.size, l.color);
                  return (
                    <Box key={l.order_item_id} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: '1fr 130px', alignItems: 'center', opacity: l.remaining === 0 ? 0.55 : 1 }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }} noWrap>
                          {l.product_name}
                          {variant ? ` (${variant})` : ''}
                        </Typography>
                        <Typography variant="caption" color={n > l.in_stock ? 'warning.main' : 'text.secondary'}>
                          {tr("Buyurtma")}{' '}{l.ordered} {tr("· jo'natilgan")}{' '}{l.shipped}
                          {l.preparing ? tr(" · tayyorlanmoqda {0}", l.preparing) : ''} {tr("· omborda")}{' '}{l.in_stock}
                        </Typography>
                      </Box>
                      <TextField
                        size="small"
                        value={v}
                        onChange={(e) => setQty((q) => ({ ...q, [l.order_item_id]: e.target.value }))}
                        inputMode="numeric"
                        disabled={l.remaining === 0}
                        error={lineBad}
                        helperText={lineBad ? `0 – ${l.remaining}` : tr("qoldi {0}", l.remaining)}
                      />
                    </Box>
                  );
                })}
                {short.length > 0 && (
                  <Alert severity="warning">
                    {tr("Ba'zi mahsulotlar omborda yetarli emas. Jo'natmani tayyorlash mumkin, lekin «Yo'lga chiqarish» uchun avval omborga qabul qiling.")}
                  </Alert>
                )}
              </>
            )}
            <Typography variant="subtitle2">{tr("Yetkazish")}</Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <TextField type="date" label={tr("Rejadagi sana")} value={form.planned_date} onChange={(e) => set('planned_date', e.target.value)} disabled={!editItems} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label={tr("Manzil")} value={form.delivery_address} onChange={(e) => set('delivery_address', e.target.value)} placeholder={shipment ? undefined : tr("Bo'sh — buyurtmadagi manzil")} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField label={tr("Tashuvchi")} value={form.carrier} onChange={(e) => set('carrier', e.target.value)} placeholder={tr("O'z transporti / kompaniya")} />
              <TextField label={tr("Mashina raqami")} value={form.vehicle_no} onChange={(e) => set('vehicle_no', e.target.value.toUpperCase())} placeholder={tr("01 A 123 BC")} />
              <TextField label={tr("Trek raqami")} value={form.tracking_no} onChange={(e) => set('tracking_no', e.target.value)} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label={tr("Haydovchi")} value={form.driver_name} onChange={(e) => set('driver_name', e.target.value)} />
              <TextField label={tr("Haydovchi telefoni")} value={form.driver_phone} onChange={(e) => set('driver_phone', e.target.value)} inputMode="tel" />
            </Box>
            <TextField label={tr("Izoh")} value={form.notes} onChange={(e) => set('notes', e.target.value)} multiline minRows={2} />
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

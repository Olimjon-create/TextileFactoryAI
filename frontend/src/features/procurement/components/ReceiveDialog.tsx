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
import { procurementApi } from '../api';
import type { PurchaseOrderDetail } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  po: PurchaseOrderDetail;
  onClose: () => void;
  onSaved: (po: PurchaseOrderDetail) => void;
}

const num = (v: string) => (v.trim() === '' ? 0 : Number(v.replace(/\s/g, '').replace(',', '.')));

export default function ReceiveDialog({ open, po, onClose, onSaved }: Props) {
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationId, setLocationId] = useState<number | ''>('');
  const [qty, setQty] = useState<Record<number, string>>({});
  const [documentNo, setDocumentNo] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();
  const open_lines = po.lines.filter((l) => l.remaining > 0);

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setDocumentNo('');
    setNote('');
    setQty(Object.fromEntries(open_lines.map((l) => [l.id, String(l.remaining)])));
    inventoryApi
      .locations()
      .then((ls) => {
        setLocations(ls);
        setLocationId((cur) => (cur !== '' && ls.some((l) => l.id === cur) ? cur : ls.length === 1 ? ls[0].id : ''));
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, po.id, save.reset]);

  const invalid = open_lines.some((l) => {
    const v = num(qty[l.id] ?? '');
    return Number.isNaN(v) || v < 0 || v > l.remaining;
  });
  const chosen = open_lines.filter((l) => num(qty[l.id] ?? '') > 0);
  const valid = locationId !== '' && !invalid && chosen.length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      const saved = await save.run(() =>
        procurementApi.receive(po.id, {
          location_id: Number(locationId),
          lines: chosen.map((l) => ({ item_id: l.id, quantity: num(qty[l.id]) })),
          document_no: documentNo.trim() || null,
          note: note.trim() || null,
        }),
      );
      toast.success(tr("{0} ta material omborga kirim qilindi", chosen.length));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{tr("Tovarni qabul qilish —")}{' '}{po.number}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField select label={tr("Ombor joyi")} required value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label={tr("Yuk xati / faktura №")} value={documentNo} onChange={(e) => setDocumentNo(e.target.value)} placeholder={po.number} slotProps={{ htmlInput: { maxLength: 50 } }} />
            </Box>
            {open_lines.map((l) => {
              const v = num(qty[l.id] ?? '');
              const bad = Number.isNaN(v) || v < 0 || v > l.remaining;
              const unit = MATERIAL_UNIT_LABELS[l.unit];
              return (
                <Box key={l.id} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: '1fr 150px', alignItems: 'center' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }} noWrap>
                      {l.material.code} — {l.material.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {tr("Buyurtma")}{' '}{formatQty(l.quantity)} {tr("· keldi")}{' '}{formatQty(l.received)} {tr("· qoldi")}{' '}{formatQty(l.remaining)} {unit}
                    </Typography>
                  </Box>
                  <TextField
                    size="small"
                    value={qty[l.id] ?? ''}
                    onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                    inputMode="decimal"
                    error={bad}
                    helperText={bad ? `0 – ${formatQty(l.remaining)}` : undefined}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }}
                  />
                </Box>
              );
            })}
            <TextField label={tr("Izoh")} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("Masalan: 2 rulon namlangan")} />
            <Typography variant="body2" color="text.secondary">
              {tr("Kirim ombor jurnaliga xarid narxi bilan yoziladi va materialning tannarxi yangilanadi. Kelmagan qatorni 0 qiling.")}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={!valid}>
            {tr("Qabul qilish")}
          </SaveButton>
        </DialogActions>
      </form>
    </Dialog>
  );
}

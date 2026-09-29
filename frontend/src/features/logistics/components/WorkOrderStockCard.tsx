import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import { inventoryApi } from '@/features/inventory/api';
import type { WarehouseLocation } from '@/features/inventory/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { logisticsApi } from '../api';
import { useLogisticsPermissions } from '../permissions';
import type { WorkOrderStock } from '../types';
import { tr } from '@/i18n';

export default function WorkOrderStockCard({ woId, packedKey }: { woId: number; packedKey: number }) {
  const { canView, canReceive } = useLogisticsPermissions();
  const toast = useToast();
  const save = useSaveAction();
  const [stock, setStock] = useState<WorkOrderStock | null>(null);
  const [open, setOpen] = useState(false);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationId, setLocationId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (canView) logisticsApi.workOrderStock(woId).then(setStock).catch(() => setStock(null));
  }, [woId, canView]);
  useEffect(load, [load, packedKey]);

  if (!stock || stock.packed === 0) return null;

  const openDialog = () => {
    save.reset();
    setError('');
    setQuantity(String(stock.remaining));
    setNote('');
    inventoryApi
      .locations()
      .then((ls) => {
        setLocations(ls);
        setLocationId((cur) => (cur !== '' ? cur : ls.length === 1 ? ls[0].id : ''));
      })
      .catch(() => undefined);
    setOpen(true);
  };

  const qty = Number(quantity);
  const valid = locationId !== '' && Number.isInteger(qty) && qty >= 1 && qty <= stock.remaining;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      const next = await save.run(() => logisticsApi.receive({ work_order_id: woId, location_id: Number(locationId), quantity: qty, note: note.trim() || null }));
      setStock(next);
      toast.success(tr("{0} dona tayyor mahsulot omboriga qabul qilindi", qty));
      setOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const pct = Math.round((stock.received / stock.packed) * 100);
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {tr("Tayyor mahsulot ombori")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {tr("Qadoqlangan")}{' '}{stock.packed} {tr("· omborga topshirilgan")}{' '}{stock.received}
            {stock.remaining > 0 ? tr(" · kutilmoqda {0}", stock.remaining) : ''}
          </Typography>
          <LinearProgress variant="determinate" value={pct} color={stock.remaining === 0 ? 'success' : 'primary'} sx={{ height: 6, borderRadius: 3 }} />
        </Box>
        {canReceive && stock.remaining > 0 && (
          <Button variant="contained" startIcon={<WarehouseOutlinedIcon />} onClick={openDialog}>
            {tr("Omborga topshirish")}
          </Button>
        )}
      </CardContent>
      <Dialog open={open} onClose={save.busy ? undefined : () => setOpen(false)} maxWidth="xs" fullWidth>
        <form onSubmit={submit} noValidate>
          <DialogTitle>{tr("Omborga topshirish")}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField select label={tr("Ombor joyi")} required value={locationId} onChange={(e) => setLocationId(Number(e.target.value))}>
                {locations.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={tr("Miqdor (dona)")}
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="numeric"
                error={quantity !== '' && !(Number.isInteger(qty) && qty >= 1 && qty <= stock.remaining)}
                helperText={tr("Ko'pi bilan {0} dona", stock.remaining)}
              />
              <TextField label={tr("Izoh")} value={note} onChange={(e) => setNote(e.target.value)} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setOpen(false)} color="inherit" disabled={save.busy}>
              {tr("Bekor qilish")}
            </Button>
            <SaveButton status={save.status} disabled={!valid}>
              {tr("Qabul qilish")}
            </SaveButton>
          </DialogActions>
        </form>
      </Dialog>
    </Card>
  );
}

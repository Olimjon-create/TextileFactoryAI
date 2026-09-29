import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { ordersApi } from '../api';
import type { Order } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  order: Order;
  onClose: () => void;
  onSaved: (order: Order) => void;
}

export default function OrderEditDialog({ open, order, onClose, onSaved }: Props) {
  const [dueDate, setDueDate] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setDueDate(order.due_date ?? '');
    setAddress(order.delivery_address ?? '');
    setComment(order.comment ?? '');
  }, [open, order, save.reset]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const saved = await save.run(() =>
        ordersApi.update(order.id, { due_date: dueDate || null, delivery_address: address.trim() || null, comment: comment.trim() || null }),
      );
      toast.success(tr("O'zgarishlar saqlandi"));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{tr("Buyurtmani tahrirlash ·")}{' '}{order.order_number}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              type="date"
              label={tr("Topshirish muddati")}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              helperText={tr("Mijozga va'da qilingan sana — o'tib ketsa buyurtma «kechikkan» deb belgilanadi")}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField label={tr("Yetkazib berish manzili")} value={address} onChange={(e) => setAddress(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
            <TextField label={tr("Izoh")} value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

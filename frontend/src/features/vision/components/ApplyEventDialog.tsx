import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { productionApi } from '@/features/production/api';
import type { WorkOrder } from '@/features/production/types';
import { STAGE_LABELS } from '@/features/resources/constants';
import type { ProductionStage } from '@/features/resources/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { visionApi } from '../api';
import { EVENT_TYPE_LABELS } from '../constants';
import type { VisionEvent } from '../types';
import { tr } from '@/i18n';

/** Hodisani tasdiqlash: kerak bo'lsa ish buyurtmasi, bosqich va miqdorni aniqlashtirish */
export default function ApplyEventDialog({ event, onClose, onDone }: { event: VisionEvent | null; onClose: () => void; onDone: (e: VisionEvent) => void }) {
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [woId, setWoId] = useState<number | ''>('');
  const [stage, setStage] = useState<ProductionStage | ''>('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const needsProduction = event && event.event_type !== 'MACHINE_STATE';

  useEffect(() => {
    if (!event) return;
    save.reset();
    setError('');
    setWoId(event.work_order?.id ?? '');
    setStage(event.stage ?? '');
    setQty(event.quantity != null ? String(event.quantity) : '');
    if (event.event_type !== 'MACHINE_STATE') productionApi.list({ active: true, limit: 100 }).then((r) => setWos(r.items)).catch(() => undefined);
  }, [event, save.reset]);

  if (!event) return null;
  const q = qty.trim() === '' ? null : Number(qty);
  const valid = q === null || (Number.isInteger(q) && q >= 1);

  const submit = async () => {
    setError('');
    try {
      const done = await save.run(() => visionApi.applyEvent(event.id, { work_order_id: woId === '' ? null : woId, stage: stage || null, quantity: q }));
      onDone(done);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {tr("Tasdiqlash:")}{' '}{EVENT_TYPE_LABELS[event.event_type]} · {event.device.code}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {event.status_message && <Alert severity="info">{event.status_message}</Alert>}
          {event.image_url && <Box component="img" src={event.image_url} alt="kadr" sx={{ maxWidth: '100%', maxHeight: 240, borderRadius: 2, objectFit: 'contain' }} />}
          {needsProduction ? (
            <>
              <TextField select label={tr("Ish buyurtmasi")} value={woId} onChange={(e) => setWoId(e.target.value === '' ? '' : Number(e.target.value))} helperText={tr("Bo'sh — hodisa/qurilmadagi ish buyurtmasi")}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
              >
                <MenuItem value="">{tr("Qurilmaga biriktirilgani")}</MenuItem>
                {wos.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.number} — {w.product_name} {[w.size, w.color].filter(Boolean).join(' ')} ({w.finished}/{w.quantity})
                  </MenuItem>
                ))}
              </TextField>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
                <TextField select label={tr("Bosqich")} value={stage} onChange={(e) => setStage(e.target.value as ProductionStage | '')} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
                  <MenuItem value="">{tr("Qurilmaniki")}</MenuItem>
                  {(Object.keys(STAGE_LABELS) as ProductionStage[]).map((s) => (
                    <MenuItem key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField label={tr("Miqdor")} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" error={!valid} helperText={tr("Kamera sanog'ini tuzatish mumkin")} />
              </Box>
            </>
          ) : (
            <Typography>
              {tr("Mashina holati:")}{' '}<b>{event.machine_state}</b> {tr("— qurilmaga biriktirilgan mashinaga qo'llanadi.")}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            {tr("Qo'llanganda odatiy ishlab chiqarish yozuvi (manba: kamera) yaratiladi — bosqich chegaralari va boshqa tekshiruvlar ishlaydi.")}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={save.busy}>
          {tr("Bekor qilish")}
        </Button>
        <SaveButton status={save.status} type="button" onClick={submit} disabled={!valid} savedText={tr("Qo'llandi")}>
          {tr("Qo'llash")}
        </SaveButton>
      </DialogActions>
    </Dialog>
  );
}

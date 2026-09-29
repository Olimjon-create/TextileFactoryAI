import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField } from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { productionApi } from '@/features/production/api';
import type { WorkOrder } from '@/features/production/types';
import { resourcesApi } from '@/features/resources/api';
import { STAGE_LABELS } from '@/features/resources/constants';
import type { Machine, ProductionLine, ProductionStage } from '@/features/resources/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import type { Factory } from '@/shared/types';
import { visionApi } from '../api';
import { DEVICE_KIND_LABELS } from '../constants';
import type { Device, DeviceKind, DeviceWithKey } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  device?: Device | null;
  onClose: () => void;
  /** Yangi qurilma — kalit bilan (bir marta ko'rsatiladi) */
  onSaved: (d: Device | DeviceWithKey) => void;
}

const idOrNull = (v: number | '') => (v === '' ? null : v);

export default function DeviceFormDialog({ open, device, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const needsFactory = user?.role === 'SUPER_ADMIN' && !device;
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DeviceKind>('CAMERA');
  const [stage, setStage] = useState<ProductionStage | ''>('');
  const [lineId, setLineId] = useState<number | ''>('');
  const [machineId, setMachineId] = useState<number | ''>('');
  const [woId, setWoId] = useState<number | ''>('');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [wos, setWos] = useState<WorkOrder[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setCode(device?.code ?? '');
    setName(device?.name ?? '');
    setKind(device?.kind ?? 'CAMERA');
    setStage(device?.stage ?? '');
    setLineId(device?.line?.id ?? '');
    setMachineId(device?.machine?.id ?? '');
    setWoId(device?.work_order?.id ?? '');
    setActive(device?.is_active ?? true);
    setNotes(device?.notes ?? '');
    resourcesApi.lines().then(setLines).catch(() => undefined);
    resourcesApi.machines({ is_active: true, limit: 200 }).then((r) => setMachines(r.items)).catch(() => undefined);
    if (device) productionApi.list({ active: true, limit: 100 }).then((r) => setWos(r.items)).catch(() => undefined);
    if (needsFactory) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [open, device, needsFactory, save.reset]);

  const valid = name.trim().length >= 2 && (device || /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(code.trim())) && (!needsFactory || factoryId !== '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const common = { name: name.trim(), kind, stage: stage || null, line_id: idOrNull(lineId), machine_id: idOrNull(machineId), notes: notes.trim() || null };
    try {
      const saved = await save.run(() =>
        device
          ? visionApi.updateDevice(device.id, { ...common, work_order_id: idOrNull(woId), is_active: active })
          : visionApi.createDevice({ ...common, code: code.trim(), ...(needsFactory ? { factory_id: Number(factoryId) } : {}) }),
      );
      if (device) toast.success(tr("O'zgarishlar saqlandi"));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{device ? tr("Qurilma {0}", device.code) : tr("Yangi qurilma")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && (
              <TextField select label={tr("Fabrika")} required value={factoryId} onChange={(e) => setFactoryId(Number(e.target.value))}>
                {factories.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <TextField label={tr("Kod")} required disabled={!!device} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="CAM-01" />
              <TextField label={tr("Nomi")} required value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Kesish sexi kamerasi")} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField select label={tr("Turi")} value={kind} onChange={(e) => setKind(e.target.value as DeviceKind)}>
                {(Object.keys(DEVICE_KIND_LABELS) as DeviceKind[]).map((k) => (
                  <MenuItem key={k} value={k}>
                    {DEVICE_KIND_LABELS[k]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Kuzatadigan bosqich")} value={stage} onChange={(e) => setStage(e.target.value as ProductionStage | '')} helperText={tr("Sanoq/brak shu bosqichga yoziladi")}>
                <MenuItem value="">—</MenuItem>
                {(Object.keys(STAGE_LABELS) as ProductionStage[]).map((s) => (
                  <MenuItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Liniya")} value={lineId} onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">—</MenuItem>
                {lines.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Mashina")} value={machineId} onChange={(e) => setMachineId(e.target.value === '' ? '' : Number(e.target.value))} helperText={tr("Mashina holati hodisalari uchun")}>
                <MenuItem value="">—</MenuItem>
                {machines.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            {device && (
              <TextField
                select
                label={tr("Hozir kuzatilayotgan ish buyurtmasi")}
                value={woId}
                onChange={(e) => setWoId(e.target.value === '' ? '' : Number(e.target.value))}
                helperText={tr("Hodisada ish buyurtmasi ko'rsatilmasa — shunga yoziladi")}
              >
                <MenuItem value="">—</MenuItem>
                {wos.map((w) => (
                  <MenuItem key={w.id} value={w.id}>
                    {w.number} — {w.product_name} {[w.size, w.color].filter(Boolean).join(' ')} ({w.finished}/{w.quantity})
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField label={tr("Izoh")} value={notes} onChange={(e) => setNotes(e.target.value)} multiline minRows={2} placeholder={tr("IP manzil, model versiyasi, joylashuv...")} />
            {device && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label={tr("Faol (nofaol qurilma hodisa yubora olmaydi)")} />}
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

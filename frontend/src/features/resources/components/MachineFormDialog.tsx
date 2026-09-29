import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField } from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { resourcesApi } from '../api';
import { keys, MACHINE_TYPE_LABELS } from '../constants';
import type { Machine, MachineDetail, MachinePayload, MachineType, ProductionLine } from '../types';
import FactoryField, { useNeedsFactory } from './FactoryField';
import { tr } from '@/i18n';

const EMPTY = {
  code: '',
  name: '',
  machine_type: 'LOCKSTITCH' as MachineType,
  brand: '',
  model: '',
  serial_number: '',
  line_id: '' as number | '',
  purchase_date: '',
  maintenance_interval_days: '',
  last_maintenance_date: '',
  notes: '',
  is_active: true,
  factory_id: '' as number | '',
};

export default function MachineFormDialog({ open, machine, onClose, onSaved }: { open: boolean; machine: Machine | null; onClose: () => void; onSaved: (m: MachineDetail) => void }) {
  const needsFactory = useNeedsFactory(!machine);
  const [form, setForm] = useState(EMPTY);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setForm(
      machine
        ? {
            code: machine.code,
            name: machine.name,
            machine_type: machine.machine_type,
            brand: machine.brand ?? '',
            model: machine.model ?? '',
            serial_number: machine.serial_number ?? '',
            line_id: machine.line?.id ?? '',
            purchase_date: machine.purchase_date ?? '',
            maintenance_interval_days: machine.maintenance_interval_days ? String(machine.maintenance_interval_days) : '',
            last_maintenance_date: machine.last_maintenance_date ?? '',
            notes: machine.notes ?? '',
            is_active: machine.is_active,
            factory_id: machine.factory_id,
          }
        : EMPTY,
    );
    resourcesApi.lines().then(setLines).catch(() => undefined);
  }, [open, machine, save.reset]);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const interval = form.maintenance_interval_days.trim() === '' ? null : Number(form.maintenance_interval_days);
  const intervalError = interval !== null && (!Number.isInteger(interval) || interval < 1 || interval > 3650);
  const codeValid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(form.code.trim());
  const valid = codeValid && form.name.trim().length >= 2 && !intervalError && (!needsFactory || form.factory_id !== '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const t = (v: string) => v.trim() || null;
    const payload: MachinePayload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      machine_type: form.machine_type,
      brand: t(form.brand),
      model: t(form.model),
      serial_number: t(form.serial_number),
      line_id: form.line_id === '' ? null : form.line_id,
      purchase_date: form.purchase_date || null,
      maintenance_interval_days: interval,
      last_maintenance_date: form.last_maintenance_date || null,
      notes: t(form.notes),
      ...(machine ? { is_active: form.is_active } : {}),
      ...(needsFactory ? { factory_id: Number(form.factory_id) } : {}),
    };
    try {
      const saved = await save.run(() => (machine ? resourcesApi.updateMachine(machine.id, payload) : resourcesApi.createMachine(payload)));
      toast.success(machine ? tr("O'zgarishlar saqlandi") : tr("Mashina ro'yxatga olindi: {0}", saved.code));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{machine ? tr("Mashinani tahrirlash") : tr("Yangi mashina")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && <FactoryField value={form.factory_id} onChange={(id) => set('factory_id', id)} />}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <TextField label={tr("Inventar raqami")} required autoFocus value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="JK-014" error={form.code !== '' && !codeValid} helperText={tr("QR/shtrix-kod shunga bosiladi")} />
              <TextField label={tr("Nomi")} required value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={tr("Juki DDL-8700")} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField select label={tr("Turi")} value={form.machine_type} onChange={(e) => set('machine_type', e.target.value as MachineType)}>
                {keys(MACHINE_TYPE_LABELS).map((t) => (
                  <MenuItem key={t} value={t}>
                    {MACHINE_TYPE_LABELS[t]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Liniya")} value={form.line_id} onChange={(e) => set('line_id', e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">—</MenuItem>
                {lines.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField label={tr("Brend")} value={form.brand} onChange={(e) => set('brand', e.target.value)} placeholder={tr("Juki, Brother...")} />
              <TextField label={tr("Model")} value={form.model} onChange={(e) => set('model', e.target.value)} />
              <TextField label={tr("Seriya raqami")} value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField type="date" label={tr("Sotib olingan")} value={form.purchase_date} onChange={(e) => set('purchase_date', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField
                label={tr("Texnik xizmat davriyligi")}
                value={form.maintenance_interval_days}
                onChange={(e) => set('maintenance_interval_days', e.target.value)}
                inputMode="numeric"
                error={intervalError}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("kun")}</InputAdornment> } }}
              />
              <TextField type="date" label={tr("Oxirgi xizmat")} value={form.last_maintenance_date} onChange={(e) => set('last_maintenance_date', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <TextField label={tr("Izoh")} value={form.notes} onChange={(e) => set('notes', e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
            {machine && <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />} label={tr("Faol (hisobdan chiqarilgan mashinani o'chirish o'rniga nofaol qiling)")} />}
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

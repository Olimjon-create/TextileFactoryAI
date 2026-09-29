import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { visionApi } from '../api';
import { EVENT_TYPE_LABELS, RULE_ACTION_HINTS, RULE_ACTION_LABELS } from '../constants';
import type { Device, EventType, Rule, RuleAction } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  rule?: Rule | null;
  devices: Device[];
  onClose: () => void;
  onSaved: () => void;
}

const int = (v: string) => (v.trim() === '' ? null : Number(v));

export default function RuleFormDialog({ open, rule, devices, onClose, onSaved }: Props) {
  const [eventType, setEventType] = useState<EventType>('COUNT');
  const [deviceId, setDeviceId] = useState<number | ''>('');
  const [action, setAction] = useState<RuleAction>('AUTO_APPLY');
  const [conf, setConf] = useState('80');
  const [threshold, setThreshold] = useState('');
  const [windowMin, setWindowMin] = useState('');
  const [active, setActive] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setEventType(rule?.event_type ?? 'COUNT');
    setDeviceId(rule?.device?.id ?? '');
    setAction(rule?.action ?? 'AUTO_APPLY');
    setConf(String(Math.round((rule?.min_confidence ?? 0.8) * 100)));
    setThreshold(rule?.alert_threshold?.toString() ?? '');
    setWindowMin(rule?.alert_window_minutes?.toString() ?? '');
    setActive(rule?.is_active ?? true);
    setNotes(rule?.notes ?? '');
  }, [open, rule, save.reset]);

  const c = Number(conf);
  const t = int(threshold);
  const w = int(windowMin);
  const alertOk = (t === null) === (w === null) && (t === null || (Number.isInteger(t) && t >= 1)) && (w === null || (Number.isInteger(w) && w >= 1 && w <= 1440));
  const valid = c >= 0 && c <= 100 && alertOk;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const body = { action, min_confidence: c / 100, alert_threshold: t, alert_window_minutes: w, is_active: active, notes: notes.trim() || null };
    try {
      await save.run(() => (rule ? visionApi.updateRule(rule.id, body) : visionApi.createRule({ ...body, event_type: eventType, device_id: deviceId === '' ? null : deviceId })));
      toast.success(tr("Qoida saqlandi"));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{rule ? tr("Qoidani tahrirlash") : tr("Yangi qoida")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField select label={tr("Hodisa turi")} value={eventType} disabled={!!rule} onChange={(e) => setEventType(e.target.value as EventType)}>
                {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).filter((k) => k !== 'CUSTOM').map((k) => (
                  <MenuItem key={k} value={k}>
                    {EVENT_TYPE_LABELS[k]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={tr("Qurilma")}
                value={deviceId}
                disabled={!!rule}
                onChange={(e) => setDeviceId(e.target.value === '' ? '' : Number(e.target.value))}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                helperText={tr("Aniq qurilma qoidasi umumiydan ustun")}
              >
                <MenuItem value="">{tr("Barcha qurilmalar")}</MenuItem>
                {devices.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <TextField select label={tr("Amal")} value={action} onChange={(e) => setAction(e.target.value as RuleAction)} helperText={RULE_ACTION_HINTS[action]}>
              {(Object.keys(RULE_ACTION_LABELS) as RuleAction[]).map((a) => (
                <MenuItem key={a} value={a}>
                  {RULE_ACTION_LABELS[a]}
                </MenuItem>
              ))}
            </TextField>
            {action === 'AUTO_APPLY' && (
              <TextField
                label={tr("Minimal ishonch")}
                value={conf}
                onChange={(e) => setConf(e.target.value)}
                inputMode="numeric"
                error={!(c >= 0 && c <= 100)}
                helperText={tr("AI modeli ishonchi shundan past bo'lsa — odam tasdiqlaydi")}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
              />
            )}
            <Typography variant="subtitle2">{tr("Ogohlantirish (ixtiyoriy)")}</Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField label={tr("Chegara (dona/hodisa)")} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" error={!alertOk} />
              <TextField
                label={tr("Vaqt oralig'i")}
                value={windowMin}
                onChange={(e) => setWindowMin(e.target.value)}
                inputMode="numeric"
                error={!alertOk}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("daq")}</InputAdornment> } }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {tr("Masalan: 60 daqiqada 20 dan ortiq brak — qo'ng'iroqchada qizil ogohlantirish.")}
            </Typography>
            <TextField label={tr("Izoh")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label={tr("Faol")} />
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

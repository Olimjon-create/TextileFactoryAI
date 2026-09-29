import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { resourcesApi } from '@/features/resources/api';
import type { Employee, Machine, ProductionStage } from '@/features/resources/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { productionApi } from '../api';
import { STAGE_LABELS, STAGE_ROUTE } from '../constants';
import { useProductionPermissions } from '../permissions';
import type { WorkOrderDetail } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  wo: WorkOrderDetail;
  onClose: () => void;
  onDone: (wo: WorkOrderDetail) => void;
}

const today = () => new Date().toISOString().slice(0, 10);
const int = (v: string) => (v.trim() === '' ? 0 : Number(v));
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));

/** Bosqich ishini qayd etish: kim, qaysi mashinada, qancha yaroqli va brak (kesishda — mato sarfi) */
export default function LogDialog({ open, wo, onClose, onDone }: Props) {
  const { onlyQualityStage } = useProductionPermissions();
  const [stage, setStage] = useState<ProductionStage>('CUTTING');
  const [good, setGood] = useState('');
  const [defect, setDefect] = useState('');
  const [reason, setReason] = useState('');
  const [fabricUsed, setFabricUsed] = useState('');
  const [fabricWaste, setFabricWaste] = useState('');
  const [duration, setDuration] = useState('');
  const [workDate, setWorkDate] = useState(today());
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [machineId, setMachineId] = useState<number | ''>('');
  const [unitCode, setUnitCode] = useState('');
  const [note, setNote] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setStage(onlyQualityStage ? 'QUALITY_CONTROL' : (wo.current_stage ?? 'CUTTING'));
    setGood('');
    setDefect('');
    setReason('');
    setFabricUsed('');
    setFabricWaste('');
    setDuration('');
    setWorkDate(today());
    setEmployee(null);
    setMachineId('');
    setUnitCode('');
    setNote('');
    resourcesApi.employees({ status: 'ACTIVE', limit: 200 }).then((r) => setEmployees(r.items)).catch(() => setEmployees([]));
    resourcesApi.machines({ limit: 200 }).then((r) => setMachines(r.items.filter((m) => m.status === 'WORKING' || m.status === 'IDLE'))).catch(() => setMachines([]));
  }, [open, wo, onlyQualityStage, save.reset]);

  const p = wo.progress.find((x) => x.stage === stage)!;
  const g = int(good);
  const d = int(defect);
  const qtyError = !Number.isInteger(g) || !Number.isInteger(d) || g < 0 || d < 0 ? tr("Butun son kiriting") : g + d === 0 ? '' : g + d > p.remaining ? tr("Ko'pi bilan {0} dona (kelgan {1}, ishlangan {2})", p.remaining, p.available, p.good + p.defect) : '';
  const isCut = stage === 'CUTTING';
  const used = num(fabricUsed);
  const waste = num(fabricWaste);
  const valid = g + d > 0 && !qtyError && (d === 0 || reason.trim().length >= 2) && (used === null || used >= 0) && (waste === null || waste >= 0) && !!workDate && workDate <= today();
  // Tanlangan bosqichga mos xodimlar birinchi
  const sorted = [...employees].sort((a, b) => Number(b.department === stage) - Number(a.department === stage));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      const result = await save.run(() =>
        productionApi.addLog(wo.id, {
          stage,
          quantity_good: g,
          quantity_defect: d,
          defect_reason: d ? reason.trim() : null,
          fabric_used: isCut ? used : null,
          fabric_waste: isCut ? waste : null,
          duration_minutes: duration.trim() ? Number(duration) : null,
          work_date: workDate,
          employee_id: employee?.id ?? null,
          machine_id: machineId === '' ? null : machineId,
          unit_code: unitCode.trim() || null,
          source: unitCode.trim() ? 'SCANNER' : 'MANUAL',
          note: note.trim() || null,
        }),
      );
      toast.success(tr("{0}: {1} yaroqli{2} qayd etildi{3}", STAGE_LABELS[stage], g, d ? tr(", {0} brak", d) : '', result.status === 'COMPLETED' ? tr(" · ish buyurtmasi tugallandi") : ''));
      onDone(result);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{tr("Ishni qayd etish ·")}{' '}{wo.number}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1.3fr 1fr' } }}>
              <TextField select label={tr("Bosqich")} value={stage} onChange={(e) => setStage(e.target.value as ProductionStage)} disabled={onlyQualityStage}>
                {STAGE_ROUTE.map((s) => (
                  <MenuItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField type="date" label={tr("Sana")} value={workDate} onChange={(e) => setWorkDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today() } }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip size="small" label={tr("Bu bosqichga kelgan: {0}", p.available)} />
              <Chip size="small" label={tr("Ishlangan: {0}", p.good + p.defect)} />
              <Chip size="small" color={p.remaining ? 'primary' : 'default'} label={tr("Qoldi: {0}", p.remaining)} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField label={tr("Yaroqli")} autoFocus value={good} onChange={(e) => setGood(e.target.value)} inputMode="numeric" error={!!qtyError} helperText={qtyError || ' '} slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("dona")}</InputAdornment> } }} />
              <TextField label={tr("Brak")} value={defect} onChange={(e) => setDefect(e.target.value)} inputMode="numeric" helperText=" " slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("dona")}</InputAdornment> } }} />
            </Box>
            {d > 0 && <TextField label={tr("Brak sababi")} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Chok qiyshiq, mato dog'li, o'lcham noto'g'ri...")} slotProps={{ htmlInput: { maxLength: 300 } }} />}
            {isCut && (
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
                <TextField label={tr("Sarflangan mato")} value={fabricUsed} onChange={(e) => setFabricUsed(e.target.value)} inputMode="decimal" helperText={wo.fabric.per_piece_planned ? tr("Reja: {0} m/dona", wo.fabric.per_piece_planned) : ' '} slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("m")}</InputAdornment> } }} />
                <TextField label={tr("Kesish chiqindisi")} value={fabricWaste} onChange={(e) => setFabricWaste(e.target.value)} inputMode="decimal" helperText=" " slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("m")}</InputAdornment> } }} />
              </Box>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1.4fr 1fr' } }}>
              <Autocomplete
                options={sorted}
                value={employee}
                onChange={(_, v) => setEmployee(v)}
                getOptionLabel={(e) => `${e.full_name} · ${e.employee_code}`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => <TextField {...params} label={tr("Xodim")} helperText={tr("KPI shu xodimga yoziladi")} />}
              />
              <TextField select label={tr("Mashina")} value={machineId} onChange={(e) => setMachineId(e.target.value === '' ? '' : Number(e.target.value))} helperText={tr("Faqat ishlayotgan mashinalar")}>
                <MenuItem value="">—</MenuItem>
                {machines.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label={tr("Partiya / quti kodi")} value={unitCode} onChange={(e) => setUnitCode(e.target.value.toUpperCase())} placeholder={`${wo.number}-P01`} helperText={tr("Skaner bilan o'qing (ixtiyoriy)")} />
              <TextField label={tr("Sarflangan vaqt")} value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" helperText={tr("Soatbay unumdorlik uchun")} slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("daq")}</InputAdornment> } }} />
            </Box>
            <TextField label={tr("Izoh")} value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
            <Typography variant="caption" color="text.secondary">
              {tr("Liniya va smena xodimdan avtomatik olinadi. Oxirgi bosqichda reja bajarilsa, ish buyurtmasi o'zi tugallanadi.")}
            </Typography>
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

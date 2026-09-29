import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import NightsStayOutlinedIcon from '@mui/icons-material/NightsStayOutlined';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import PageHeader from '@/shared/components/PageHeader';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { resourcesApi } from '../api';
import FactoryField, { useNeedsFactory } from '../components/FactoryField';
import { formatDuration, hhmm, keys, STAGE_LABELS } from '../constants';
import { useResourcePermissions } from '../permissions';
import type { ProductionLine, ProductionStage, Shift } from '../types';
import { tr } from '@/i18n';

// ---------- liniya dialogi ----------

function LineDialog({ open, line, onClose, onSaved }: { open: boolean; line: ProductionLine | null; onClose: () => void; onSaved: () => void }) {
  const needsFactory = useNeedsFactory(!line);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [stage, setStage] = useState<ProductionStage>('SEWING');
  const [capacity, setCapacity] = useState('');
  const [active, setActive] = useState(true);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setCode(line?.code ?? '');
    setName(line?.name ?? '');
    setStage(line?.stage ?? 'SEWING');
    setCapacity(line?.capacity_per_shift ? String(line.capacity_per_shift) : '');
    setActive(line?.is_active ?? true);
    setFactoryId('');
  }, [open, line, save.reset]);

  const cap = capacity.trim() === '' ? null : Number(capacity);
  const capError = cap !== null && (!Number.isInteger(cap) || cap < 1);
  const valid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(code.trim()) && name.trim().length >= 2 && !capError && (!needsFactory || factoryId !== '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const payload = { code: code.trim().toUpperCase(), name: name.trim(), stage, capacity_per_shift: cap, ...(line ? { is_active: active } : {}), ...(needsFactory ? { factory_id: Number(factoryId) } : {}) };
    try {
      await save.run(() => (line ? resourcesApi.updateLine(line.id, payload) : resourcesApi.createLine(payload)));
      toast.success(line ? tr("O'zgarishlar saqlandi") : tr("Liniya qo'shildi"));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{line ? tr("Liniyani tahrirlash") : tr("Yangi liniya")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && <FactoryField value={factoryId} onChange={setFactoryId} />}
            <TextField label={tr("Kod")} required autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="TK-1" />
            <TextField label={tr("Nomi")} required value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Tikuv liniyasi 1")} />
            <TextField select label={tr("Bosqich")} value={stage} onChange={(e) => setStage(e.target.value as ProductionStage)}>
              {keys(STAGE_LABELS).map((s) => (
                <MenuItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label={tr("Smenadagi quvvat")}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              inputMode="numeric"
              error={capError}
              helperText={tr("Rejalashtirishda ishlatiladi")}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("dona")}</InputAdornment> } }}
            />
            {line && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label={tr("Faol")} />}
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

// ---------- smena dialogi ----------

function ShiftDialog({ open, shift, onClose, onSaved }: { open: boolean; shift: Shift | null; onClose: () => void; onSaved: () => void }) {
  const needsFactory = useNeedsFactory(!shift);
  const [name, setName] = useState('');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('17:00');
  const [breakMin, setBreakMin] = useState('60');
  const [active, setActive] = useState(true);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setName(shift?.name ?? '');
    setStart(shift ? hhmm(shift.start_time) : '08:00');
    setEnd(shift ? hhmm(shift.end_time) : '17:00');
    setBreakMin(shift ? String(shift.break_minutes) : '60');
    setActive(shift?.is_active ?? true);
    setFactoryId('');
  }, [open, shift, save.reset]);

  // Sof ish vaqti — tungi smena (tugash < boshlanish) ham hisobga olinadi
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const span = start && end ? ((toMin(end) - toMin(start) + 1440) % 1440 || 0) : 0;
  const br = Number(breakMin || 0);
  const net = span - br;
  const valid = name.trim().length >= 2 && span > 0 && Number.isInteger(br) && br >= 0 && net > 0 && (!needsFactory || factoryId !== '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const payload = { name: name.trim(), start_time: start, end_time: end, break_minutes: br, ...(shift ? { is_active: active } : {}), ...(needsFactory ? { factory_id: Number(factoryId) } : {}) };
    try {
      await save.run(() => (shift ? resourcesApi.updateShift(shift.id, payload) : resourcesApi.createShift(payload)));
      toast.success(shift ? tr("O'zgarishlar saqlandi") : tr("Smena qo'shildi"));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{shift ? tr("Smenani tahrirlash") : tr("Yangi smena")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && <FactoryField value={factoryId} onChange={setFactoryId} />}
            <TextField label={tr("Nomi")} required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Kunduzgi, Tungi, 1-smena")} />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField type="time" label={tr("Boshlanishi")} value={start} onChange={(e) => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="time" label={tr("Tugashi")} value={end} onChange={(e) => setEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <TextField
              label={tr("Tanaffus")}
              value={breakMin}
              onChange={(e) => setBreakMin(e.target.value)}
              inputMode="numeric"
              error={net <= 0}
              helperText={span > 0 ? tr("Sof ish vaqti: {0}{1}", net > 0 ? formatDuration(net) : tr("yo'q"), toMin(end) <= toMin(start) ? tr(" · tungi smena") : '') : tr("Vaqtlar bir xil bo'lmasin")}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("daq")}</InputAdornment> } }}
            />
            {shift && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label={tr("Faol")} />}
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

// ---------- sahifa ----------

type Deleting = { kind: 'line'; item: ProductionLine } | { kind: 'shift'; item: Shift } | null;

export default function LinesShiftsPage() {
  const toast = useToast();
  const { canEditWorkforce: canEdit } = useResourcePermissions();
  const [lines, setLines] = useState<ProductionLine[] | null>(null);
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState('');
  const [lineDialog, setLineDialog] = useState<{ open: boolean; line: ProductionLine | null }>({ open: false, line: null });
  const [shiftDialog, setShiftDialog] = useState<{ open: boolean; shift: Shift | null }>({ open: false, shift: null });
  const [deleting, setDeleting] = useState<Deleting>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([resourcesApi.lines(true), resourcesApi.shifts(true)]);
      setLines(l);
      setShifts(s);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      if (deleting.kind === 'line') await resourcesApi.removeLine(deleting.item.id);
      else await resourcesApi.removeShift(deleting.item.id);
      toast.success(deleting.kind === 'line' ? tr("Liniya o'chirildi") : tr("Smena o'chirildi"));
      setDeleting(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const actions = (onEdit: () => void, onDelete: () => void) =>
    canEdit && (
      <Box sx={{ whiteSpace: 'nowrap' }}>
        <Tooltip title={tr("Tahrirlash")}>
          <IconButton size="small" onClick={onEdit}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={tr("O'chirish")}>
          <IconButton size="small" color="error" onClick={onDelete}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    );

  return (
    <>
      <PageHeader title={tr("Liniyalar va smenalar")} subtitle={tr("Ishlab chiqarish liniyalari (bosqich, quvvat) va ish smenalari")} />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              {tr("Ishlab chiqarish liniyalari")}
            </Typography>
            {canEdit && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => setLineDialog({ open: true, line: null })}>
                {tr("Liniya")}
              </Button>
            )}
          </CardContent>
          {lines === null && <LinearProgress />}
          <TableContainer>
            <Table size="small" sx={{ minWidth: 560 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Liniya")}</TableCell>
                  <TableCell>{tr("Bosqich")}</TableCell>
                  <TableCell align="right">{tr("Quvvat")}</TableCell>
                  <TableCell align="center">{tr("Xodim")}</TableCell>
                  <TableCell align="center">{tr("Mashina")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {lines?.map((l) => (
                  <TableRow key={l.id} hover sx={{ opacity: l.is_active ? 1 : 0.55 }}>
                    <TableCell>
                      <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{l.code}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {l.name}
                        {!l.is_active && tr(" · nofaol")}
                      </Typography>
                    </TableCell>
                    <TableCell>{STAGE_LABELS[l.stage]}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{l.capacity_per_shift ? tr("{0} dona", l.capacity_per_shift) : '—'}</TableCell>
                    <TableCell align="center">{l.employees_count}</TableCell>
                    <TableCell align="center">
                      {l.machines_count}
                      {l.machines_down > 0 && <Chip size="small" color="error" label={tr("{0} to'xtagan", l.machines_down)} sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell align="right">{actions(() => setLineDialog({ open: true, line: l }), () => setDeleting({ kind: 'line', item: l }))}</TableCell>
                  </TableRow>
                ))}
                {lines?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      {tr("Liniyalar yo'q — masalan «KS-1 Kesish sexi», «TK-1 Tikuv liniyasi»")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        <Card>
          <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
            <Typography variant="h6" sx={{ flex: 1 }}>
              {tr("Smenalar")}
            </Typography>
            {canEdit && (
              <Button size="small" startIcon={<AddIcon />} onClick={() => setShiftDialog({ open: true, shift: null })}>
                {tr("Smena")}
              </Button>
            )}
          </CardContent>
          {shifts === null && <LinearProgress />}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Smena")}</TableCell>
                  <TableCell>{tr("Vaqti")}</TableCell>
                  <TableCell align="right">{tr("Sof vaqt")}</TableCell>
                  <TableCell align="center">{tr("Xodim")}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {shifts?.map((s) => (
                  <TableRow key={s.id} hover sx={{ opacity: s.is_active ? 1 : 0.55 }}>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {s.name}
                      {s.is_night && <NightsStayOutlinedIcon fontSize="inherit" sx={{ ml: 0.75, verticalAlign: 'middle', color: 'text.secondary' }} />}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {hhmm(s.start_time)}–{hhmm(s.end_time)}
                      <Typography variant="caption" color="text.secondary" display="block">
                        {tr("tanaffus")}{' '}{s.break_minutes} {tr("daq")}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatDuration(s.work_minutes)}</TableCell>
                    <TableCell align="center">{s.employees_count}</TableCell>
                    <TableCell align="right">{actions(() => setShiftDialog({ open: true, shift: s }), () => setDeleting({ kind: 'shift', item: s }))}</TableCell>
                  </TableRow>
                ))}
                {shifts?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      {tr("Smenalar yo'q")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>

      <LineDialog open={lineDialog.open} line={lineDialog.line} onClose={() => setLineDialog({ open: false, line: null })} onSaved={() => { setLineDialog({ open: false, line: null }); load(); }} />
      <ShiftDialog open={shiftDialog.open} shift={shiftDialog.shift} onClose={() => setShiftDialog({ open: false, shift: null })} onSaved={() => { setShiftDialog({ open: false, shift: null }); load(); }} />
      <ConfirmDialog
        open={!!deleting}
        title={deleting?.kind === 'line' ? tr("Liniyani o'chirish") : tr("Smenani o'chirish")}
        message={tr("\"{0}\" o'chiriladi. Unga biriktirilgan xodim va mashinalar o'chmaydi — faqat biriktirilmagan bo'lib qoladi. Vaqtincha ishlatilmasa, nofaol qilish tavsiya etiladi.", deleting?.item.name)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

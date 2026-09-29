import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HandymanOutlinedIcon from '@mui/icons-material/HandymanOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { formatMoney } from '@/shared/utils/money';
import { resourcesApi } from '../api';
import { MachineStatusChip, MaintenanceDue } from '../components/MachineChips';
import MachineFormDialog from '../components/MachineFormDialog';
import { formatDuration, keys, MACHINE_STATUS_LABELS, MACHINE_TYPE_LABELS, MAINTENANCE_KIND_LABELS } from '../constants';
import { useResourcePermissions } from '../permissions';
import type { Employee, MachineDetail, MachineStatus, MaintenanceKind } from '../types';
import { formatDate, formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

// ---------- holatni o'zgartirish (sabab bilan) ----------

function StatusDialog({ machine, target, onClose, onDone }: { machine: MachineDetail; target: MachineStatus | null; onClose: () => void; onDone: (m: MachineDetail) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();
  useEffect(() => {
    if (!target) return;
    save.reset();
    setReason('');
    setError('');
  }, [target, save.reset]);
  const needsReason = target === 'BROKEN';
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!target || (needsReason && reason.trim().length < 3)) return;
    setError('');
    try {
      const m = await save.run(() => resourcesApi.changeStatus(machine.id, target, reason.trim()));
      toast.success(`${machine.code}: ${MACHINE_STATUS_LABELS[target]}`);
      onDone(m);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };
  return (
    <Dialog open={!!target} onClose={save.busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>
          {machine.code} → {target ? MACHINE_STATUS_LABELS[target] : ''}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label={needsReason ? tr("Buzilish sababi") : tr("Izoh (ixtiyoriy)")}
              required={needsReason}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              multiline
              minRows={2}
              placeholder={needsReason ? tr("Masalan: igna ushlagich sindi, motor qiziyapti") : ''}
              slotProps={{ htmlInput: { maxLength: 300 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={needsReason && reason.trim().length < 3} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

// ---------- texnik xizmat / ta'mir ----------

function MaintenanceDialog({ machine, open, onClose, onDone }: { machine: MachineDetail; open: boolean; onClose: () => void; onDone: (m: MachineDetail) => void }) {
  const [kind, setKind] = useState<MaintenanceKind>('REPAIR');
  const [description, setDescription] = useState('');
  const [parts, setParts] = useState('');
  const [duration, setDuration] = useState('');
  const [cost, setCost] = useState('');
  const [technician, setTechnician] = useState<Employee | null>(null);
  const [technicianName, setTechnicianName] = useState('');
  const [mechanics, setMechanics] = useState<Employee[]>([]);
  const [setStatus, setSetStatus] = useState<MachineStatus | ''>('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    const broken = machine.status === 'BROKEN' || machine.status === 'MAINTENANCE';
    setKind(machine.status === 'MAINTENANCE' ? 'PREVENTIVE' : 'REPAIR');
    setDescription('');
    setParts('');
    setDuration('');
    setCost('');
    setTechnician(null);
    setTechnicianName('');
    // Buzilgan/xizmatdagi mashina odatda tuzatilgach ishga qaytadi
    setSetStatus(broken ? 'WORKING' : '');
    resourcesApi
      .employees({ status: 'ACTIVE', limit: 200 })
      .then((r) => setMechanics(r.items.sort((a, b) => Number(b.department === 'MAINTENANCE') - Number(a.department === 'MAINTENANCE'))))
      .catch(() => setMechanics([]));
  }, [open, machine, save.reset]);

  const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));
  const d = num(duration);
  const c = num(cost);
  const valid = description.trim().length >= 3 && (d === null || (Number.isInteger(d) && d >= 0)) && (c === null || (Number.isFinite(c) && c >= 0));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      const m = await save.run(() =>
        resourcesApi.addMaintenance(machine.id, {
          kind,
          description: description.trim(),
          parts_used: parts.trim() || null,
          duration_minutes: d,
          cost: c,
          technician_id: technician?.id ?? null,
          technician_name: technician ? null : technicianName.trim() || null,
          set_status: setStatus || null,
        }),
      );
      toast.success(tr("{0} qayd etildi", MAINTENANCE_KIND_LABELS[kind]));
      onDone(m);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{tr("Texnik xizmat / ta'mir ·")}{' '}{machine.code}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField select label={tr("Turi")} value={kind} onChange={(e) => setKind(e.target.value as MaintenanceKind)}>
              {keys(MAINTENANCE_KIND_LABELS).map((k) => (
                <MenuItem key={k} value={k}>
                  {MAINTENANCE_KIND_LABELS[k]}
                </MenuItem>
              ))}
            </TextField>
            <TextField label={tr("Nima qilindi")} required autoFocus multiline minRows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={tr("Igna ushlagich almashtirildi, moylandi, sozlandi")} />
            <TextField label={tr("Ishlatilgan ehtiyot qismlar")} value={parts} onChange={(e) => setParts(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label={tr("Davomiyligi")} value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="numeric" slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("daq")}</InputAdornment> } }} />
              <TextField label={tr("Xarajat")} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("so'm")}</InputAdornment> } }} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Autocomplete
                options={mechanics}
                value={technician}
                onChange={(_, v) => setTechnician(v)}
                getOptionLabel={(e) => `${e.full_name} · ${e.employee_code}`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => <TextField {...params} label={tr("Bajargan xodim")} />}
              />
              <TextField label={tr("yoki tashqi usta")} value={technicianName} onChange={(e) => setTechnicianName(e.target.value)} disabled={!!technician} />
            </Box>
            <TextField select label={tr("Yakunida mashina holati")} value={setStatus} onChange={(e) => setSetStatus(e.target.value as MachineStatus | '')} helperText={tr("Tuzatilgan mashinani darhol ishga qaytarish")}>
              <MenuItem value="">{tr("O'zgarmasin (")}{MACHINE_STATUS_LABELS[machine.status]})</MenuItem>
              {keys(MACHINE_STATUS_LABELS)
                .filter((s) => s !== machine.status)
                .map((s) => (
                  <MenuItem key={s} value={s}>
                    {MACHINE_STATUS_LABELS[s]}
                  </MenuItem>
                ))}
            </TextField>
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

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 700, color: tone }}>{value}</Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

const STATUS_ACTIONS: { status: MachineStatus; label: string; icon: ReactNode; color: 'success' | 'inherit' | 'error' | 'warning' }[] = [
  { status: 'WORKING', label: tr("Ishga tushirish"), icon: <PlayArrowIcon />, color: 'success' },
  { status: 'IDLE', label: tr("To'xtatish"), icon: <PauseIcon />, color: 'inherit' },
  { status: 'BROKEN', label: tr("Buzildi"), icon: <ReportProblemOutlinedIcon />, color: 'error' },
  { status: 'MAINTENANCE', label: tr("Texnik xizmatga"), icon: <HandymanOutlinedIcon />, color: 'warning' },
];

export default function MachineDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const toast = useToast();
  const { canEditMachines: canEdit } = useResourcePermissions();
  const [m, setM] = useState<MachineDetail | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<MachineStatus | null>(null);
  const [maintOpen, setMaintOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setM(await resourcesApi.machine(Number(id)));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!m) return;
    setDeleting(true);
    try {
      await resourcesApi.removeMachine(m.id);
      toast.success(tr("Mashina o'chirildi"));
      navigate('/machines');
    } catch (e) {
      setError(getErrorMessage(e));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!m) {
    return error ? (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{error}</Typography>
        <Button component={RouterLink} to="/machines" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          {tr("Mashinalar")}
        </Button>
      </Box>
    ) : (
      <>
        <Skeleton width={140} />
        <Skeleton variant="rounded" height={200} sx={{ my: 2 }} />
        <Skeleton variant="rounded" height={300} />
      </>
    );
  }

  const s = m.stats;
  const info: [string, ReactNode][] = [
    [tr("Turi"), MACHINE_TYPE_LABELS[m.machine_type]],
    [tr("Brend / model"), [m.brand, m.model].filter(Boolean).join(' ') || '—'],
    [tr("Seriya raqami"), m.serial_number || '—'],
    [tr("Liniya"), m.line ? `${m.line.code} — ${m.line.name}` : '—'],
    [tr("Sotib olingan"), m.purchase_date ? formatDate(m.purchase_date) : '—'],
    [tr("Xizmat davriyligi"), m.maintenance_interval_days ? tr("har {0} kunda", m.maintenance_interval_days) : tr("Rejalashtirilmagan")],
    [tr("Oxirgi xizmat"), m.last_maintenance_date ? formatDate(m.last_maintenance_date) : '—'],
    [tr("Keyingi xizmat"), <MaintenanceDue key="due" machine={m} />],
  ];

  return (
    <>
      <Button component={RouterLink} to="/machines" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Mashinalar")}
      </Button>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                {m.code}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {m.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <MachineStatusChip machine={m} size="medium" />
                <Typography variant="body2" color="text.secondary">
                  {formatDuration(Math.max(0, Math.floor((Date.now() - new Date(m.status_since).getTime()) / 60000)))} {tr("shu holatda")}
                </Typography>
                {!m.is_active && <Chip size="small" label={tr("Nofaol")} />}
              </Box>
            </Box>
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {STATUS_ACTIONS.filter((a) => a.status !== m.status).map((a) => (
                  <Button key={a.status} variant="outlined" color={a.color} startIcon={a.icon} onClick={() => setTarget(a.status)} disabled={!m.is_active}>
                    {a.label}
                  </Button>
                ))}
                <Button variant="contained" startIcon={<BuildOutlinedIcon />} onClick={() => setMaintOpen(true)}>
                  {tr("Xizmat / ta'mir")}
                </Button>
                <Button color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
                  {tr("Tahrirlash")}
                </Button>
                <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteOpen(true)}>
                  {tr("O'chirish")}
                </Button>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            <Stat label={tr("Tayyorlik ({0} kun)", s.period_days)} value={`${s.availability_pct}%`} tone={s.availability_pct < 90 ? 'warning.main' : 'success.main'} />
            <Stat label={tr("To'xtab qolish")} value={formatDuration(s.downtime_minutes)} hint={tr("buzuq {0} · xizmat {1}", formatDuration(s.broken_minutes), formatDuration(s.maintenance_minutes))} />
            <Stat label={tr("Buzilishlar")} value={s.breakdowns} tone={s.breakdowns > 0 ? 'error.main' : undefined} />
            <Stat label={tr("Ta'mir xarajati")} value={formatMoney(s.repair_cost)} />
          </Box>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '340px 1fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {tr("Ma'lumotlar")}
            </Typography>
            {info.map(([label, value]) => (
              <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
                <Typography variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography variant="body2" component="div" sx={{ fontWeight: 500, textAlign: 'right' }}>
                  {value}
                </Typography>
              </Box>
            ))}
            {m.notes && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                {m.notes}
              </Typography>
            )}
          </CardContent>
        </Card>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="h6">{tr("Texnik xizmat va ta'mir tarixi")}</Typography>
            </CardContent>
            <TableContainer>
              <Table size="small" sx={{ minWidth: isMobile ? 560 : undefined }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{tr("Sana")}</TableCell>
                    <TableCell>{tr("Turi")}</TableCell>
                    <TableCell>{tr("Nima qilindi")}</TableCell>
                    <TableCell>{tr("Kim")}</TableCell>
                    <TableCell align="right">{tr("Xarajat")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {m.maintenance.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.performed_at)}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" color={r.kind === 'REPAIR' ? 'error' : 'info'} label={MAINTENANCE_KIND_LABELS[r.kind]} />
                      </TableCell>
                      <TableCell>
                        {r.description}
                        {(r.parts_used || r.duration_minutes) && (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {[r.parts_used, r.duration_minutes ? formatDuration(r.duration_minutes) : null].filter(Boolean).join(' · ')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{r.technician?.name ?? r.technician_name ?? '—'}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{r.cost !== null ? formatMoney(r.cost) : '—'}</TableCell>
                    </TableRow>
                  ))}
                  {m.maintenance.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                        {tr("Hali qayd yo'q")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>

          <Card>
            <CardContent sx={{ pb: 0 }}>
              <Typography variant="h6">{tr("Holat tarixi")}</Typography>
              <Typography variant="body2" color="text.secondary">
                {tr("To'xtab qolish vaqti va tayyorlik shu davrlardan hisoblanadi")}
              </Typography>
            </CardContent>
            <TableContainer>
              <Table size="small" sx={{ minWidth: isMobile ? 520 : undefined }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{tr("Holat")}</TableCell>
                    <TableCell>{tr("Boshlandi")}</TableCell>
                    <TableCell align="right">{tr("Davomiyligi")}</TableCell>
                    <TableCell>{tr("Sabab / kim")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {m.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <MachineStatusChip machine={h} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(h.started_at)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {formatDuration(h.duration_minutes)}
                        {!h.ended_at && <Chip size="small" label="hozir" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>
                        {h.reason ?? '—'}
                        <Typography variant="caption" color="text.secondary" display="block">
                          {h.created_by_name ?? ''}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Box>
      </Box>

      <StatusDialog machine={m} target={target} onClose={() => setTarget(null)} onDone={(x) => { setTarget(null); setM(x); }} />
      <MaintenanceDialog machine={m} open={maintOpen} onClose={() => setMaintOpen(false)} onDone={(x) => { setMaintOpen(false); setM(x); }} />
      <MachineFormDialog open={editOpen} machine={m} onClose={() => setEditOpen(false)} onSaved={(x) => { setEditOpen(false); setM(x); }} />
      <ConfirmDialog
        open={deleteOpen}
        title={tr("Mashinani o'chirish")}
        message={tr("\"{0}\" o'chiriladi. Ish yoki ta'mir tarixi bor mashinani o'chirib bo'lmaydi — uni nofaol qiling.", m.name)}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}

import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
  IconButton,
  Link,
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
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddTaskIcon from '@mui/icons-material/AddTask';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import BlockIcon from '@mui/icons-material/Block';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import WorkOrderStockCard from '@/features/logistics/components/WorkOrderStockCard';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { productionApi } from '../api';
import LabelsDialog from '../components/LabelsDialog';
import LogDialog from '../components/LogDialog';
import StagePipeline from '../components/StagePipeline';
import { WorkOrderStatusChip } from '../components/WorkOrderChips';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import { SOURCE_LABELS, STAGE_SHORT } from '../constants';
import { useProductionPermissions } from '../permissions';
import type { TrackingUnit, UnitKind, WorkOrderDetail } from '../types';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

function UnitDialog({ wo, open, onClose, onDone }: { wo: WorkOrderDetail; open: boolean; onClose: () => void; onDone: (w: WorkOrderDetail) => void }) {
  const [kind, setKind] = useState<UnitKind>('BUNDLE');
  const [qty, setQty] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setQty('');
    setKind(wo.progress.find((p) => p.stage === 'QUALITY_CONTROL')!.good > 0 ? 'BOX' : 'BUNDLE');
  }, [open, wo, save.reset]);
  const used = wo.units.filter((u) => u.kind === kind).reduce((s, u) => s + u.quantity, 0);
  const limit = wo.progress.find((p) => p.stage === (kind === 'BUNDLE' ? 'CUTTING' : 'QUALITY_CONTROL'))!.good - used;
  const n = Number(qty);
  const valid = Number.isInteger(n) && n >= 1 && n <= limit;
  const submit = async () => {
    setError('');
    try {
      const w = await save.run(() => productionApi.createUnit(wo.id, kind, n));
      toast.success(tr("{0} yaratildi", kind === 'BUNDLE' ? tr("Partiya") : tr("Quti")));
      onDone(w);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };
  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{tr("Partiya / quti")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label={tr("Turi")} value={kind} onChange={(e) => setKind(e.target.value as UnitKind)}>
            <MenuItem value="BUNDLE">{tr("Partiya (kesilgan to'plam)")}</MenuItem>
            <MenuItem value="BOX">{tr("Quti (sifatdan o'tgan)")}</MenuItem>
          </TextField>
          <TextField label={tr("Soni (dona)")} autoFocus value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" error={qty !== '' && !valid} helperText={tr("Ajratish mumkin: {0} dona", Math.max(limit, 0))} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" disabled={save.busy}>
          {tr("Bekor qilish")}
        </Button>
        <SaveButton status={save.status} disabled={!valid} onClick={submit} type="button">
          {tr("Yaratish")}
        </SaveButton>
      </DialogActions>
    </Dialog>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: string }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 700, color: tone }}>{value}</Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  );
}

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const isMobile = useIsMobile();
  const toast = useToast();
  const { canEdit, canLog } = useProductionPermissions();
  const [wo, setWo] = useState<WorkOrderDetail | null>(null);
  const [error, setError] = useState('');
  const [logOpen, setLogOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [unitOpen, setUnitOpen] = useState(false);
  const [labels, setLabels] = useState<TrackingUnit[] | null>(null);
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | { log: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setWo(await productionApi.get(Number(id)));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const runConfirm = async () => {
    if (!wo || !confirm) return;
    setBusy(true);
    try {
      if (confirm === 'complete') setWo(await productionApi.complete(wo.id));
      else if (confirm === 'cancel') setWo(await productionApi.cancel(wo.id));
      else setWo(await productionApi.deleteLog(confirm.log));
      toast.success(confirm === 'complete' ? tr("Ish buyurtmasi yakunlandi") : confirm === 'cancel' ? tr("Ish buyurtmasi bekor qilindi") : tr("Yozuv o'chirildi"));
      setConfirm(null);
    } catch (e) {
      setError(getErrorMessage(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  if (!wo) {
    return error ? (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{error}</Typography>
        <Button component={RouterLink} to="/production" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          {tr("Ish buyurtmalari")}
        </Button>
      </Box>
    ) : (
      <>
        <Skeleton width={160} />
        <Skeleton variant="rounded" height={220} sx={{ my: 2 }} />
        <Skeleton variant="rounded" height={300} />
      </>
    );
  }

  const open = wo.status === 'PLANNED' || wo.status === 'IN_PROGRESS';
  const f = wo.fabric;
  const overuse = f.per_piece !== null && f.per_piece_planned !== null ? ((f.per_piece - f.per_piece_planned) / f.per_piece_planned) * 100 : null;

  return (
    <>
      <Button component={RouterLink} to="/production" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Ish buyurtmalari")}
      </Button>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h5" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {wo.number}
                </Typography>
                <WorkOrderStatusChip wo={wo} />
              </Box>
              <Typography sx={{ fontWeight: 600, mt: 0.5 }}>
                {wo.product_name} <Typography component="span" color="text.secondary">({[wo.product_code, wo.size, wo.color].filter(Boolean).join(' · ')})</Typography>
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {wo.order_id ? (
                  <>
                    {tr("Buyurtma")}{' '}
                    <Link component={RouterLink} to={`/orders/${wo.order_id}`}>
                      {wo.order_number}
                    </Link>{' '}
                    · {wo.customer_name}
                  </>
                ) : (
                  tr("Ombor uchun")
                )}
                {wo.line && tr(" · liniya {0}", wo.line.code)}
                {wo.planned_end && tr(" · muddat {0}", formatDate(wo.planned_end))}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {canLog && open && (
                <Button variant="contained" startIcon={<AddTaskIcon />} onClick={() => setLogOpen(true)}>
                  {tr("Ishni qayd etish")}
                </Button>
              )}
              {canEdit && open && (
                <>
                  <Button color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
                    {tr("Tahrirlash")}
                  </Button>
                  <Button color="success" startIcon={<DoneAllIcon />} onClick={() => setConfirm('complete')} disabled={wo.finished === 0}>
                    {tr("Yakunlash")}
                  </Button>
                  <Button color="error" startIcon={<BlockIcon />} onClick={() => setConfirm('cancel')}>
                    {tr("Bekor qilish")}
                  </Button>
                </>
              )}
            </Box>
          </Box>
          <StagePipeline wo={wo} />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mt: 2.5 }}>
            <Stat label={tr("Tayyor (qadoqlangan)")} value={`${wo.finished} / ${wo.quantity}`} hint={`${wo.percent}%${wo.overcut_pct ? tr(" · ortiqcha kesish {0}%", wo.overcut_pct) : ''}`} />
            <Stat label={tr("Mato sarfi")} value={tr("{0} m", f.used)} hint={f.planned !== null ? tr("Reja: {0} m", f.planned) : tr("BOM'da mato yo'q")} />
            <Stat
              label={tr("1 donaga mato")}
              value={f.per_piece !== null ? tr("{0} m", f.per_piece) : '—'}
              tone={overuse !== null && overuse > 0 ? 'error.main' : undefined}
              hint={f.per_piece_planned !== null ? tr("Reja: {0} m{1}", f.per_piece_planned, overuse !== null ? ` (${overuse > 0 ? '+' : ''}${overuse.toFixed(1)}%)` : '') : undefined}
            />
            <Stat label={tr("Kesish chiqindisi")} value={tr("{0} m", f.waste)} tone={f.waste_pct !== null && f.waste_pct > 10 ? 'warning.main' : undefined} hint={f.waste_pct !== null ? tr("{0}% sarfdan", f.waste_pct) : undefined} />
          </Box>
          {wo.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              {wo.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      <WorkOrderStockCard woId={wo.id} packedKey={wo.finished} />

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 360px' }, alignItems: 'start' }}>
        <Card>
          <CardContent sx={{ pb: 0 }}>
            <Typography variant="h6">{tr("Bosqichlar bo'yicha yozuvlar")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("Kim, qachon, qaysi mashinada — KPI va sifat tahlili shu yozuvlardan")}
            </Typography>
          </CardContent>
          <TableContainer>
            <Table size="small" sx={{ minWidth: isMobile ? 760 : undefined }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Sana")}</TableCell>
                  <TableCell>{tr("Bosqich")}</TableCell>
                  <TableCell align="right">{tr("Yaroqli")}</TableCell>
                  <TableCell align="right">{tr("Brak")}</TableCell>
                  <TableCell>{tr("Xodim / mashina")}</TableCell>
                  <TableCell>{tr("Izoh")}</TableCell>
                  {canEdit && open && <TableCell />}
                </TableRow>
              </TableHead>
              <TableBody>
                {wo.logs.map((l) => (
                  <TableRow key={l.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDate(l.work_date)}
                      <Typography variant="caption" color="text.secondary" display="block">
                        {SOURCE_LABELS[l.source]}
                        {l.unit_code && ` · ${l.unit_code}`}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={STAGE_SHORT[l.stage]} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {l.quantity_good}
                    </TableCell>
                    <TableCell align="right" sx={{ color: l.quantity_defect ? 'error.main' : undefined }}>
                      {l.quantity_defect || '—'}
                    </TableCell>
                    <TableCell>
                      {l.employee?.name ?? '—'}
                      <Typography variant="caption" color="text.secondary" display="block">
                        {[l.machine?.code, l.line?.code, l.shift?.name].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      {l.defect_reason && (
                        <Typography variant="body2" color="error.main">
                          {l.defect_reason}
                        </Typography>
                      )}
                      {l.fabric_used !== null && (
                        <Typography variant="body2">
                          {tr("Mato")}{' '}{l.fabric_used} {tr("m")}{l.fabric_waste ? tr(", chiqindi {0} m", l.fabric_waste) : ''}
                        </Typography>
                      )}
                      {l.note && (
                        <Typography variant="body2" color="text.secondary">
                          {l.note}
                        </Typography>
                      )}
                    </TableCell>
                    {canEdit && open && (
                      <TableCell align="right">
                        <Tooltip title={tr("Xato kiritilgan — o'chirish")}>
                          <IconButton size="small" color="error" onClick={() => setConfirm({ log: l.id })}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {wo.logs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      {tr("Hali yozuv yo'q. Kesish boshlanganda «Ishni qayd etish» tugmasini bosing.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="h6" sx={{ flex: 1 }}>
                {tr("Partiya va qutilar")}
              </Typography>
              {wo.units.length > 0 && (
                <Tooltip title={tr("QR yorliqlarni chop etish")}>
                  <IconButton onClick={() => setLabels(wo.units)}>
                    <QrCode2Icon />
                  </IconButton>
                </Tooltip>
              )}
              {canEdit && wo.status !== 'CANCELLED' && (
                <Button size="small" onClick={() => setUnitOpen(true)}>
                  {tr("Yaratish")}
                </Button>
              )}
            </Box>
            {wo.units.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                {tr("Kesilgan mahsulotni partiyalarga, tayyorini qutilarga ajrating — har biriga QR yorliq bosiladi va skaner orqali kuzatiladi.")}
              </Typography>
            )}
            {wo.units.map((u) => (
              <Box key={u.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{u.code}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {u.kind === 'BUNDLE' ? tr("Partiya") : tr("Quti")} · {u.quantity} {tr("dona")}
                    {u.stages_done.length > 0 && ` · ${u.stages_done.map((s) => STAGE_SHORT[s]).join(' → ')}`}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => setLabels([u])}>
                  <QrCode2Icon fontSize="small" />
                </IconButton>
              </Box>
            ))}
          </CardContent>
        </Card>
      </Box>

      <LogDialog open={logOpen} wo={wo} onClose={() => setLogOpen(false)} onDone={(w) => { setLogOpen(false); setWo(w); }} />
      <WorkOrderFormDialog open={editOpen} wo={wo} onClose={() => setEditOpen(false)} onSaved={(w) => { setEditOpen(false); setWo(w); }} />
      <UnitDialog wo={wo} open={unitOpen} onClose={() => setUnitOpen(false)} onDone={(w) => { setUnitOpen(false); setWo(w); }} />
      <LabelsDialog open={!!labels} units={labels ?? []} onClose={() => setLabels(null)} />
      <ConfirmDialog
        open={!!confirm}
        title={confirm === 'complete' ? tr("Ish buyurtmasini yakunlash") : confirm === 'cancel' ? tr("Ish buyurtmasini bekor qilish") : tr("Yozuvni o'chirish")}
        message={
          confirm === 'complete'
            ? `${wo.finished} / ${wo.quantity} dona qadoqlangan. Qolgani ishlab chiqarilmaydi. Davom etasizmi?`
            : confirm === 'cancel'
              ? tr("{0} bekor qilinadi. Kiritilgan yozuvlar tarix sifatida saqlanadi.", wo.number)
              : tr("Xato kiritilgan yozuv o'chiriladi (keyingi bosqich unga tayanmagan bo'lsa). Audit log'da qoladi.")
        }
        confirmText={confirm === 'complete' ? tr("Yakunlash") : confirm === 'cancel' ? tr("Bekor qilish") : tr("O'chirish")}
        loading={busy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

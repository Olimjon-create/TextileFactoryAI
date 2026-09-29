import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  IconButton,
  LinearProgress,
  MenuItem,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import WifiIcon from '@mui/icons-material/Wifi';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { STAGE_LABELS } from '@/features/resources/constants';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { MobileListEmpty, MobileListItem } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { visionApi } from '../api';
import ApplyEventDialog from '../components/ApplyEventDialog';
import DeviceFormDialog from '../components/DeviceFormDialog';
import DeviceKeyDialog from '../components/DeviceKeyDialog';
import RuleFormDialog from '../components/RuleFormDialog';
import { DEVICE_KIND_LABELS, EVENT_STATUS_COLORS, EVENT_STATUS_LABELS, EVENT_TYPE_LABELS, RULE_ACTION_LABELS } from '../constants';
import { useCanEditVision } from '../permissions';
import type { Device, DeviceWithKey, EventStatus, EventType, Rule, VisionEvent, VisionSummary } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

type View = 'devices' | 'events' | 'rules';
const PATHS: Record<View, string> = { devices: '/vision', events: '/vision/events', rules: '/vision/rules' };
const ago = (iso: string | null) => (iso ? formatDateTime(iso) : tr("hali aloqa yo'q"));

function DevicesTab({ devices, canEdit, reload }: { devices: Device[]; canEdit: boolean; reload: () => void }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const [form, setForm] = useState<{ device: Device | null } | null>(null);
  const [key, setKey] = useState<DeviceWithKey | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'rotate' | 'delete'; device: Device } | null>(null);
  const [error, setError] = useState('');

  const act = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'rotate') setKey(await visionApi.rotateKey(confirm.device.id));
      else {
        await visionApi.removeDevice(confirm.device.id);
        toast.success(tr("{0} o'chirildi", confirm.device.code));
      }
      reload();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setConfirm(null);
    }
  };

  const where = (d: Device) => [d.stage ? STAGE_LABELS[d.stage] : null, d.line?.code, d.machine?.code].filter(Boolean).join(' · ') || '—';
  const status = (d: Device) =>
    !d.is_active ? <Chip size="small" label={tr("Nofaol")} /> : d.online ? <Chip size="small" color="success" icon={<WifiIcon />} label={tr("Onlayn")} /> : <Chip size="small" variant="outlined" label={tr("Oflayn")} />;

  return (
    <>
      {error && <Alert severity="error" sx={{ m: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {canEdit && (
        <Box sx={{ p: 2, pb: 0 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ device: null })}>
            {tr("Qurilma qo'shish")}
          </Button>
        </Box>
      )}
      {isMobile ? (
        <Box sx={{ mt: 1 }}>
          {devices.map((d) => (
            <MobileListItem
              key={d.id}
              onClick={canEdit ? () => setForm({ device: d }) : undefined}
              overline={`${d.code} · ${DEVICE_KIND_LABELS[d.kind]}`}
              title={d.name}
              subtitle={tr("{0}{1} · bugun {2} hodisa", where(d), d.work_order ? ` · ${d.work_order.code}` : '', d.events_today)}
              trailing={status(d)}
            />
          ))}
          {devices.length === 0 && <MobileListEmpty>{tr("Qurilmalar yo'q")}</MobileListEmpty>}
        </Box>
      ) : (
        <TableContainer>
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Qurilma")}</TableCell>
                <TableCell>{tr("Kuzatadi")}</TableCell>
                <TableCell>{tr("Ish buyurtmasi")}</TableCell>
                <TableCell>{tr("Aloqa")}</TableCell>
                <TableCell align="center">{tr("Bugun / kutilmoqda")}</TableCell>
                <TableCell>{tr("Kalit")}</TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.map((d) => (
                <TableRow key={d.id} hover sx={{ opacity: d.is_active ? 1 : 0.6 }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                      {d.code} — {d.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {DEVICE_KIND_LABELS[d.kind]}
                    </Typography>
                  </TableCell>
                  <TableCell>{where(d)}</TableCell>
                  <TableCell>{d.work_order ? <RouterLink to={`/production/${d.work_order.id}`}>{d.work_order.code}</RouterLink> : '—'}</TableCell>
                  <TableCell>
                    {status(d)}
                    <Typography variant="caption" color="text.secondary" display="block">
                      {ago(d.last_seen_at)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {d.events_today} / {d.pending ? <Chip size="small" color="warning" label={d.pending} /> : 0}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>{d.key_prefix}…</TableCell>
                  {canEdit && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Tooltip title={tr("Tahrirlash / ish buyurtmasini biriktirish")}>
                        <IconButton size="small" onClick={() => setForm({ device: d })}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={tr("Kalitni almashtirish")}>
                        <IconButton size="small" onClick={() => setConfirm({ kind: 'rotate', device: d })}>
                          <KeyOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={tr("O'chirish")}>
                        <IconButton size="small" color="error" onClick={() => setConfirm({ kind: 'delete', device: d })}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {devices.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {tr("Qurilmalar yo'q. Kamera yoki AI-qutini qo'shing — unga beriladigan kalit bilan hodisalar yuboriladi.")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <DeviceFormDialog
        open={!!form}
        device={form?.device}
        onClose={() => setForm(null)}
        onSaved={(d) => {
          setForm(null);
          if ('api_key' in d) setKey(d);
          reload();
        }}
      />
      <DeviceKeyDialog device={key} onClose={() => setKey(null)} />
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.kind === 'rotate' ? tr("Kalitni almashtirish") : tr("Qurilmani o'chirish")}
          message={
            confirm.kind === 'rotate'
              ? tr("{0}: eski kalit darhol ishlamay qoladi. Yangi kalitni qurilmaga kiritish kerak.", confirm.device.code)
              : tr("{0} o'chiriladi (hodisalar tarixi bo'lsa — faqat nofaol qilish mumkin).", confirm.device.code)
          }
          confirmText={confirm.kind === 'rotate' ? tr("Almashtirish") : tr("O'chirish")}
          onConfirm={act}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function EventsTab({ devices, canEdit, onChanged }: { devices: Device[]; canEdit: boolean; onChanged: () => void }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const [status, setStatus] = useState<EventStatus | ''>('PENDING');
  const [deviceId, setDeviceId] = useState<number | ''>('');
  const [type, setType] = useState<EventType | ''>('');
  const [items, setItems] = useState<VisionEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState<VisionEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await visionApi.events({ status, device_id: deviceId, event_type: type, offset: page * 50, limit: 50 });
      setItems(res.items);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [status, deviceId, type, page]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => setPage(0), [status, deviceId, type]);

  const reject = async (e: VisionEvent) => {
    try {
      await visionApi.rejectEvent(e.id);
      toast.success(tr("Hodisa rad etildi"));
      load();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const what = (e: VisionEvent) =>
    e.event_type === 'MACHINE_STATE'
      ? tr("Mashina: {0}", e.machine_state ?? '—')
      : e.event_type === 'CUSTOM'
        ? JSON.stringify(e.payload ?? {}).slice(0, 60)
        : tr("{0} dona{1}{2}", e.quantity ?? 1, e.defect_reason ? ` · ${e.defect_reason}` : '', e.stage ? ` · ${STAGE_LABELS[e.stage]}` : '');

  return (
    <>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', p: 2, pb: 1 }}>
        <TextField select size="small" label={tr("Holat")} value={status} onChange={(e) => setStatus(e.target.value as EventStatus | '')} sx={{ width: 220 }}>
          <MenuItem value="">{tr("Barchasi")}</MenuItem>
          {(Object.keys(EVENT_STATUS_LABELS) as EventStatus[]).map((s) => (
            <MenuItem key={s} value={s}>
              {EVENT_STATUS_LABELS[s]}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={tr("Qurilma")} value={deviceId} onChange={(e) => setDeviceId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 200 }}>
          <MenuItem value="">{tr("Barchasi")}</MenuItem>
          {devices.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.code}
            </MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label={tr("Turi")} value={type} onChange={(e) => setType(e.target.value as EventType | '')} sx={{ width: 180 }}>
          <MenuItem value="">{tr("Barchasi")}</MenuItem>
          {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((t) => (
            <MenuItem key={t} value={t}>
              {EVENT_TYPE_LABELS[t]}
            </MenuItem>
          ))}
        </TextField>
      </Box>
      {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }} onClose={() => setError('')}>{error}</Alert>}
      {loading && <LinearProgress />}
      {isMobile ? (
        <Box>
          {items.map((e) => (
            <MobileListItem
              key={e.id}
              overline={`${formatDateTime(e.occurred_at)} · ${e.device.code}`}
              title={`${EVENT_TYPE_LABELS[e.event_type]}: ${what(e)}`}
              subtitle={e.status_message ?? undefined}
              trailing={<Chip size="small" color={EVENT_STATUS_COLORS[e.status]} label={EVENT_STATUS_LABELS[e.status]} />}
              actions={
                canEdit && e.status === 'PENDING' && e.event_type !== 'CUSTOM' ? (
                  <>
                    <Button size="small" onClick={() => setApplying(e)}>
                      {tr("Qo'llash")}
                    </Button>
                    <Button size="small" color="error" onClick={() => reject(e)}>
                      {tr("Rad etish")}
                    </Button>
                  </>
                ) : undefined
              }
            />
          ))}
          {!loading && items.length === 0 && <MobileListEmpty>{tr("Hodisalar yo'q")}</MobileListEmpty>}
        </Box>
      ) : (
        <TableContainer>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Vaqt")}</TableCell>
                <TableCell>{tr("Qurilma")}</TableCell>
                <TableCell>{tr("Hodisa")}</TableCell>
                <TableCell align="right">{tr("Ishonch")}</TableCell>
                <TableCell>{tr("Ish buyurtmasi")}</TableCell>
                <TableCell>{tr("Holat")}</TableCell>
                {canEdit && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.occurred_at)}</TableCell>
                  <TableCell>{e.device.code}</TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {EVENT_TYPE_LABELS[e.event_type]}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {what(e)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{e.confidence != null ? `${Math.round(e.confidence * 100)}%` : '—'}</TableCell>
                  <TableCell>{e.work_order ? <RouterLink to={`/production/${e.work_order.id}`}>{e.work_order.code}</RouterLink> : '—'}</TableCell>
                  <TableCell sx={{ maxWidth: 320 }}>
                    <Chip size="small" color={EVENT_STATUS_COLORS[e.status]} label={EVENT_STATUS_LABELS[e.status]} />
                    {e.status_message && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {e.status_message}
                      </Typography>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {e.status === 'PENDING' && e.event_type !== 'CUSTOM' && (
                        <>
                          <Tooltip title={tr("Qo'llash")}>
                            <IconButton size="small" color="success" onClick={() => setApplying(e)}>
                              <CheckIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={tr("Rad etish")}>
                            <IconButton size="small" color="error" onClick={() => reject(e)}>
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {tr("Hodisalar yo'q")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={50}
        rowsPerPageOptions={[50]}
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
      />
      <ApplyEventDialog
        event={applying}
        onClose={() => setApplying(null)}
        onDone={() => {
          setApplying(null);
          toast.success(tr("Hodisa qo'llandi — ishlab chiqarish yozuvi yaratildi"));
          load();
          onChanged();
        }}
      />
    </>
  );
}

function RulesTab({ devices, canEdit }: { devices: Device[]; canEdit: boolean }) {
  const toast = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState<{ rule: Rule | null } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    visionApi.rules().then(setRules).catch((e) => setError(getErrorMessage(e)));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <Box sx={{ p: 2 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {tr("Qoida bo'lmasa — har bir sanoq, brak va mashina holati hodisasini odam tasdiqlaydi. Aniq qurilma uchun qoida umumiy qoidadan ustun.")}
        </Alert>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({ rule: null })}>
            {tr("Qoida qo'shish")}
          </Button>
        )}
      </Box>
      <TableContainer>
        <Table sx={{ minWidth: 760 }}>
          <TableHead>
            <TableRow>
              <TableCell>{tr("Hodisa")}</TableCell>
              <TableCell>{tr("Qurilma")}</TableCell>
              <TableCell>{tr("Amal")}</TableCell>
              <TableCell align="right">{tr("Min. ishonch")}</TableCell>
              <TableCell>{tr("Ogohlantirish")}</TableCell>
              {canEdit && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} hover sx={{ opacity: r.is_active ? 1 : 0.5 }}>
                <TableCell sx={{ fontWeight: 600 }}>{EVENT_TYPE_LABELS[r.event_type]}</TableCell>
                <TableCell>{r.device ? `${r.device.code} — ${r.device.name}` : tr("Barchasi")}</TableCell>
                <TableCell>
                  <Chip size="small" color={r.action === 'AUTO_APPLY' ? 'success' : r.action === 'REVIEW' ? 'warning' : 'default'} label={RULE_ACTION_LABELS[r.action]} />
                </TableCell>
                <TableCell align="right">{r.action === 'AUTO_APPLY' ? `${Math.round(r.min_confidence * 100)}%` : '—'}</TableCell>
                <TableCell>{r.alert_threshold ? tr("{0} ta / {1} daq", r.alert_threshold, r.alert_window_minutes) : '—'}</TableCell>
                {canEdit && (
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton size="small" onClick={() => setForm({ rule: r })}>
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() =>
                        visionApi
                          .removeRule(r.id)
                          .then(() => {
                            toast.success(tr("Qoida o'chirildi"));
                            load();
                          })
                          .catch((e) => setError(getErrorMessage(e)))
                      }
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                  {tr("Qoidalar yo'q — hamma hodisa tasdiqlashga tushadi")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <RuleFormDialog
        open={!!form}
        rule={form?.rule}
        devices={devices}
        onClose={() => setForm(null)}
        onSaved={() => {
          setForm(null);
          load();
        }}
      />
    </>
  );
}

/** Kameralar va AI: qurilmalar, hodisalar (tasdiqlash navbati) va qayta ishlash qoidalari */
export default function VisionPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const canEdit = useCanEditVision();
  const view: View = location.pathname.endsWith('/events') ? 'events' : location.pathname.endsWith('/rules') ? 'rules' : 'devices';
  const [devices, setDevices] = useState<Device[]>([]);
  const [summary, setSummary] = useState<VisionSummary | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    Promise.all([visionApi.devices(), visionApi.summary()])
      .then(([d, s]) => {
        setDevices(d);
        setSummary(s);
        setError('');
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader title={tr("Kameralar va AI")} subtitle={tr("Kamera/AI sanog'i, brak aniqlash va mashina sensorlari — ishlab chiqarish yozuvlariga avtomatik yoki tasdiqlash orqali")} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 3 }}>
        <StatCard label={tr("Qurilmalar (onlayn)")} value={summary ? `${summary.online} / ${summary.devices}` : '—'} icon={<VideocamOutlinedIcon />} />
        <StatCard label={tr("Tasdiqlash kutilmoqda")} value={summary?.pending ?? '—'} icon={<PendingActionsOutlinedIcon />} color={summary?.pending ? 'warning.main' : 'grey.500'} />
        <StatCard label={tr("Bugun kamera sanadi")} value={summary ? tr("{0} dona", summary.counted_today) : '—'} icon={<CheckIcon />} color="success.main" hint={summary ? tr("{0} hodisa", summary.events_today) : undefined} />
        <StatCard label={tr("Bugun aniqlangan brak")} value={summary ? tr("{0} dona", summary.defects_today) : '—'} icon={<ReportProblemOutlinedIcon />} color="error.main" />
      </Box>
      <Card>
        <Tabs value={view} onChange={(_, v: View) => navigate(PATHS[v])} sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }} variant="scrollable">
          <Tab value="devices" label={tr("Qurilmalar")} />
          <Tab value="events" label={summary?.pending ? tr("Hodisalar · {0}", summary.pending) : tr("Hodisalar")} />
          <Tab value="rules" label={tr("Qoidalar")} />
        </Tabs>
        {view === 'devices' && <DevicesTab devices={devices} canEdit={canEdit} reload={load} />}
        {view === 'events' && <EventsTab devices={devices} canEdit={canEdit} onChanged={load} />}
        {view === 'rules' && <RulesTab devices={devices} canEdit={canEdit} />}
      </Card>
    </>
  );
}

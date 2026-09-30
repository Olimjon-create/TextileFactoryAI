import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
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
  TextField,
  Typography,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import TelegramIcon from '@mui/icons-material/Telegram';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import { useToast } from '@/shared/components/Toast';
import { formatDate } from '@/shared/utils/dates';
import { resourcesApi } from '../api';
import EmployeeFormDialog from '../components/EmployeeFormDialog';
import FactoryField from '../components/FactoryField';
import { DEPARTMENT_LABELS, keys, PAY_RATE_UNIT, PAY_TYPE_LABELS } from '../constants';
import { useResourcePermissions } from '../permissions';
import type { Department, JoinLink, JoinRequest, PayType } from '../types';
import { tr } from '@/i18n';

const POLL_MS = 20_000;

export default function AddEmployeePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { canEditWorkforce } = useResourcePermissions();
  const [requests, setRequests] = useState<JoinRequest[] | null>(null);
  const [approving, setApproving] = useState<JoinRequest | null>(null);
  const [error, setError] = useState('');

  const loadRequests = useCallback(() => {
    resourcesApi.joinRequests().then(setRequests).catch(() => setRequests([]));
  }, []);

  useEffect(() => {
    loadRequests();
    const timer = window.setInterval(loadRequests, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadRequests]);

  const reject = async (r: JoinRequest) => {
    setError('');
    try {
      await resourcesApi.rejectJoin(r.id);
      toast.success(tr("{0} so'rovi rad etildi", r.full_name));
    } catch (e) {
      setError(getErrorMessage(e));
    }
    loadRequests();
  };

  if (!canEditWorkforce) {
    return <Alert severity="info">{tr("Xodim qo'shish uchun ruxsat yo'q")}</Alert>;
  }

  return (
    <>
      <PageHeader
        title={tr("Xodim qo'shish")}
        subtitle={tr("Qo'lda kiriting yoki Telegram havolasini yuboring — xodim o'zi so'rov yuboradi, siz tasdiqlaysiz")}
        action={
          <Button variant="outlined" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/employees')}>
            {tr("Xodimlar ro'yxati")}
          </Button>
        }
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' }, alignItems: 'start' }}>
        <EmployeeFormDialog
          inline
          open
          employee={null}
          onClose={() => undefined}
          onSaved={(e) => toast.success(tr("{0} qo'shildi", e.full_name))}
        />
        <Stack spacing={{ xs: 2, md: 3 }}>
          <JoinRequestsCard requests={requests} onApprove={setApproving} onReject={reject} />
          <TelegramInviteCard pending={requests?.length ?? 0} />
        </Stack>
      </Box>
      <ApproveDialog
        request={approving}
        onClose={() => setApproving(null)}
        onDone={(name) => {
          setApproving(null);
          toast.success(tr("{0} qo'shildi", name));
          loadRequests();
        }}
      />
    </>
  );
}

function TelegramInviteCard({ pending }: { pending: number }) {
  const toast = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [link, setLink] = useState<JoinLink | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSuperAdmin && factoryId === '') return;
    setLink(null);
    setQr('');
    setError('');
    resourcesApi
      .joinLink(factoryId === '' ? undefined : factoryId)
      .then((l) => {
        setLink(l);
        if (l.link_url) QRCode.toDataURL(l.link_url, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(''));
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [isSuperAdmin, factoryId]);

  const copy = () => {
    if (!link?.link_url) return;
    navigator.clipboard.writeText(link.link_url).then(() => toast.success(tr('Havola nusxalandi'))).catch(() => undefined);
  };

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <TelegramIcon color="primary" />
          <Typography variant="h6" sx={{ flex: 1 }}>
            {tr("Telegram orqali taklif")}
          </Typography>
          {pending > 0 && <Chip size="small" color="warning" label={tr("{0} ta so'rov", pending)} />}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {tr("Xodim QR kodni skanerlaydi yoki havolani ochadi, «📱 Raqamni yuborish» tugmasini bosadi. So'rov shu sahifaga va zavod Telegram chatiga keladi — bo'limni tanlab qabul qilasiz. Qabul qilingan xodim botda o'z natijasi va ish haqini darhol ko'radi.")}
        </Typography>
        {isSuperAdmin && (
          <Box sx={{ mb: 2, display: 'grid' }}>
            <FactoryField value={factoryId} onChange={setFactoryId} />
          </Box>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {isSuperAdmin && factoryId === '' ? null : !link ? (
          !error && <Skeleton variant="rounded" height={240} />
        ) : !link.enabled ? (
          <Alert severity="info">{tr('Telegram bot hali sozlanmagan.')}</Alert>
        ) : (
          <>
            {!link.factory_linked && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                {tr("Zavod Telegram chati ulanmagan — so'rovlar faqat shu sahifada ko'rinadi. Sozlamalar → Telegram bo'limidan ulang.")}
              </Alert>
            )}
            <Box sx={{ display: 'grid', placeItems: 'center', mb: 1.5 }}>
              {qr ? (
                <img src={qr} alt="QR" width={200} height={200} style={{ background: '#fff', padding: 8, borderRadius: 12 }} />
              ) : (
                <Skeleton variant="rounded" width={200} height={200} />
              )}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all', fontFamily: 'monospace', textAlign: 'center', mb: 1.5 }}>
              {link.link_url}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={copy}>
                {tr('Nusxalash')}
              </Button>
              {link.link_url && (
                <Button component="a" href={`https://t.me/share/url?url=${encodeURIComponent(link.link_url)}`} target="_blank" rel="noopener">
                  {tr("Telegram'da yuborish")}
                </Button>
              )}
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function JoinRequestsCard({
  requests,
  onApprove,
  onReject,
}: {
  requests: JoinRequest[] | null;
  onApprove: (r: JoinRequest) => void;
  onReject: (r: JoinRequest) => void;
}) {
  const { user } = useAuth();
  if (requests !== null && requests.length === 0) return null;
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          {tr("Kelgan so'rovlar")}
        </Typography>
        {requests === null
          ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} height={56} />)
          : requests.map((r) => (
              <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, borderTop: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
                <Avatar sx={{ width: 34, height: 34, bgcolor: 'warning.main', fontSize: 13, fontWeight: 800 }}>{r.full_name.slice(0, 1).toUpperCase()}</Avatar>
                <Box sx={{ flex: 1, minWidth: 140 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
                    {r.full_name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div" noWrap>
                    {[r.phone, formatDate(r.created_at), user?.role === 'SUPER_ADMIN' ? r.factory_name : null].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Button size="small" color="inherit" onClick={() => onReject(r)}>
                    {tr('Rad etish')}
                  </Button>
                  <Button size="small" variant="contained" onClick={() => onApprove(r)}>
                    {tr('Qabul qilish')}
                  </Button>
                </Box>
              </Box>
            ))}
      </CardContent>
    </Card>
  );
}

function ApproveDialog({ request, onClose, onDone }: { request: JoinRequest | null; onClose: () => void; onDone: (name: string) => void }) {
  const { canSeePay } = useResourcePermissions();
  const [department, setDepartment] = useState<Department>('SEWING');
  const [position, setPosition] = useState('');
  const [payType, setPayType] = useState<PayType>('MONTHLY');
  const [payRate, setPayRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!request) return;
    setDepartment('SEWING');
    setPosition('');
    setPayType('MONTHLY');
    setPayRate('');
    setError('');
  }, [request]);

  const rate = payRate.trim() === '' ? null : Number(payRate.replace(/\s/g, '').replace(',', '.'));
  const rateError = rate !== null && (!Number.isFinite(rate) || rate < 0);

  const submit = async () => {
    if (!request || rateError) return;
    setBusy(true);
    setError('');
    try {
      const saved = await resourcesApi.approveJoin(request.id, {
        department,
        position: position.trim() || null,
        ...(canSeePay ? { pay_type: payType, pay_rate: rate } : {}),
      });
      onDone(saved.full_name);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!request} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {tr('Qabul qilish')}
        <Typography variant="body2" color="text.secondary">
          {request?.full_name} {request?.phone ? `· ${request.phone}` : ''}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label={tr("Bo'lim")} value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
            {keys(DEPARTMENT_LABELS).map((d) => (
              <MenuItem key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </MenuItem>
            ))}
          </TextField>
          <TextField label={tr('Lavozim')} value={position} onChange={(e) => setPosition(e.target.value)} placeholder={tr('Tikuvchi, bichuvchi, mexanik...')} />
          {canSeePay && (
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField select label={tr("To'lov turi")} value={payType} onChange={(e) => setPayType(e.target.value as PayType)}>
                {keys(PAY_TYPE_LABELS).map((p) => (
                  <MenuItem key={p} value={p}>
                    {PAY_TYPE_LABELS[p]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={tr('Stavka')}
                value={payRate}
                onChange={(e) => setPayRate(e.target.value)}
                inputMode="decimal"
                error={rateError}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{PAY_RATE_UNIT[payType]}</InputAdornment> } }}
              />
            </Box>
          )}
          <Typography variant="caption" color="text.secondary">
            {tr("Qolgan ma'lumotlarni (liniya, smena, me'yor) keyin Xodimlar sahifasida to'ldirishingiz mumkin.")}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onClose} disabled={busy}>
          {tr('Bekor qilish')}
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy || rateError}>
          {tr('Qabul qilish')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

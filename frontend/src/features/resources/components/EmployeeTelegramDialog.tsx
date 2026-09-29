import { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Skeleton, Typography } from '@mui/material';
import QRCode from 'qrcode';
import { api, getErrorMessage } from '@/shared/api/client';
import { useToast } from '@/shared/components/Toast';
import type { Employee } from '../types';
import { tr } from '@/i18n';

interface Status {
  enabled: boolean;
  linked: boolean;
  link_url: string | null;
}

export default function EmployeeTelegramDialog({ employee, onClose }: { employee: Employee | null; onClose: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<Status | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!employee) return;
    setStatus(null);
    setQr('');
    setError('');
    api
      .get<Status>(`/telegram/employees/${employee.id}`)
      .then((r) => {
        setStatus(r.data);
        if (r.data.link_url) QRCode.toDataURL(r.data.link_url, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(''));
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [employee]);

  const unlink = async () => {
    if (!employee) return;
    try {
      setStatus((await api.delete<Status>(`/telegram/employees/${employee.id}`)).data);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const copy = () => {
    if (!status?.link_url) return;
    navigator.clipboard.writeText(status.link_url).then(() => toast.success(tr('Havola nusxalandi'))).catch(() => undefined);
  };

  return (
    <Dialog open={!!employee} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {tr('Telegram: shaxsiy kabinet')}
        <Typography variant="body2" color="text.secondary">{employee?.full_name}</Typography>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!status ? (
          <Skeleton variant="rounded" height={260} />
        ) : !status.enabled ? (
          <Alert severity="info">{tr('Telegram bot hali sozlanmagan.')}</Alert>
        ) : (
          <>
            {status.linked && <Alert severity="success" sx={{ mb: 2 }}>{tr('Xodim botga ulangan — natijalarini /me orqali ko\'radi.')}</Alert>}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {tr("Xodim telefon kamerasi bilan QR kodni skanerlaydi yoki havolani ochib Start bosadi. Shundan so'ng botda bugungi va oylik natijasini hamda taxminiy ish haqini ko'radi, har kuni kechqurun hisobot oladi.")}
            </Typography>
            <Box sx={{ display: 'grid', placeItems: 'center', mb: 2 }}>
              {qr ? <img src={qr} alt="QR" width={220} height={220} style={{ background: '#fff', padding: 8, borderRadius: 12 }} /> : <Skeleton variant="rounded" width={220} height={220} />}
            </Box>
            <Typography variant="caption" sx={{ display: 'block', wordBreak: 'break-all', fontFamily: 'monospace', textAlign: 'center' }}>
              {status.link_url}
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {status?.linked && (
          <Button color="error" onClick={unlink}>
            {tr('Uzish')}
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {status?.link_url && <Button onClick={copy}>{tr('Nusxalash')}</Button>}
        <Button variant="contained" onClick={onClose}>
          {tr('Yopish')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

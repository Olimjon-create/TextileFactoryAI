import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import BlockIcon from '@mui/icons-material/Block';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import QRCode from 'qrcode';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { inventoryApi } from '@/features/inventory/api';
import type { WarehouseLocation } from '@/features/inventory/types';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { escapeHtml as esc } from '@/shared/utils/html';
import { logisticsApi } from '../api';
import ShipmentFormDialog from '../components/ShipmentFormDialog';
import ShipmentStatusChip from '../components/ShipmentStatusChip';
import { FG_MOVEMENT_LABELS, variantLabel } from '../constants';
import { useLogisticsPermissions } from '../permissions';
import type { FgMovement, ShipmentDetail } from '../types';
import { formatDate, formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

const when = (v: string | null) => (v ? formatDateTime(v.length === 10 ? `${v}T00:00:00` : v) : '—');

/** Yuk xati (delivery note): QR — jo'natma raqami, skanerda kuzatiladi */
async function printNote(sh: ShipmentDetail) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return;
  const qr = await QRCode.toDataURL(sh.number, { margin: 1, width: 200 });
  const rows = sh.lines
    .map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.product_code)}</td><td>${esc(l.product_name)}</td><td>${esc(variantLabel(l.size, l.color))}</td><td class="r">${l.quantity}</td></tr>`)
    .join('');
  const field = (label: string, value: string | null) => (value ? `<div><span>${label}</span><b>${esc(value)}</b></div>` : '');
  w.document.write(
    `<!doctype html><html><head><title>Yuk xati ${esc(sh.number)}</title><style>
      body{font-family:Arial,sans-serif;margin:14mm;color:#111;font-size:13px}
      h1{font-size:22px;margin:0}header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
      header img{width:30mm;height:30mm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:16px}
      .grid span{display:block;color:#666;font-size:11px}table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #999;padding:6px 8px;text-align:left}th{background:#f2f2f2}.r{text-align:right}
      tfoot td{font-weight:bold}.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
      .sign div{border-top:1px solid #333;padding-top:4px;color:#555;font-size:11px}
    </style></head><body>
      <header><div><h1>Yuk xati ${esc(sh.number)}</h1><div>Buyurtma ${esc(sh.order_number ?? '')} · ${formatDate(new Date())}</div></div><img src="${qr}"/></header>
      <div class="grid">
        ${field('Qabul qiluvchi', sh.customer_name)}${field('Telefon', sh.customer_phone)}
        ${field('Manzil', sh.delivery_address)}${field('Tashuvchi', sh.carrier)}
        ${field('Mashina', sh.vehicle_no)}${field('Haydovchi', [sh.driver_name, sh.driver_phone].filter(Boolean).join(', ') || null)}
        ${field('Trek raqami', sh.tracking_no)}
      </div>
      <table><thead><tr><th>#</th><th>Kod</th><th>Mahsulot</th><th>O'lcham / rang</th><th class="r">Dona</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td colspan="4">Jami</td><td class="r">${sh.total_quantity}</td></tr></tfoot></table>
      ${sh.notes ? `<p>${esc(sh.notes)}</p>` : ''}
      <div class="sign"><div>Topshirdi (F.I.Sh., imzo)</div><div>Qabul qildi (F.I.Sh., imzo)</div></div>
      <script>window.onload=()=>{window.print()}<\/script></body></html>`,
  );
  w.document.close();
}

export default function ShipmentDetailPage() {
  const { id } = useParams();
  const isMobile = useIsMobile();
  const toast = useToast();
  const { canEdit } = useLogisticsPermissions();
  const [sh, setSh] = useState<ShipmentDetail | null>(null);
  const [moves, setMoves] = useState<FgMovement[]>([]);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [dialog, setDialog] = useState<'ship' | 'deliver' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationId, setLocationId] = useState<number | ''>('');
  const [receivedBy, setReceivedBy] = useState('');
  const [dialogError, setDialogError] = useState('');
  const save = useSaveAction();

  const load = useCallback(async () => {
    try {
      const s = await logisticsApi.shipment(Number(id));
      setSh(s);
      setError('');
      if (s.status !== 'PREPARING') logisticsApi.movements({ shipment_id: s.id, limit: 100 }).then((r) => setMoves(r.items)).catch(() => undefined);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const openDialog = (kind: 'ship' | 'deliver') => {
    save.reset();
    setDialogError('');
    setLocationId('');
    setReceivedBy('');
    if (kind === 'ship') inventoryApi.locations().then(setLocations).catch(() => undefined);
    setDialog(kind);
  };

  const runDialog = async () => {
    if (!sh || !dialog) return;
    setDialogError('');
    try {
      const next = await save.run(() =>
        dialog === 'ship' ? logisticsApi.ship(sh.id, locationId === '' ? null : locationId) : logisticsApi.deliver(sh.id, { received_by: receivedBy.trim() || null }),
      );
      setSh(next);
      toast.success(dialog === 'ship' ? tr("Jo'natma yo'lga chiqdi — ombordan chiqim qilindi") : tr("Yetkazildi deb belgilandi"));
      setDialog(null);
      load();
    } catch (e) {
      setDialogError(getErrorMessage(e));
    }
  };

  const cancel = async () => {
    if (!sh) return;
    setBusy(true);
    try {
      setSh(await logisticsApi.cancel(sh.id));
      toast.success(tr("Jo'natma bekor qilindi"));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
      setConfirmCancel(false);
    }
  };

  if (!sh) {
    return error ? (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{error}</Typography>
        <Button component={RouterLink} to="/shipments" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          {tr("Jo'natmalar")}
        </Button>
      </Box>
    ) : (
      <>
        <Skeleton width={160} />
        <Skeleton variant="rounded" height={200} sx={{ my: 2 }} />
      </>
    );
  }

  const short = sh.status === 'PREPARING' && sh.lines.some((l) => l.quantity > l.in_stock);
  const info: [string, ReactNode][] = [
    [tr("Buyurtma"), <Link key="o" component={RouterLink} to={`/orders/${sh.order_id}`}>{sh.order_number}</Link>],
    [tr("Mijoz"), `${sh.customer_name} · ${sh.customer_phone}`],
    [tr("Manzil"), sh.delivery_address ?? '—'],
    [tr("Tashuvchi"), sh.carrier ?? '—'],
    [tr("Mashina"), sh.vehicle_no ?? '—'],
    [tr("Haydovchi"), [sh.driver_name, sh.driver_phone].filter(Boolean).join(' · ') || '—'],
    [tr("Trek raqami"), sh.tracking_no ?? '—'],
    [tr("Rejadagi sana"), sh.planned_date ? formatDate(sh.planned_date) : '—'],
    [tr("Yo'lga chiqdi"), when(sh.shipped_at)],
    [tr("Yetkazildi"), sh.delivered_at ? `${when(sh.delivered_at)}${sh.received_by ? ` · ${sh.received_by}` : ''}` : '—'],
  ];

  return (
    <>
      <Button component={RouterLink} to="/shipments" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Jo'natmalar")}
      </Button>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h5" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {sh.number}
                </Typography>
                <ShipmentStatusChip sh={sh} />
              </Box>
              <Typography color="text.secondary">
                {sh.total_quantity} {tr("dona ·")}{' '}{sh.items_count} {tr("qator")}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {canEdit && sh.status === 'PREPARING' && (
                <Button variant="contained" startIcon={<LocalShippingOutlinedIcon />} onClick={() => openDialog('ship')}>
                  {tr("Yo'lga chiqarish")}
                </Button>
              )}
              {canEdit && sh.status === 'SHIPPED' && (
                <Button variant="contained" color="success" startIcon={<TaskAltIcon />} onClick={() => openDialog('deliver')}>
                  {tr("Yetkazildi")}
                </Button>
              )}
              {sh.status !== 'CANCELLED' && (
                <Button color="inherit" startIcon={<PrintOutlinedIcon />} onClick={() => printNote(sh)}>
                  {tr("Yuk xati")}
                </Button>
              )}
              {canEdit && (sh.status === 'PREPARING' || sh.status === 'SHIPPED') && (
                <Button color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
                  {tr("Tahrirlash")}
                </Button>
              )}
              {canEdit && sh.status === 'PREPARING' && (
                <Button color="error" startIcon={<BlockIcon />} onClick={() => setConfirmCancel(true)}>
                  {tr("Bekor qilish")}
                </Button>
              )}
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
            {info.map(([label, value]) => (
              <Box key={label} sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography sx={{ fontWeight: 500, wordBreak: 'break-word' }}>{value}</Typography>
              </Box>
            ))}
          </Box>
          {sh.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              {sh.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      {short && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {tr("Ba'zi mahsulotlar tayyor mahsulot omborida yetarli emas. Avval ish buyurtmasidan omborga qabul qiling, keyin yo'lga chiqaring.")}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h6">{tr("Mahsulotlar")}</Typography>
        </CardContent>
        <TableContainer>
          <Table size="small" sx={{ minWidth: isMobile ? 520 : undefined }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Mahsulot")}</TableCell>
                <TableCell>{tr("O'lcham / rang")}</TableCell>
                <TableCell align="right">{tr("Dona")}</TableCell>
                {sh.status === 'PREPARING' && <TableCell align="right">{tr("Omborda")}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {sh.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    {l.product_name}
                    <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                      {l.product_code}
                    </Typography>
                  </TableCell>
                  <TableCell>{variantLabel(l.size, l.color) || '—'}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {l.quantity}
                  </TableCell>
                  {sh.status === 'PREPARING' && (
                    <TableCell align="right" sx={{ color: l.in_stock < l.quantity ? 'error.main' : 'success.main', fontWeight: 600 }}>
                      {l.in_stock}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {moves.length > 0 && (
        <Card>
          <CardContent sx={{ pb: 0 }}>
            <Typography variant="h6">{tr("Ombordan chiqim")}</Typography>
          </CardContent>
          <TableContainer>
            <Table size="small">
              <TableBody>
                {moves.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.created_at)}</TableCell>
                    <TableCell>{FG_MOVEMENT_LABELS[m.movement_type]}</TableCell>
                    <TableCell>
                      {m.product.code} {variantLabel(m.size, m.color)}
                    </TableCell>
                    <TableCell>{m.location.code}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: 'error.main' }}>
                      {m.quantity}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <ShipmentFormDialog
        open={editOpen}
        shipment={sh}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => {
          setEditOpen(false);
          setSh(next);
        }}
      />
      <Dialog open={!!dialog} onClose={save.busy ? undefined : () => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog === 'ship' ? tr("Yo'lga chiqarish") : tr("Yetkazildi")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            {dialog === 'ship' ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  {tr("Mahsulotlar tayyor mahsulot omboridan chiqim qilinadi. Joy tanlanmasa — qoldig'i ko'p joylardan avtomatik.")}
                </Typography>
                <TextField
                  select
                  label={tr("Ombor joyi")}
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value === '' ? '' : Number(e.target.value))}
                  slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                >
                  <MenuItem value="">{tr("Avtomatik")}</MenuItem>
                  {locations.map((l) => (
                    <MenuItem key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </MenuItem>
                  ))}
                </TextField>
              </>
            ) : (
              <TextField label={tr("Kim qabul qildi")} value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} placeholder="F.I.Sh." autoFocus />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialog(null)} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} type="button" onClick={runDialog} savedText={dialog === 'ship' ? tr("Yo'lga chiqdi") : tr("Belgilandi")}>
            {dialog === 'ship' ? tr("Yo'lga chiqarish") : tr("Tasdiqlash")}
          </SaveButton>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={confirmCancel}
        title={tr("Jo'natmani bekor qilish")}
        message={tr("Tayyorlanayotgan jo'natma bekor qilinadi. Ombor qoldig'i o'zgarmaydi.")}
        confirmText={tr("Bekor qilish")}
        loading={busy}
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  );
}

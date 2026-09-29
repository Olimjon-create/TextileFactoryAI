import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  LinearProgress,
  Link,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import BlockIcon from '@mui/icons-material/Block';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import MovementsTable from '@/features/inventory/components/MovementsTable';
import { formatQty } from '@/features/inventory/constants';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { procurementApi } from '../api';
import PurchaseOrderFormDialog from '../components/PurchaseOrderFormDialog';
import PurchaseStatusChip from '../components/PurchaseStatusChip';
import ReceiveDialog from '../components/ReceiveDialog';
import { formatDate } from '../constants';
import { useCanEditProcurement } from '../permissions';
import type { PurchaseOrderDetail } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

type Confirm = 'submit' | 'close' | 'cancel' | 'delete' | null;

const CONFIRM_TEXT: Record<Exclude<Confirm, null>, [string, string, string]> = {
  submit: [tr("Yetkazib beruvchiga yuborish"), tr("Buyurtma «Yuborildi» holatiga o'tadi. Shundan keyin qatorlarni o'zgartirib bo'lmaydi."), tr("Yuborish")],
  close: [tr("Buyurtmani yopish"), tr("Qolgan miqdor kelmaydi deb belgilanadi. Qabul qilingan tovar omborda qoladi."), tr("Yopish")],
  cancel: [tr("Buyurtmani bekor qilish"), tr("Buyurtma bekor qilinadi. Bu amalni qaytarib bo'lmaydi."), tr("Bekor qilish")],
  delete: [tr("Qoralamani o'chirish"), tr("Qoralama butunlay o'chiriladi."), tr("O'chirish")],
};

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const toast = useToast();
  const canEdit = useCanEditProcurement();
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPo(await procurementApi.get(Number(id)));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async () => {
    if (!po || !confirm) return;
    setBusy(true);
    try {
      if (confirm === 'delete') {
        await procurementApi.remove(po.id);
        toast.success(tr("{0} o'chirildi", po.number));
        navigate('/purchases');
        return;
      }
      const next = confirm === 'submit' ? await procurementApi.submit(po.id) : confirm === 'close' ? await procurementApi.close(po.id) : await procurementApi.cancel(po.id);
      setPo(next);
      toast.success(confirm === 'submit' ? tr("Yetkazib beruvchiga yuborildi") : confirm === 'close' ? tr("Buyurtma yopildi") : tr("Buyurtma bekor qilindi"));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (!po) {
    return error ? (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{error}</Typography>
        <Button component={RouterLink} to="/purchases" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          {tr("Xarid buyurtmalari")}
        </Button>
      </Box>
    ) : (
      <>
        <Skeleton width={160} />
        <Skeleton variant="rounded" height={180} sx={{ my: 2 }} />
        <Skeleton variant="rounded" height={300} />
      </>
    );
  }

  const isOpen = po.status === 'ORDERED' || po.status === 'PARTIAL';
  const info: [string, ReactNode][] = [
    [tr("Yetkazib beruvchi"), <Link key="s" component={RouterLink} to={`/suppliers/${po.supplier.id}`}>{po.supplier.name}</Link>],
    [tr("Buyurtma sanasi"), formatDate(po.order_date)],
    [tr("Kutilgan sana"), <Typography key="e" component="span" color={po.is_overdue ? 'error.main' : undefined} sx={{ fontWeight: po.is_overdue ? 700 : undefined }}>{formatDate(po.expected_date)}</Typography>],
    [tr("Mijoz buyurtmasi"), po.order_id ? <Link key="o" component={RouterLink} to={`/orders/${po.order_id}`}>{po.order_number}</Link> : tr("Ombor uchun")],
    [tr("Yuborilgan"), po.ordered_at ? formatDateTime(po.ordered_at) : '—'],
    [tr("Yaratgan"), po.created_by_name ?? '—'],
  ];

  return (
    <>
      <Button component={RouterLink} to="/purchases" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Xarid buyurtmalari")}
      </Button>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h5" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {po.number}
                </Typography>
                <PurchaseStatusChip po={po} />
              </Box>
              <Typography color="text.secondary">
                {formatMoney(po.total_amount, po.currency)} {tr("· qabul qilingan")}{' '}{formatMoney(po.received_amount, po.currency)}
              </Typography>
            </Box>
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {isOpen && (
                  <Button variant="contained" startIcon={<MoveToInboxOutlinedIcon />} onClick={() => setReceiveOpen(true)}>
                    {tr("Qabul qilish")}
                  </Button>
                )}
                {po.status === 'DRAFT' && (
                  <>
                    <Button variant="contained" startIcon={<SendOutlinedIcon />} onClick={() => setConfirm('submit')}>
                      {tr("Yuborish")}
                    </Button>
                    <Button color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
                      {tr("Tahrirlash")}
                    </Button>
                    <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setConfirm('delete')}>
                      {tr("O'chirish")}
                    </Button>
                  </>
                )}
                {po.status === 'PARTIAL' && (
                  <Button color="inherit" startIcon={<DoneAllIcon />} onClick={() => setConfirm('close')}>
                    {tr("Yopish")}
                  </Button>
                )}
                {po.status === 'ORDERED' && (
                  <Button color="error" startIcon={<BlockIcon />} onClick={() => setConfirm('cancel')}>
                    {tr("Bekor qilish")}
                  </Button>
                )}
              </Box>
            )}
          </Box>
          {po.status !== 'DRAFT' && po.status !== 'CANCELLED' && (
            <Box sx={{ mb: 2 }}>
              <LinearProgress variant="determinate" value={po.received_pct} color={po.received_pct >= 100 ? 'success' : 'primary'} sx={{ height: 8, borderRadius: 4 }} />
              <Typography variant="caption" color="text.secondary">
                {tr("Miqdor bo'yicha")}{' '}{po.received_pct}{tr("% qabul qilindi")}
              </Typography>
            </Box>
          )}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
            {info.map(([label, value]) => (
              <Box key={label}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography sx={{ fontWeight: 500 }}>{value}</Typography>
              </Box>
            ))}
          </Box>
          {po.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              {po.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h6">{tr("Materiallar")}</Typography>
        </CardContent>
        <TableContainer>
          <Table size="small" sx={{ minWidth: isMobile ? 680 : undefined }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Material")}</TableCell>
                <TableCell align="right">{tr("Buyurtma")}</TableCell>
                <TableCell align="right">{tr("Narx")}</TableCell>
                <TableCell align="right">{tr("Summa")}</TableCell>
                <TableCell align="right">{tr("Qabul qilindi")}</TableCell>
                <TableCell align="right">{tr("Qoldi")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {po.lines.map((l) => {
                const unit = MATERIAL_UNIT_LABELS[l.unit];
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link component={RouterLink} to={`/inventory/materials/${l.material.id}`}>
                        {l.material.code} — {l.material.name}
                      </Link>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatQty(l.quantity)} {unit}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(l.unit_price, po.currency)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {formatMoney(l.amount, po.currency)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: l.received > 0 ? 'success.main' : undefined }}>
                      {formatQty(l.received)} {unit}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: l.remaining > 0 ? 700 : undefined }}>
                      {l.remaining > 0 ? `${formatQty(l.remaining)} ${unit}` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} sx={{ fontWeight: 700 }}>
                  {tr("Jami")}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {formatMoney(po.total_amount, po.currency)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Card>

      <Card>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h6">{tr("Qabul qilishlar")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {tr("Ombor jurnalidagi kirim yozuvlari")}
          </Typography>
        </CardContent>
        <MovementsTable movements={po.receipts} loading={false} emptyText={tr("Hali tovar qabul qilinmagan")} />
      </Card>

      <PurchaseOrderFormDialog
        open={editOpen}
        po={po}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => {
          setEditOpen(false);
          setPo(next);
        }}
      />
      <ReceiveDialog
        open={receiveOpen}
        po={po}
        onClose={() => setReceiveOpen(false)}
        onSaved={(next) => {
          setReceiveOpen(false);
          setPo(next);
        }}
      />
      {confirm && (
        <ConfirmDialog
          open
          title={CONFIRM_TEXT[confirm][0]}
          message={CONFIRM_TEXT[confirm][1]}
          confirmText={CONFIRM_TEXT[confirm][2]}
          loading={busy}
          onConfirm={act}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}

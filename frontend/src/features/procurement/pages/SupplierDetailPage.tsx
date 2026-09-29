import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { MobileListEmpty, MobileListItem } from '@/shared/components/MobileList';
import StatCard from '@/shared/components/StatCard';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { procurementApi } from '../api';
import PurchaseOrderFormDialog from '../components/PurchaseOrderFormDialog';
import PurchaseStatusChip from '../components/PurchaseStatusChip';
import SupplierFormDialog from '../components/SupplierFormDialog';
import { formatDate } from '../constants';
import { useCanEditProcurement } from '../permissions';
import type { PurchaseOrder, SupplierDetail } from '../types';
import { tr } from '@/i18n';

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const toast = useToast();
  const canEdit = useCanEditProcurement();
  const [supplier, setSupplier] = useState<SupplierDetail | null>(null);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, pos] = await Promise.all([procurementApi.supplier(Number(id)), procurementApi.list({ supplier_id: Number(id), limit: 50 })]);
      setSupplier(s);
      setOrders(pos.items);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!supplier) return;
    setBusy(true);
    try {
      await procurementApi.removeSupplier(supplier.id);
      toast.success(tr("{0} o'chirildi", supplier.name));
      navigate('/suppliers');
    } catch (e) {
      setError(getErrorMessage(e));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  if (!supplier) {
    return error ? (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{error}</Typography>
        <Button component={RouterLink} to="/suppliers" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          {tr("Yetkazib beruvchilar")}
        </Button>
      </Box>
    ) : (
      <>
        <Skeleton width={160} />
        <Skeleton variant="rounded" height={200} sx={{ my: 2 }} />
      </>
    );
  }

  const st = supplier.stats;
  const contacts: [string, string | null][] = [
    [tr("Mas'ul shaxs"), supplier.contact_person],
    [tr("Telefon"), supplier.phone],
    [tr("Email"), supplier.email],
    ['STIR', supplier.tax_id],
    [tr("Manzil"), [supplier.country, supplier.address].filter(Boolean).join(', ') || null],
    [tr("Yetkazish muddati"), supplier.lead_time_days != null ? tr("{0} kun", supplier.lead_time_days) : null],
    [tr("To'lov muddati"), supplier.payment_terms_days != null ? tr("{0} kun", supplier.payment_terms_days) : null],
  ];

  return (
    <>
      <Button component={RouterLink} to="/suppliers" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Yetkazib beruvchilar")}
      </Button>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {supplier.code}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {supplier.name}
                </Typography>
                {!supplier.is_active && <Chip size="small" label={tr("Nofaol")} />}
              </Box>
            </Box>
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {supplier.is_active && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={() => setPoOpen(true)}>
                    {tr("Xarid buyurtmasi")}
                  </Button>
                )}
                <Button color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
                  {tr("Tahrirlash")}
                </Button>
                {st.orders_total === 0 && (
                  <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setConfirmDelete(true)}>
                    {tr("O'chirish")}
                  </Button>
                )}
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            {contacts.map(([label, value]) => (
              <Box key={label}>
                <Typography variant="caption" color="text.secondary">
                  {label}
                </Typography>
                <Typography sx={{ fontWeight: 500, wordBreak: 'break-word' }}>{value || '—'}</Typography>
              </Box>
            ))}
          </Box>
          {supplier.notes && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, whiteSpace: 'pre-wrap' }}>
              {supplier.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2 }}>
        <StatCard label={tr("Qabul qilingan tovar")} value={formatMoney(st.received_value)} icon={<PaymentsOutlinedIcon />} color="success.main" hint={tr("{0} ta buyurtma", st.orders_total)} />
        <StatCard label={tr("Kutilmoqda")} value={st.open_orders} icon={<LocalShippingOutlinedIcon />} hint={st.open_value ? formatMoney(st.open_value) : undefined} />
        <StatCard
          label={tr("Muddatida yetkazish")}
          value={st.on_time_pct != null ? `${st.on_time_pct}%` : '—'}
          icon={<VerifiedOutlinedIcon />}
          color={st.on_time_pct == null ? 'grey.500' : st.on_time_pct >= 90 ? 'success.main' : st.on_time_pct >= 70 ? 'warning.main' : 'error.main'}
          hint={st.overdue_orders ? tr("{0} ta kechikmoqda", st.overdue_orders) : undefined}
        />
        <StatCard label={tr("O'rtacha yetkazish")} value={st.avg_lead_days != null ? tr("{0} kun", st.avg_lead_days) : '—'} icon={<TimerOutlinedIcon />} color="info.main" hint={tr("Yuborilgandan to'liq qabulgacha")} />
      </Box>

      <Card>
        <CardContent sx={{ pb: 0 }}>
          <Typography variant="h6">{tr("Xarid buyurtmalari")}</Typography>
        </CardContent>
        {isMobile ? (
          <Box>
            {orders.map((po) => (
              <MobileListItem
                key={po.id}
                onClick={() => navigate(`/purchases/${po.id}`)}
                overline={po.number}
                title={formatMoney(po.total_amount, po.currency)}
                subtitle={tr("{0} qator · kutiladi {1}", po.items_count, formatDate(po.expected_date))}
                trailing={<PurchaseStatusChip po={po} />}
              />
            ))}
            {orders.length === 0 && <MobileListEmpty>{tr("Xarid buyurtmalari yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Raqam")}</TableCell>
                  <TableCell>{tr("Sana")}</TableCell>
                  <TableCell>{tr("Kutilgan")}</TableCell>
                  <TableCell align="right">{tr("Summa")}</TableCell>
                  <TableCell align="right">{tr("Qabul")}</TableCell>
                  <TableCell>{tr("Holati")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((po) => (
                  <TableRow key={po.id} hover onClick={() => navigate(`/purchases/${po.id}`)} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{po.number}</TableCell>
                    <TableCell>{formatDate(po.order_date)}</TableCell>
                    <TableCell>{formatDate(po.expected_date)}</TableCell>
                    <TableCell align="right">{formatMoney(po.total_amount, po.currency)}</TableCell>
                    <TableCell align="right">{po.received_pct}%</TableCell>
                    <TableCell>
                      <PurchaseStatusChip po={po} />
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      {tr("Xarid buyurtmalari yo'q")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <SupplierFormDialog
        open={editOpen}
        supplier={supplier}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          load();
        }}
      />
      <PurchaseOrderFormDialog
        open={poOpen}
        supplierId={supplier.id}
        onClose={() => setPoOpen(false)}
        onSaved={(po) => {
          setPoOpen(false);
          navigate(`/purchases/${po.id}`);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={tr("Yetkazib beruvchini o'chirish")}
        message={tr("«{0}» o'chiriladi.", supplier.name)}
        loading={busy}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

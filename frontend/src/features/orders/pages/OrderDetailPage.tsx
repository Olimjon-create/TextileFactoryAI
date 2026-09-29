import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Menu,
  MenuItem,
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
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { CUSTOMER_VIEW_ROLES } from '@/features/customers/permissions';
import { useAuth } from '@/features/auth/AuthContext';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { useToast } from '@/shared/components/Toast';
import { MobileListItem } from '@/shared/components/MobileList';
import { CardSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { ordersApi } from '../api';
import DueDate from '../components/DueDate';
import OrderEditDialog from '../components/OrderEditDialog';
import OrderMaterialsCard from '../components/OrderMaterialsCard';
import OrderProductionCard from '@/features/production/components/OrderProductionCard';
import OrderShippingCard from '@/features/logistics/components/OrderShippingCard';
import OrderCostingCard from '@/features/analytics/components/OrderCostingCard';
import OrderStatusChip from '../components/OrderStatusChip';
import { isFinalStatus, NEXT_STATUS, ORDER_STATUS_LABELS, ORDER_STATUSES } from '../constants';
import { useNewOrders } from '../NewOrdersContext';
import { useCanManageOrders } from '../permissions';
import type { Order, OrderStatus } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

export default function OrderDetailPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const canManage = useCanManageOrders();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canSeeCustomers = hasRole(...CUSTOMER_VIEW_ROLES);
  const { refresh: refreshBadge } = useNewOrders();

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrder(await ordersApi.get(orderId));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const changeStatus = async (status: OrderStatus) => {
    if (!order) return;
    setMenuAnchor(null);
    setCancelOpen(false);
    setSaving(true);
    setError('');
    const started = Date.now();
    try {
      const updated = await ordersApi.updateStatus(order.id, status);
      // Juda tez javobda ham aylanish ko'rinib ulgursin
      await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - started))));
      setOrder(updated);
      toast.success(tr("Holat yangilandi: {0}", ORDER_STATUS_LABELS[updated.status]));
      refreshBadge();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const recordPayment = async () => {
    if (!order) return;
    setPaying(true);
    setError('');
    try {
      setOrder(await ordersApi.recordPayment(order.id));
      toast.success(tr("To'lov qabul qilingani qayd etildi"));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  if (!order) {
    return error ? (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{error}</Typography>
        <Button component={RouterLink} to="/orders" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          {tr("Buyurtmalar")}
        </Button>
      </Box>
    ) : (
      <Box aria-busy="true">
        <Skeleton width={120} sx={{ mb: 1 }} />
        <Skeleton width={220} height={40} />
        <Skeleton width={320} sx={{ mb: 3 }} />
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, alignItems: 'start' }}>
          <CardSkeleton lines={5} />
          <Box sx={{ display: 'grid', gap: 2 }}>
            <CardSkeleton lines={3} />
            <CardSkeleton lines={4} />
          </Box>
        </Box>
      </Box>
    );
  }

  const next = NEXT_STATUS[order.status];
  const final = isFinalStatus(order.status);

  return (
    <>
      <Button component={RouterLink} to="/orders" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Buyurtmalar")}
      </Button>

      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h5" sx={{ fontFamily: 'monospace' }}>
              {order.order_number}
            </Typography>
            <OrderStatusChip status={order.status} />
            {order.source === 'MANUAL' && <Chip size="small" variant="outlined" label={tr("B2B · qo'lda kiritilgan")} />}
            {order.due_date && <DueDate order={order} />}
          </Box>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {formatDateTime(order.paid_at ?? order.created_at)} · {formatMoney(order.total_amount, order.currency)}
            {order.factory && ` · ${order.factory.name}`}
          </Typography>
        </Box>
        {canManage && (
          <Button color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
            {tr("Tahrirlash")}
          </Button>
        )}
        {canManage && !final && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {next && (
              <Button
                variant="contained"
                endIcon={saving ? <CircularProgress size={18} color="inherit" /> : <ArrowForwardIcon />}
                disabled={saving}
                onClick={() => changeStatus(next.status)}
              >
                {saving ? tr("Saqlanmoqda...") : next.action}
              </Button>
            )}
            <Button variant="outlined" endIcon={<ArrowDropDownIcon />} disabled={saving} onClick={(e) => setMenuAnchor(e.currentTarget)}>
              {tr("Status")}
            </Button>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
              {/* Holat faqat oldinga yuradi (backend order_service.MANUAL_FLOW) */}
              {ORDER_STATUSES.filter((s) => s !== 'CANCELLED' && ORDER_STATUSES.indexOf(s) > ORDER_STATUSES.indexOf(order.status)).map((s) => (
                <MenuItem key={s} onClick={() => changeStatus(s)}>
                  {ORDER_STATUS_LABELS[s]}
                </MenuItem>
              ))}
              <MenuItem onClick={() => { setMenuAnchor(null); setCancelOpen(true); }} sx={{ color: 'error.main' }}>
                {tr("Bekor qilish")}
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent sx={{ pb: 0 }}>
            <Typography variant="h6">{tr("Mahsulotlar")}</Typography>
          </CardContent>
          {isMobile ? (
            <Box>
              <Divider />
              {order.items.map((i) => (
                <MobileListItem
                  key={i.id}
                  overline={i.product_code}
                  title={i.product_name}
                  subtitle={`${formatMoney(i.unit_price)} × ${i.quantity}`}
                  meta={
                    (i.size || i.color) && (
                      <>
                        {i.size && <Chip size="small" label={tr("O'lcham: {0}", i.size)} />}
                        {i.color && <Chip size="small" label={tr("Rang: {0}", i.color)} />}
                      </>
                    )
                  }
                  trailing={<Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatMoney(i.line_total)}</Typography>}
                  onClick={i.product_id ? () => navigate(`/products/${i.product_id}`) : undefined}
                />
              ))}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 1.5 }}>
                <Typography sx={{ fontWeight: 700 }}>{tr("Jami ·")}{' '}{order.total_quantity} {tr("ta")}</Typography>
                <Typography sx={{ fontWeight: 700 }}>{formatMoney(order.total_amount, order.currency)}</Typography>
              </Box>
            </Box>
          ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Mahsulot")}</TableCell>
                  <TableCell align="right">{tr("Narx")}</TableCell>
                  <TableCell align="right">{tr("Miqdor")}</TableCell>
                  <TableCell align="right">{tr("Summa")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      {i.product_id ? (
                        <Link component={RouterLink} to={`/products/${i.product_id}`} sx={{ fontWeight: 600 }}>
                          {i.product_name}
                        </Link>
                      ) : (
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{i.product_name}</Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ fontFamily: 'monospace' }}>
                        {i.product_code}
                      </Typography>
                      {(i.size || i.color) && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                          {i.size && <Chip size="small" label={tr("O'lcham: {0}", i.size)} />}
                          {i.color && <Chip size="small" label={tr("Rang: {0}", i.color)} />}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatMoney(i.unit_price)}</TableCell>
                    <TableCell align="right">{i.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(i.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} sx={{ fontWeight: 700, fontSize: 15, color: 'text.primary' }}>
                    {tr("Jami")}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 15, color: 'text.primary' }}>
                    {order.total_quantity}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: 15, color: 'text.primary', whiteSpace: 'nowrap' }}>
                    {formatMoney(order.total_amount, order.currency)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
          )}
          {order.comment && (
            <CardContent>
              <Typography variant="subtitle2">{tr("Izoh")}</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
                {order.comment}
              </Typography>
            </CardContent>
          )}
        </Card>

        <Box sx={{ display: 'grid', gap: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {tr("Mijoz")}
              </Typography>
              <Info label={tr("Ism")}>
                {order.customer && canSeeCustomers ? (
                  <Link component={RouterLink} to={`/customers/${order.customer.id}`}>
                    {order.customer_name}
                  </Link>
                ) : (
                  order.customer_name
                )}
              </Info>
              <Info label={tr("Telefon")}>
                <Link href={`tel:${order.customer_phone.replace(/[^\d+]/g, '')}`}>{order.customer_phone}</Link>
              </Info>
              <Info label={tr("Yetkazib berish")}>{order.delivery_address || '—'}</Info>
              {order.customer && <Info label={tr("CRM kodi")}>{order.customer.customer_code}</Info>}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {tr("To'lov")}
              </Typography>
              <Info label={tr("Holati")}>
                <Chip size="small" color={order.payment_status === 'PAID' ? 'success' : 'warning'} label={order.payment_status === 'PAID' ? tr("To'langan") : tr("Kutilmoqda")} />
              </Info>
              {order.source === 'MANUAL' ? (
                <Info label={tr("Usul")}>{tr("O'tkazma / naqd")}</Info>
              ) : (
                <>
                  <Info label={tr("Usul")}>{tr("Karta")}{order.card_last4 ? ` •••• ${order.card_last4}` : ''}</Info>
                  <Info label={tr("Provayder")}>{order.payment_provider === 'demo' ? tr("Test rejimi") : order.payment_provider}</Info>
                </>
              )}
              {order.payment_reference && <Info label={tr("Tranzaksiya")}>{order.payment_reference}</Info>}
              {order.paid_at && <Info label={tr("Vaqti")}>{formatDateTime(order.paid_at)}</Info>}
              {order.source === 'MANUAL' && order.payment_status !== 'PAID' && canManage && order.status !== 'CANCELLED' && (
                <Button
                  fullWidth
                  variant="outlined"
                  color="success"
                  sx={{ mt: 1.5 }}
                  disabled={paying}
                  startIcon={paying ? <CircularProgress size={18} color="inherit" /> : undefined}
                  onClick={recordPayment}
                >
                  {paying ? tr("Saqlanmoqda...") : tr("To'lov qabul qilindi")}
                </Button>
              )}
            </CardContent>
          </Card>
        </Box>
      </Box>

      <OrderProductionCard order={order} onChanged={load} />
      <OrderMaterialsCard order={order} />
      <OrderShippingCard order={order} onChanged={load} />
      <OrderCostingCard order={order} />

      <OrderEditDialog
        open={editOpen}
        order={order}
        onClose={() => setEditOpen(false)}
        onSaved={(o) => {
          setEditOpen(false);
          setOrder(o);
        }}
      />
      <ConfirmDialog
        open={cancelOpen}
        title={tr("Buyurtmani bekor qilish")}
        message={tr("{0} bekor qilinadi. Ochiq ish buyurtmalari va tayyorlanayotgan jo'natmalar ham bekor qilinadi. Bu amalni qaytarib bo'lmaydi. To'lovni mijozga qaytarish va chiqarilgan materialni omborga qaytarish alohida amalga oshiriladi.", order.order_number)}
        confirmText={tr("Bekor qilish")}
        loading={saving}
        onConfirm={() => changeStatus('CANCELLED')}
        onClose={() => setCancelOpen(false)}
      />
    </>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Box>
  );
}

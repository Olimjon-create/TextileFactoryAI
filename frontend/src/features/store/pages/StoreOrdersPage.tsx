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
  Divider,
  LinearProgress,
  Link,
  Skeleton,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import { formatMoney } from '@/shared/utils/money';
import { isValidPhone } from '@/shared/utils/validators';
import { storeApi } from '../api';
import { variantLabel } from '../CartContext';
import StoreError from '../components/StoreError';
import { useMyOrders } from '../MyOrdersContext';
import { printReceipt } from '../receipt';
import type { PublicOrder } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

const STEPS: { status: PublicOrder['status']; label: string }[] = [
  { status: 'NEW', label: tr("Qabul qilindi") },
  { status: 'CONFIRMED', label: tr("Tasdiqlandi") },
  { status: 'IN_PRODUCTION', label: tr("Tikilmoqda") },
  { status: 'READY', label: tr("Tayyor") },
  { status: 'SHIPPED', label: tr("Yo'lda") },
  { status: 'COMPLETED', label: tr("Yetkazildi") },
];

const REFRESH_MS = 60_000;

function OrderCard({ order }: { order: PublicOrder }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  const cancelled = order.status === 'CANCELLED';
  const stepIndex = STEPS.findIndex((s) => s.status === order.status);
  const done = order.status === 'COMPLETED';

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
              {order.order_number}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatDateTime(order.paid_at ?? order.created_at)} ·{' '}
              <Link component={RouterLink} to={`/store/factories/${order.factory_id}`}>
                {order.factory_name}
              </Link>
            </Typography>
          </Box>
          <Chip
            label={cancelled ? tr("Bekor qilindi") : STEPS[stepIndex]?.label ?? order.status}
            color={cancelled ? 'default' : done ? 'success' : 'primary'}
            variant={done || cancelled ? 'filled' : 'outlined'}
          />
        </Box>

        {cancelled ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {tr("Buyurtma zavod tomonidan bekor qilingan. To'lovni qaytarish bo'yicha zavod siz bilan bog'lanadi.")}
          </Alert>
        ) : compact ? (
          <Box sx={{ mb: 2 }}>
            <LinearProgress variant="determinate" value={((stepIndex + 1) / STEPS.length) * 100} sx={{ height: 8, borderRadius: 4 }} />
            <Typography variant="caption" color="text.secondary">
              {stepIndex + 1}{tr("-bosqich /")}{' '}{STEPS.length}
            </Typography>
          </Box>
        ) : (
          <Stepper activeStep={done ? STEPS.length : stepIndex} alternativeLabel sx={{ mb: 2.5 }}>
            {STEPS.map((s) => (
              <Step key={s.status}>
                <StepLabel>{s.label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        )}

        <Divider sx={{ mb: 1 }} />
        {order.items.map((i) => (
          <Box key={`${i.product_code}|${i.size}|${i.color}`} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
            <Typography variant="body2">
              {i.product_name}
              {variantLabel(i) && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {' '}
                  ({variantLabel(i)})
                </Typography>
              )}{' '}
              × {i.quantity}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              {formatMoney(i.line_total)}
            </Typography>
          </Box>
        ))}
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {tr("To'langan")}{order.card_last4 ? tr(" · karta •••• {0}", order.card_last4) : ''}
            {order.delivery_address ? ` · ${order.delivery_address}` : ''}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Button size="small" variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => printReceipt(order)}>
              {tr('Chek')}
            </Button>
            <Typography variant="h6">{formatMoney(order.total_amount, order.currency)}</Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

function OrderCardSkeleton() {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Skeleton width={120} height={32} />
            <Skeleton width={200} />
          </Box>
          <Skeleton variant="rounded" width={100} height={32} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2.5 }}>
          {STEPS.map((s) => (
            <Box key={s.status} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flex: 1 }}>
              <Skeleton variant="circular" width={24} height={24} />
              <Skeleton width="60%" />
            </Box>
          ))}
        </Box>
        <Skeleton width="70%" />
        <Skeleton width="55%" />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
          <Skeleton width="40%" />
          <Skeleton width={120} height={32} />
        </Box>
      </CardContent>
    </Card>
  );
}

function FindOrderDialog({ open, onClose, onFound }: { open: boolean; onClose: () => void; onFound: (o: PublicOrder) => void }) {
  const [number, setNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!number.trim() || !isValidPhone(phone)) {
      setError(tr("Buyurtma raqami va telefonni to'g'ri kiriting"));
      return;
    }
    setBusy(true);
    try {
      onFound(await storeApi.findOrder(number.trim(), phone.trim()));
      setNumber('');
      setPhone('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{tr("Buyurtmani topish")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {tr("Boshqa telefon yoki kompyuterdan bergan buyurtmangizni qo'shish uchun buyurtma raqami va buyurtmada ko'rsatgan telefon raqamingizni kiriting.")}
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <TextField label={tr("Buyurtma raqami")} placeholder="B-000001" value={number} onChange={(e) => setNumber(e.target.value)} sx={{ mb: 2 }} autoFocus />
          <TextField label={tr("Telefon")} placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={onClose}>
            {tr("Bekor qilish")}
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {tr("Topish")}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default function StoreOrdersPage() {
  const { tokens, add } = useMyOrders();
  const [orders, setOrders] = useState<PublicOrder[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (tokens.length === 0) {
      setOrders([]);
      return;
    }
    try {
      const data = await storeApi.myOrders(tokens);
      setOrders(data);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [tokens]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setNotice('');
    const started = Date.now();
    await load();
    await new Promise((r) => setTimeout(r, Math.max(0, 400 - (Date.now() - started))));
    setRefreshing(false);
    setNotice(tr("Yangilandi"));
  }, [load]);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === 'visible' && load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (notice !== 'Yangilandi') return;
    const t = setTimeout(() => setNotice(''), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h4" sx={{ fontSize: { xs: 26, md: 32 } }}>
            {tr("Buyurtmalarim")}
          </Typography>
          <Typography color="text.secondary">{tr("To'langan buyurtmalaringiz va ularning holati")}</Typography>
        </Box>
        <Button startIcon={<SearchIcon />} onClick={() => setFindOpen(true)}>
          {tr("Buyurtmani topish")}
        </Button>
        <Button
          startIcon={
            <RefreshIcon
              sx={{
                animation: refreshing ? 'tfai-spin 0.8s linear infinite' : 'none',
                '@keyframes tfai-spin': { to: { transform: 'rotate(360deg)' } },
              }}
            />
          }
          onClick={refresh}
          disabled={refreshing}
          color="inherit"
        >
          {refreshing ? tr("Yangilanmoqda...") : tr("Yangilash")}
        </Button>
      </Box>
      {refreshing && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {notice && (
        <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>
          {notice}
        </Alert>
      )}

      {orders !== null && !error && orders.length < tokens.length && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {tokens.length - orders.length} {tr("ta buyurtma hozircha serverdan olinmadi. Birozdan so'ng «Yangilash»ni bosing yoki «Buyurtmani topish» orqali raqam va telefon bilan qidiring.")}
        </Alert>
      )}

      {error ? (
        <StoreError error={error} onRetry={refresh} />
      ) : orders === null ? (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <OrderCardSkeleton key={i} />
          ))}
        </Box>
      ) : orders.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <ReceiptLongOutlinedIcon sx={{ fontSize: 64, opacity: 0.4 }} />
          <Typography sx={{ mt: 1 }}>{tr("Hozircha to'langan buyurtmalar yo'q")}</Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {tr("To'lov qilganingizdan so'ng buyurtmalaringiz shu yerda saqlanadi.")}
          </Typography>
          <Button component={RouterLink} to="/store" variant="contained">
            {tr("Zavodlar katalogi")}
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 2 }}>
          {orders.map((o) => (
            <OrderCard key={o.public_token} order={o} />
          ))}
        </Box>
      )}

      <FindOrderDialog
        open={findOpen}
        onClose={() => setFindOpen(false)}
        onFound={(o) => {
          setFindOpen(false);
          add(o.public_token);
          setNotice(tr("{0} buyurtmangiz ro'yxatga qo'shildi", o.order_number));
        }}
      />
    </>
  );
}

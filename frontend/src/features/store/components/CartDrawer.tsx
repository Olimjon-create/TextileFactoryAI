import { useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import { PRODUCTION_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import { formatMoney } from '@/shared/utils/money';
import { isValidPhone, orNull } from '@/shared/utils/validators';
import { storeApi } from '../api';
import { useNavigate } from 'react-router-dom';
import { useCart, variantLabel } from '../CartContext';
import { useMyOrders } from '../MyOrdersContext';
import type { CheckoutResponse, PublicOrder } from '../types';
import PaymentForm from './PaymentForm';
import QuantityStepper from './QuantityStepper';
import StoreImage from './StoreImage';
import { tr } from '@/i18n';
import { inTelegram, telegramInitData } from '@/shared/telegram';

type Step = 'cart' | 'checkout' | 'payment' | 'done';

const TITLES: Record<Step, string> = {
  cart: tr("Savat"),
  checkout: tr("Buyurtma ma'lumotlari"),
  payment: tr("Karta orqali to'lov"),
  done: tr("Buyurtma qabul qilindi"),
};

const CONTACT_KEY = 'tfai_contact';

function loadContact() {
  try {
    return { name: '', phone: '', address: '', ...JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}') };
  } catch {
    return { name: '', phone: '', address: '' };
  }
}

export default function CartDrawer() {
  const cart = useCart();
  const myOrders = useMyOrders();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('cart');
  const [contact, setContact] = useState(loadContact);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [paidOrder, setPaidOrder] = useState<PublicOrder | null>(null);

  const nameError = contact.name.trim().length < 2 ? tr("Ismingizni kiriting") : '';
  const phoneError = !contact.phone.trim()
    ? tr("Telefon raqamingizni kiriting")
    : !isValidPhone(contact.phone)
      ? tr("Telefon raqami noto'g'ri (masalan: +998 90 123 45 67)")
      : '';

  const close = () => {
    if (busy) return;
    cart.close();
    // Yakunlangan buyurtmadan keyin keyingi safar savatdan boshlaymiz
    if (step === 'done') {
      setStep('cart');
      setPaidOrder(null);
    }
  };

  const submitCheckout = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError('');
    if (nameError || phoneError || !cart.factoryId) return;
    setBusy(true);
    try {
      try {
        localStorage.setItem(CONTACT_KEY, JSON.stringify(contact));
      } catch {
        // xotira yopiq — keyingi safar qayta kiritiladi
      }
      const res = await storeApi.checkout({
        factory_id: cart.factoryId,
        items: cart.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, size: l.size, color: l.color })),
        customer_name: contact.name.trim(),
        customer_phone: contact.phone.trim(),
        delivery_address: orNull(contact.address),
        comment: orNull(comment),
        telegram_init_data: telegramInitData(),
      });
      // Haqiqiy provayder (Payme/Click) bo'lsa — uning to'lov sahifasiga o'tamiz
      if (res.payment.checkout_url) {
        window.location.href = res.payment.checkout_url;
        return;
      }
      setCheckout(res);
      setStep('payment');
    } catch (err) {
      setError(getErrorMessage(err, tr("Buyurtmani yaratib bo'lmadi")));
    } finally {
      setBusy(false);
    }
  };

  const pay = async (cardLast4: string) => {
    if (!checkout) return;
    setBusy(true);
    setError('');
    try {
      const order = await storeApi.payDemo(checkout.order.public_token, cardLast4);
      myOrders.add(order.public_token); // "Buyurtmalarim" bo'limida saqlanadi
      setPaidOrder(order);
      setCheckout(null);
      setComment('');
      setSubmitted(false);
      cart.clear();
      setStep('done');
    } catch (err) {
      setError(getErrorMessage(err, tr("To'lov amalga oshmadi")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer anchor="right" open={cart.isOpen} onClose={close} PaperProps={{ sx: { width: { xs: '100%', sm: 440 } } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ flex: 1 }}>
          {TITLES[step]}
        </Typography>
        <IconButton onClick={close} aria-label={tr("Yopish")} disabled={busy}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>
        {/* ---------- 1. Savat ---------- */}
        {step === 'cart' &&
          (cart.lines.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
              <ShoppingCartOutlinedIcon sx={{ fontSize: 64, opacity: 0.4 }} />
              <Typography sx={{ mt: 1 }}>{tr("Savat bo'sh")}</Typography>
              <Typography variant="body2">{tr("Zavod sahifasidan mahsulot tanlang")}</Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {tr("Zavod:")}{' '}<b>{cart.factoryName}</b>
              </Typography>
              {cart.lines.map((line) => (
                <Box key={line.key} sx={{ display: 'flex', gap: 1.5 }}>
                  <StoreImage src={line.imageUrl} seed={line.name} alt={line.name} iconSize={24} sx={{ width: 64, height: 64, borderRadius: 2, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{line.name}</Typography>
                      <IconButton size="small" aria-label={tr("O'chirish")} onClick={() => cart.removeLine(line.key)} sx={{ mt: -0.5 }}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                    {(line.size || line.color) && (
                      <Box sx={{ display: 'flex', gap: 0.5, mb: 0.25 }}>
                        {line.size && <Chip size="small" label={tr("O'lcham: {0}", line.size)} sx={{ height: 20, fontSize: 11 }} />}
                        {line.color && <Chip size="small" label={tr("Rang: {0}", line.color)} sx={{ height: 20, fontSize: 11 }} />}
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {formatMoney(line.price)} / {PRODUCTION_UNIT_LABELS[line.unit].toLowerCase()}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1, gap: 1 }}>
                      <QuantityStepper
                        size="small"
                        showAddButton={false}
                        value={line.quantity}
                        onChange={(q) => cart.setLineQuantity(line.key, q)}
                      />
                      <Typography sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(line.price * line.quantity)}</Typography>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Stack>
          ))}

        {/* ---------- 2. Kontakt ma'lumotlari ---------- */}
        {step === 'checkout' && (
          <Box component="form" id="checkout-form" onSubmit={submitCheckout} noValidate>
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {tr("Ro'yxatdan o'tish shart emas. Zavod siz bilan shu telefon orqali bog'lanadi.")}
              </Typography>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label={tr("Ismingiz yoki kompaniya nomi")}
                required
                autoFocus
                autoComplete="name"
                value={contact.name}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
                error={submitted && !!nameError}
                helperText={submitted && nameError ? nameError : undefined}
              />
              <TextField
                label={tr("Telefon")}
                required
                autoComplete="tel"
                placeholder="+998 90 123 45 67"
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                error={submitted && !!phoneError}
                helperText={submitted && phoneError ? phoneError : undefined}
              />
              <TextField
                label={tr("Yetkazib berish manzili")}
                autoComplete="street-address"
                value={contact.address}
                onChange={(e) => setContact({ ...contact, address: e.target.value })}
              />
              <TextField
                label={tr("Izoh")}
                multiline
                minRows={2}
                placeholder={tr("O'lcham va ranglar taqsimoti, muddat va h.k.")}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                slotProps={{ htmlInput: { maxLength: 2000 } }}
              />
            </Stack>
          </Box>
        )}

        {/* ---------- 3. To'lov ---------- */}
        {step === 'payment' && checkout && (
          <Stack spacing={2}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">
                {tr("Buyurtma")}{' '}<b>{checkout.order.order_number}</b> · {checkout.order.factory_name}
              </Typography>
              <Typography variant="h6">{formatMoney(checkout.order.total_amount, checkout.order.currency)}</Typography>
            </Box>
            <PaymentForm
              amount={checkout.order.total_amount}
              currency={checkout.order.currency}
              testMode={checkout.payment.test_mode}
              paying={busy}
              error={error}
              onPay={pay}
              onBack={() => {
                setError('');
                setStep('checkout');
              }}
            />
          </Stack>
        )}

        {/* ---------- 4. Tasdiq ---------- */}
        {step === 'done' && paidOrder && (
          <Box sx={{ textAlign: 'center', pt: 4 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 72 }} />
            <Typography variant="h5" sx={{ mt: 1 }}>
              {tr("Rahmat, to'lov qabul qilindi!")}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {tr("Buyurtmangiz")}{' '}<b>{paidOrder.factory_name}</b> {tr("zavodiga yuborildi. Zavod siz bilan")}{' '}
              <b>{paidOrder.customer_phone}</b> {tr("raqami orqali bog'lanadi.")}
            </Typography>
            {inTelegram() && (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                {tr("Buyurtma holati o'zgarganda Telegram botga xabar keladi.")}
              </Typography>
            )}
            <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'left' }}>
              <Row label={tr("Buyurtma raqami")} value={paidOrder.order_number ?? '—'} />
              <Row label={tr("To'langan summa")} value={formatMoney(paidOrder.total_amount, paidOrder.currency)} />
              {paidOrder.card_last4 && <Row label={tr("Karta")} value={`•••• ${paidOrder.card_last4}`} />}
              <Divider sx={{ my: 1 }} />
              {paidOrder.items.map((i) => (
                <Row
                  key={`${i.product_code}|${i.size}|${i.color}`}
                  label={`${i.product_name}${variantLabel(i) ? ` (${variantLabel(i)})` : ''} × ${i.quantity}`}
                  value={formatMoney(i.line_total)}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* ---------- Pastki panel ---------- */}
      {(step === 'cart' || step === 'checkout') && cart.lines.length > 0 && (
        <Box sx={{ p: 2.5, borderTop: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography color="text.secondary">{tr("Jami:")}{' '}{cart.totalQuantity} {tr("ta")}</Typography>
            <Typography variant="h6">{formatMoney(cart.totalAmount)}</Typography>
          </Box>
          {step === 'cart' ? (
            <Button fullWidth variant="contained" size="large" onClick={() => setStep('checkout')}>
              {tr("Buyurtmani rasmiylashtirish")}
            </Button>
          ) : (
            <Stack spacing={1}>
              <Button fullWidth variant="contained" size="large" type="submit" form="checkout-form" disabled={busy}>
                {busy ? tr("Yuborilmoqda...") : tr("To'lovga o'tish")}
              </Button>
              <Button fullWidth color="inherit" onClick={() => setStep('cart')} disabled={busy}>
                {tr("Savatga qaytish")}
              </Button>
            </Stack>
          )}
        </Box>
      )}
      {step === 'done' && (
        <Box sx={{ p: 2.5, borderTop: 1, borderColor: 'divider' }}>
          <Button
            fullWidth
            variant="outlined"
            size="large"
            sx={{ mb: 1 }}
            onClick={() => {
              close();
              navigate('/store/orders');
            }}
          >
            {tr("Buyurtmalarimni ko'rish")}
          </Button>
          <Button fullWidth variant="contained" size="large" onClick={close}>
            {tr("Xaridni davom ettirish")}
          </Button>
        </Box>
      )}
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.5 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
}

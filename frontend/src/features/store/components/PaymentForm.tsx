import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { formatMoney } from '@/shared/utils/money';
import { tr } from '@/i18n';

/** Karta raqami nazorat summasi (Luhn) — UzCard, Humo, Visa, Mastercard raqamlari shunga mos */
function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

function cardBrand(digits: string): string {
  if (digits.startsWith('8600')) return tr("UzCard");
  if (digits.startsWith('9860')) return tr("Humo");
  if (digits.startsWith('4')) return tr("Visa");
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return tr("Mastercard");
  return '';
}

function expiryError(value: string): string {
  const m = value.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return tr("OO/YY formatida kiriting");
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return tr("Oy noto'g'ri");
  const now = new Date();
  if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) return tr("Karta muddati tugagan");
  return '';
}

interface Props {
  amount: number;
  currency: string;
  testMode: boolean;
  paying: boolean;
  error: string;
  /** Faqat oxirgi 4 raqam uzatiladi — to'liq karta raqami komponentdan tashqariga chiqmaydi */
  onPay: (cardLast4: string) => void;
  onBack: () => void;
}

export default function PaymentForm({ amount, currency, testMode, paying, error, onPay, onBack }: Props) {
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const digits = number.replace(/\D/g, '');
  const numberError = digits.length < 16 ? tr("Karta raqamini to'liq kiriting (16 ta raqam)") : !luhnValid(digits) ? tr("Karta raqami noto'g'ri") : '';
  const expError = expiryError(expiry);
  const brand = cardBrand(digits);

  const handleNumber = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 16);
    setNumber(d.replace(/(\d{4})(?=\d)/g, '$1 '));
  };

  const handleExpiry = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 4);
    setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (numberError || expError) return;
    onPay(digits.slice(-4));
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Stack spacing={2}>
        {testMode && (
          <Alert severity="warning">
            <b>{tr("Test rejimi")}</b> {tr("— haqiqiy pul yechilmaydi. Sinash uchun")}{' '}<b>4242 4242 4242 4242</b> {tr("va istalgan kelgusi sanani kiriting.")}
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}

        <Box
          sx={(theme) => ({
            p: 2.5,
            borderRadius: 4,
            color: '#fff',
            // Katalog palitrasi: espresso → mokko
            background: `linear-gradient(135deg, #2b211c 0%, ${theme.palette.primary.dark} 55%, ${theme.palette.primary.main} 100%)`,
            boxShadow: '0 16px 36px rgba(43,33,28,0.3)',
          })}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <CreditCardIcon />
            <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: 1 }}>
              {brand}
            </Typography>
          </Box>
          <Typography sx={{ fontFamily: 'monospace', fontSize: 20, letterSpacing: 2, minHeight: 30 }}>
            {number || '•••• •••• •••• ••••'}
          </Typography>
          <Typography variant="caption" sx={{ opacity: 0.8 }}>
            {expiry || 'OO/YY'}
          </Typography>
        </Box>

        <TextField
          label={tr("Karta raqami")}
          value={number}
          onChange={(e) => handleNumber(e.target.value)}
          placeholder="8600 0000 0000 0000"
          autoComplete="off"
          error={submitted && !!numberError}
          helperText={submitted && numberError ? numberError : tr("UzCard, Humo, Visa yoki Mastercard")}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          autoFocus
        />
        <TextField
          label={tr("Amal qilish muddati")}
          value={expiry}
          onChange={(e) => handleExpiry(e.target.value)}
          placeholder="OO/YY"
          autoComplete="off"
          error={submitted && !!expError}
          helperText={submitted && expError ? expError : undefined}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          sx={{ maxWidth: 200 }}
        />
        <Button type="submit" variant="contained" size="large" disabled={paying} startIcon={<LockOutlinedIcon />}>
          {paying ? tr("To'lanmoqda...") : tr("{0} to'lash", formatMoney(amount, currency))}
        </Button>
        <Button onClick={onBack} color="inherit" disabled={paying}>
          {tr("Orqaga")}
        </Button>
      </Stack>
    </Box>
  );
}

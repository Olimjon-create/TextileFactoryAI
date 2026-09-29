import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { getErrorMessage } from '@/shared/api/client';
import { isValidPhone } from '@/shared/utils/validators';
import { storeApi } from '../api';
import type { StoreProduct } from '../types';
import { tr } from '@/i18n';

const CONTACT_KEY = 'tfai_contact';

function loadContact(): { name: string; phone: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}');
    return { name: saved.name ?? '', phone: saved.phone ?? '' };
  } catch {
    return { name: '', phone: '' };
  }
}

function saveContact(contact: { name: string; phone: string }) {
  try {
    const saved = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? '{}');
    localStorage.setItem(CONTACT_KEY, JSON.stringify({ ...saved, name: contact.name, phone: contact.phone }));
  } catch {
    return;
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  factoryId: number;
  factoryName: string;
  products: StoreProduct[];
  productId?: number | null;
}

export default function AskQuestionDialog({ open, onClose, factoryId, factoryName, products, productId = null }: Props) {
  const [contact, setContact] = useState(loadContact);
  const [product, setProduct] = useState<number | ''>(productId ?? '');
  const [question, setQuestion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) {
      setProduct(productId ?? '');
      setDone(false);
      setError('');
      setSubmitted(false);
    }
  }, [open, productId]);

  const nameError = contact.name.trim().length < 2 ? tr('Ismingizni kiriting') : '';
  const phoneError = !contact.phone.trim()
    ? tr('Telefon raqamingizni kiriting')
    : !isValidPhone(contact.phone)
      ? tr("Telefon raqami noto'g'ri (masalan: +998 90 123 45 67)")
      : '';
  const questionError = question.trim().length < 5 ? tr('Savolingizni yozing') : '';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (nameError || phoneError || questionError) return;
    setBusy(true);
    setError('');
    try {
      await storeApi.askQuestion(factoryId, {
        product_id: product === '' ? null : product,
        customer_name: contact.name.trim(),
        customer_phone: contact.phone.trim(),
        question: question.trim(),
      });
      saveContact(contact);
      setQuestion('');
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err, tr("Savolni yuborib bo'lmadi")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{tr('Zavodga savol berish')}</DialogTitle>
      {done ? (
        <>
          <DialogContent sx={{ textAlign: 'center', py: 4 }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 56 }} />
            <Typography variant="h6" sx={{ mt: 1 }}>
              {tr('Savolingiz yuborildi')}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.5 }}>
              {tr('{0} sizga {1} raqami orqali javob beradi.', factoryName, contact.phone)}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} variant="contained">
              {tr('Yopish')}
            </Button>
          </DialogActions>
        </>
      ) : (
        <Box component="form" onSubmit={submit} noValidate>
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
            <Typography variant="body2" color="text.secondary">
              {tr("Mahsulot, o'lcham, mato yoki yetkazib berish haqida so'rang — {0} sizga telefon orqali javob beradi.", factoryName)}
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            {products.length > 0 && (
              <TextField select label={tr('Mahsulot (ixtiyoriy)')} value={product} onChange={(e) => setProduct(e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">{tr('Umumiy savol')}</MenuItem>
                {products.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label={tr('Savolingiz')}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              multiline
              minRows={3}
              inputProps={{ maxLength: 2000 }}
              error={submitted && !!questionError}
              helperText={submitted && questionError ? questionError : undefined}
              autoFocus
            />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField
                label={tr('Ismingiz')}
                value={contact.name}
                onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))}
                error={submitted && !!nameError}
                helperText={submitted && nameError ? nameError : undefined}
                autoComplete="name"
              />
              <TextField
                label={tr('Telefon')}
                value={contact.phone}
                onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                error={submitted && !!phoneError}
                helperText={submitted && phoneError ? phoneError : undefined}
                autoComplete="tel"
                inputMode="tel"
                placeholder="+998 90 123 45 67"
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose}>{tr('Bekor qilish')}</Button>
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? tr('Yuborilmoqda...') : tr('Yuborish')}
            </Button>
          </DialogActions>
        </Box>
      )}
    </Dialog>
  );
}

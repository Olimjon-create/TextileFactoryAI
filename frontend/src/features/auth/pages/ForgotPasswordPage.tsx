import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { tr } from '@/i18n';
import { getErrorMessage } from '@/shared/api/client';
import { isValidEmail } from '@/shared/utils/validators';
import { authApi } from '../api';

/** Parolni unutdingizmi? — emailga tiklash havolasi yuboriladi */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return setError(tr("Email noto'g'ri formatda"));
    setError('');
    setLoading(true);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Typography variant="h5">{tr('Parolni tiklash')}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        {tr('Hisobingiz emailini kiriting — parolni tiklash havolasini yuboramiz')}
      </Typography>
      {sent ? (
        <Alert severity="success">
          {tr("Agar bu email tizimda bo'lsa, unga havola yuborildi. Pochtangizni (va «Spam» papkasini) tekshiring — havola 1 soat amal qiladi.")}
        </Alert>
      ) : (
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label={tr('Email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          <Button type="submit" variant="contained" size="large" disabled={loading || !email}>
            {loading ? tr('Yuborilmoqda...') : tr('Havola yuborish')}
          </Button>
        </Stack>
      )}
      <Link component={RouterLink} to="/login" sx={{ display: 'inline-block', mt: 2.5 }}>
        {tr('Kirish sahifasiga')}
      </Link>
    </Box>
  );
}

import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { tr } from '@/i18n';
import { getErrorMessage } from '@/shared/api/client';
import PasswordField from '@/shared/components/PasswordField';
import { authApi } from '../api';

const MIN_LENGTH = 8;

/** Emaildagi havola: /reset-password?token=... — yangi parol o'rnatish */
export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const tooShort = password.length < MIN_LENGTH;
  const mismatch = password !== repeat;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (tooShort || mismatch) return;
    setError('');
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={submit} noValidate>
      <Typography variant="h5">{tr('Yangi parol')}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        {tr("Hisobingiz uchun yangi parol o'rnating")}
      </Typography>
      {!token ? (
        <Alert severity="error">{tr("Havola yaroqsiz yoki muddati o'tgan — qaytadan so'rang")}</Alert>
      ) : done ? (
        <Alert severity="success">{tr("Parol o'zgartirildi — endi yangi parol bilan kiring")}</Alert>
      ) : (
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <PasswordField
            label={tr('Yangi parol')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            autoFocus
            error={touched && tooShort}
            helperText={tr('Kamida {0} belgi', MIN_LENGTH)}
          />
          <PasswordField
            label={tr('Yangi parolni takrorlang')}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            autoComplete="new-password"
            error={touched && mismatch}
            helperText={touched && mismatch ? tr('Parollar bir xil emas') : ' '}
          />
          <Button type="submit" variant="contained" size="large" disabled={loading}>
            {loading ? tr('Saqlanmoqda...') : tr('Saqlash')}
          </Button>
        </Stack>
      )}
      <Box sx={{ mt: 2.5, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Link component={RouterLink} to="/login">
          {tr('Kirish sahifasiga')}
        </Link>
        {(!token || error) && (
          <Link component={RouterLink} to="/forgot-password">
            {tr('Yangi havola so\'rash')}
          </Link>
        )}
      </Box>
    </Box>
  );
}

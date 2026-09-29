import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { getErrorMessage } from '@/shared/api/client';
import PasswordField from '@/shared/components/PasswordField';
import { useAuth } from '../AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { tr } from '@/i18n';

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';
  const [resetEnabled, setResetEnabled] = useState(false);
  useEffect(() => {
    authApi.config().then((c) => setResetEnabled(c.password_reset_enabled)).catch(() => undefined);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, tr("Kirishda xatolik")));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle(credential);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, tr("Google orqali kirishda xatolik")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Typography variant="h5">{tr("Tizimga kirish")}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        {tr("Hisobingiz ma'lumotlarini kiriting")}
      </Typography>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label={tr("Email")} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus size="medium" />
        <PasswordField label={tr("Parol")} value={password} onChange={(e) => setPassword(e.target.value)} required size="medium" />
        {resetEnabled && (
          <Link component={RouterLink} to="/forgot-password" variant="body2" sx={{ alignSelf: 'flex-end', mt: '-4px !important' }}>
            {tr('Parolni unutdingizmi?')}
          </Link>
        )}
        <Button type="submit" variant="contained" size="large" disabled={loading || !email || !password}>
          {loading ? tr("Kirilmoqda...") : tr("Kirish")}
        </Button>
      </Stack>
      <GoogleSignInButton onCredential={handleGoogle} />
    </Box>
  );
}

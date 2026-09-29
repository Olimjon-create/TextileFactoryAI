import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Box, Button, Divider, Link, Stack, TextField, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import PasswordField from '@/shared/components/PasswordField';
import { authApi } from '../api';
import { useAuth } from '../AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { tr } from '@/i18n';

const EMPTY = {
  factory_name: '',
  factory_address: '',
  full_name: '',
  email: '',
  phone: '',
  password: '',
  confirm: '',
};

type Field = keyof typeof EMPTY;
type Errors = Partial<Record<Field, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

function validate(form: typeof EMPTY): Errors {
  const errors: Errors = {};
  const factoryName = form.factory_name.trim();
  if (!factoryName) errors.factory_name = tr("Fabrika nomini kiriting");
  else if (factoryName.length < 2) errors.factory_name = tr("Kamida 2 ta belgidan iborat bo'lishi kerak");
  else if (factoryName.length > 200) errors.factory_name = tr("200 ta belgidan oshmasin");

  if (form.factory_address.trim().length > 300) errors.factory_address = tr("300 ta belgidan oshmasin");

  const fullName = form.full_name.trim();
  if (!fullName) errors.full_name = tr("Ismingizni kiriting");
  else if (fullName.length < 2) errors.full_name = tr("Kamida 2 ta belgidan iborat bo'lishi kerak");

  if (!form.email.trim()) errors.email = tr("Email kiriting");
  else if (!EMAIL_RE.test(form.email.trim())) errors.email = tr("Email noto'g'ri formatda (masalan: ism@gmail.com)");

  if (form.phone.trim() && !PHONE_RE.test(form.phone.trim())) errors.phone = tr("Telefon raqami noto'g'ri");

  if (!form.password) errors.password = tr("Parol kiriting");
  else if (form.password.length < 6) errors.password = tr("Kamida 6 ta belgidan iborat bo'lishi kerak");

  if (!form.confirm) errors.confirm = tr("Parolni qayta kiriting");
  else if (form.confirm !== form.password) errors.confirm = tr("Parollar mos kelmadi");

  return errors;
}

function RegisterForm() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const errors = validate(form);
  const fieldError = (field: Field) => ((touched[field] || submitted) && errors[field]) || '';

  const fieldProps = (field: Field) => ({
    value: form[field],
    onChange: (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [field]: true })),
    error: !!fieldError(field),
    helperText: fieldError(field) || undefined,
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError('');
    if (Object.keys(errors).length > 0) return;
    setLoading(true);
    try {
      await register({
        factory_name: form.factory_name.trim(),
        factory_address: form.factory_address.trim() || undefined,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, tr("Ro'yxatdan o'tishda xatolik")));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async (credential: string) => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle(credential);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, tr("Google orqali ro'yxatdan o'tishda xatolik")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Typography variant="h5">{tr("Ro'yxatdan o'tish")}</Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
        {tr("Fabrikangizni yarating — siz uning egasi (Factory Owner) bo'lasiz")}
      </Typography>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label={tr("Fabrika nomi")} required autoFocus {...fieldProps('factory_name')} />
        <TextField label={tr("Fabrika manzili")} {...fieldProps('factory_address')} />
        <Divider />
        <TextField label={tr("To'liq ism")} required autoComplete="name" {...fieldProps('full_name')} />
        <TextField label={tr("Email")} type="email" required autoComplete="email" {...fieldProps('email')} />
        <TextField label={tr("Telefon")} placeholder="+998 90 123 45 67" autoComplete="tel" {...fieldProps('phone')} />
        <PasswordField
          label={tr("Parol")}
          required
          autoComplete="new-password"
          {...fieldProps('password')}
          helperText={fieldError('password') || tr("Kamida 6 ta belgi")}
        />
        <PasswordField label={tr("Parolni tasdiqlang")} required autoComplete="new-password" {...fieldProps('confirm')} />
        <Button type="submit" variant="contained" size="large" disabled={loading}>
          {loading ? tr("Yaratilmoqda...") : tr("Ro'yxatdan o'tish")}
        </Button>
      </Stack>
      <GoogleSignInButton onCredential={handleGoogle} autoPrompt={false} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 3, textAlign: 'center' }}>
        {tr("Hisobingiz bormi?")}{' '}
        <Link component={RouterLink} to="/login" fontWeight={600}>
          {tr("Kirish")}
        </Link>
      </Typography>
    </Box>
  );
}

export default function RegisterPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    authApi
      .config()
      .then((c) => setEnabled(c.registration_enabled))
      .catch(() => setEnabled(false));
  }, []);
  if (enabled === null) return null;
  if (enabled) return <RegisterForm />;
  return (
    <Box>
      <Typography variant="h5">{tr("Ro'yxatdan o'tish yopiq")}</Typography>
      <Alert severity="info" sx={{ mt: 2, mb: 3 }}>
        {tr("Zavod egalari uchun login va parolni administrator beradi. Berilgan login (email) va parol bilan tizimga kiring.")}
      </Alert>
      <Button component={RouterLink} to="/login" variant="contained" fullWidth size="large">
        {tr("Kirish sahifasiga")}
      </Button>
    </Box>
  );
}

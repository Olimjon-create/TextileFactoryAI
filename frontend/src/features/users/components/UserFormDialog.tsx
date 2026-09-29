import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import { getErrorMessage } from '@/shared/api/client';
import PasswordField from '@/shared/components/PasswordField';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { manageableRoles, ROLE_LABELS } from '@/shared/constants/roles';
import type { Factory, Role, User } from '@/shared/types';
import { usersApi, type UserPayload } from '../api';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  user: User | null;
  factories: Factory[];
  onClose: () => void;
  onSaved: () => void;
}

export default function UserFormDialog({ open, user, factories, onClose, onSaved }: Props) {
  const { user: actor } = useAuth();
  const isSuperAdmin = actor?.role === 'SUPER_ADMIN';
  const roles = actor ? manageableRoles(actor.role) : [];

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'WORKER' as Role,
    factory_id: '' as number | '' | 'new',
    factory_name: '',
    is_active: true,
  });
  const [created, setCreated] = useState<{ login: string; password: string; factory: string } | null>(null);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setForm({
      full_name: user?.full_name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      role: user?.role ?? (isSuperAdmin ? 'FACTORY_OWNER' : 'WORKER'),
      factory_id: user?.factory_id ?? (isSuperAdmin ? 'new' : ''),
      factory_name: '',
      is_active: user?.is_active ?? true,
    });
    setCreated(null);
    setError('');
  }, [open, user, isSuperAdmin, save.reset]);

  const needsFactory = isSuperAdmin && form.role !== 'SUPER_ADMIN';
  const canCreateFactory = isSuperAdmin && !user && form.role === 'FACTORY_OWNER';
  const newFactory = canCreateFactory && form.factory_id === 'new';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: Partial<UserPayload> = {
      full_name: form.full_name,
      email: form.email,
      phone: form.phone || null,
      role: form.role,
      is_active: form.is_active,
    };
    if (form.password) payload.password = form.password;
    if (isSuperAdmin) {
      if (newFactory) payload.factory_name = form.factory_name.trim();
      else payload.factory_id = needsFactory ? Number(form.factory_id) : null;
    }
    try {
      const saved = await save.run(() => (user ? usersApi.update(user.id, payload) : usersApi.create(payload as UserPayload)));
      if (user) {
        toast.success(tr("O'zgarishlar saqlandi"));
        onSaved();
      } else {
        setCreated({ login: saved.email, password: form.password, factory: saved.factory?.name ?? '' });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const valid =
    form.full_name.trim().length >= 2 &&
    form.email.includes('@') &&
    (user ? form.password === '' || form.password.length >= 6 : form.password.length >= 6) &&
    (!needsFactory || (newFactory ? form.factory_name.trim().length >= 2 : form.factory_id !== '' && form.factory_id !== 'new'));

  if (created) {
    return (
      <Dialog open={open} onClose={onSaved} maxWidth="xs" fullWidth>
        <DialogTitle>{tr("Foydalanuvchi yaratildi")}</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            {created.factory ? `${created.factory} — ` : ''}{tr("shu login va parolni egasiga bering. Parol boshqa ko'rsatilmaydi.")}
          </Alert>
          <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 2, fontFamily: 'monospace', fontSize: 15, lineHeight: 1.8 }}>
            {tr("Login:")}{' '}<b>{created.login}</b>
            <br />
            {tr("Parol:")}{' '}<b>{created.password}</b>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => navigator.clipboard?.writeText(tr("Login: {0}\nParol: {1}", created.login, created.password)).catch(() => undefined)}>
            {tr("Nusxa olish")}
          </Button>
          <Button variant="contained" onClick={onSaved}>
            {tr("Tayyor")}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{user ? tr("Foydalanuvchini tahrirlash") : tr("Yangi foydalanuvchi")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label={tr("To'liq ism")} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required autoFocus />
            <TextField
              label={tr("Login (email)")}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              helperText={user ? undefined : tr("Foydalanuvchi shu login bilan tizimga kiradi")}
            />
            <TextField label={tr("Telefon")} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <PasswordField
              label={user ? tr("Yangi parol (o'zgartirmaslik uchun bo'sh qoldiring)") : tr("Parol")}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required={!user}
              error={form.password !== '' && form.password.length < 6}
              helperText={tr("Kamida 6 ta belgi")}
            />
            <TextField
              select
              label={tr("Rol")}
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as Role;
                const keepNew = role === 'FACTORY_OWNER' && !user;
                setForm({ ...form, role, factory_id: form.factory_id === 'new' && !keepNew ? '' : form.factory_id });
              }}
            >
              {roles.map((r) => (
                <MenuItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </MenuItem>
              ))}
            </TextField>
            {needsFactory && (
              <TextField
                select
                label={tr("Fabrika")}
                value={form.factory_id}
                onChange={(e) => setForm({ ...form, factory_id: e.target.value === 'new' ? 'new' : Number(e.target.value) })}
                required
              >
                {canCreateFactory && <MenuItem value="new">{tr("+ Yangi fabrika yaratish")}</MenuItem>}
                {factories.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {newFactory && (
              <TextField
                label={tr("Yangi fabrika nomi")}
                required
                value={form.factory_name}
                onChange={(e) => setForm({ ...form, factory_name: e.target.value })}
                helperText={tr("Fabrika shu egasi bilan birga yaratiladi")}
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
            )}
            <FormControlLabel
              control={<Switch checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />}
              label={tr("Faol")}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={!valid} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

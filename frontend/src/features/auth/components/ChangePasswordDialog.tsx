import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import PasswordField from '@/shared/components/PasswordField';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { authApi } from '../api';
import { tr } from '@/i18n';

const MIN_LENGTH = 8;

export default function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();
  const { refreshUser } = useAuth();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setCurrent('');
    setNext('');
    setRepeat('');
    setTouched(false);
    setError('');
  }, [open, save.reset]);

  const tooShort = next.length < MIN_LENGTH;
  const mismatch = next !== repeat;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError('');
    if (!current || tooShort || mismatch) return;
    try {
      await save.run(() => authApi.changePassword(current, next));
      toast.success(tr("Parol o'zgartirildi"));
      refreshUser().catch(() => undefined);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{tr("Parolni o'zgartirish")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <PasswordField
              label={tr("Joriy parol")}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              error={touched && !current}
              helperText={touched && !current ? tr("Joriy parolni kiriting") : ' '}
              autoFocus
            />
            <PasswordField
              label={tr("Yangi parol")}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
              error={touched && tooShort}
              helperText={tr("Kamida {0} belgi", MIN_LENGTH)}
            />
            <PasswordField
              label={tr("Yangi parolni takrorlang")}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              autoComplete="new-password"
              error={touched && mismatch}
              helperText={touched && mismatch ? tr("Parollar bir xil emas") : ' '}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

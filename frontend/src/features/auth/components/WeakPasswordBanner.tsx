import { useState } from 'react';
import { Alert, Button } from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import ChangePasswordDialog from './ChangePasswordDialog';
import { tr } from '@/i18n';

const KEY = 'tfai_weak_pw_hidden';

function hiddenForSession(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export default function WeakPasswordBanner() {
  const { user } = useAuth();
  const [hidden, setHidden] = useState(hiddenForSession);
  const [open, setOpen] = useState(false);

  if (!user?.password_weak || hidden) return null;

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      return;
    }
  };

  return (
    <>
      <Alert
        severity="warning"
        onClose={hide}
        sx={{ mb: 2, alignItems: 'center' }}
        action={
          <Button color="inherit" size="small" variant="outlined" onClick={() => setOpen(true)} sx={{ mr: 1, whiteSpace: 'nowrap' }}>
            {tr("Parolni o'zgartirish")}
          </Button>
        }
      >
        {tr("Parolingiz oson topiladi (standart yoki juda oddiy). Hisobingiz xavfsizligi uchun uni kamida 10 belgili murakkab parolga almashtiring.")}
      </Alert>
      <ChangePasswordDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

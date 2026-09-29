import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert, Snackbar } from '@mui/material';
import { tr } from '@/i18n';

/** Butun ilova uchun qisqa xabarlar (pastda, 3 soniya): "Saqlandi", "Holat yangilandi" va h.k. */
interface ToastValue {
  success: (message: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  // key — bir xil matnli ketma-ket xabarlar ham qaytadan ko'rinsin
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  const [open, setOpen] = useState(false);

  const success = useCallback((message: string) => {
    setToast({ message, key: Date.now() });
    setOpen(true);
  }, []);

  const value = useMemo(() => ({ success }), [success]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        key={toast?.key}
        open={open}
        autoHideDuration={3000}
        onClose={(_, reason) => reason !== 'clickaway' && setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={() => setOpen(false)} sx={{ width: '100%' }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error(tr("useToast must be used inside ToastProvider"));
  return ctx;
}

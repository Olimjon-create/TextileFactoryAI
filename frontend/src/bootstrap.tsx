import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ColorModeProvider } from '@/app/ColorModeContext';
import { router } from '@/app/router';
import { hideSplash } from '@/app/splash';
import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { ToastProvider } from '@/shared/components/Toast';

/** Foydalanuvchi sessiyasi tekshirilgach (yoki sessiya bo'lmasa darhol) splash yashiriladi */
function SplashGate({ children }: { children: ReactNode }) {
  const { initializing } = useAuth();
  useEffect(() => {
    if (!initializing) hideSplash();
  }, [initializing]);
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ColorModeProvider>
      <ToastProvider>
        <AuthProvider>
          <SplashGate>
            <RouterProvider router={router} />
          </SplashGate>
        </AuthProvider>
      </ToastProvider>
    </ColorModeProvider>
  </StrictMode>,
);

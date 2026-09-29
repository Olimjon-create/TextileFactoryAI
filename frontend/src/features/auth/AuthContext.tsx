import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tokenStorage, UNAUTHORIZED_EVENT } from '@/shared/api/client';
import type { Role, TokenResponse, User } from '@/shared/types';
import { authApi, type LoginPayload, type RegisterPayload } from './api';
import { disableGoogleAutoSelect } from './components/GoogleSignInButton';
import { tr } from '@/i18n';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  login: (data: LoginPayload) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => void;
  hasRole: (...roles: Role[]) => boolean;
  /** Profil yoki zavod nomi o'zgargach — foydalanuvchini serverdan qayta o'qish */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  const logout = useCallback(() => {
    disableGoogleAutoSelect();
    tokenStorage.clear();
    setUser(null);
  }, []);

  // Sahifa yangilanganda saqlangan token orqali foydalanuvchini tiklash
  useEffect(() => {
    if (!tokenStorage.get()) {
      setInitializing(false);
      return;
    }
    authApi
      .me()
      .then(setUser)
      .catch(() => tokenStorage.clear())
      .finally(() => setInitializing(false));
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const applyToken = useCallback((res: TokenResponse) => {
    tokenStorage.set(res.access_token);
    setUser(res.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      login: async (data) => applyToken(await authApi.login(data)),
      loginWithGoogle: async (credential) => applyToken(await authApi.google(credential)),
      register: async (data) => applyToken(await authApi.register(data)),
      logout,
      hasRole: (...roles) => !!user && roles.includes(user.role),
      refreshUser: async () => setUser(await authApi.me()),
    }),
    [user, initializing, applyToken, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error(tr("useAuth must be used inside AuthProvider"));
  return ctx;
}

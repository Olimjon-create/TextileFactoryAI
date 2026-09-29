import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { ordersApi } from './api';
import { ORDER_VIEW_ROLES } from './permissions';

const POLL_MS = 30_000;

interface Value {
  newCount: number;
  refresh: () => void;
}

const NewOrdersContext = createContext<Value>({ newCount: 0, refresh: () => undefined });

/**
 * Yangi (to'langan, hali ko'rib chiqilmagan) buyurtmalar soni — sidebar belgisi uchun.
 * Har 30 soniyada yangilanadi, shuning uchun mijoz to'lagan buyurtma zavodga darhol ko'rinadi.
 */
export function NewOrdersProvider({ children }: { children: ReactNode }) {
  const { hasRole, user } = useAuth();
  const enabled = !!user && hasRole(...ORDER_VIEW_ROLES);
  const [newCount, setNewCount] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    ordersApi
      .summary()
      .then((s) => setNewCount(s.new_count))
      .catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setNewCount(0);
      return;
    }
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return <NewOrdersContext.Provider value={{ newCount, refresh }}>{children}</NewOrdersContext.Provider>;
}

export const useNewOrders = () => useContext(NewOrdersContext);

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { tr } from '@/i18n';

const STORAGE_KEY = 'tfai_my_orders';
const MAX_ORDERS = 100;

function load(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string').slice(0, MAX_ORDERS) : [];
  } catch {
    return [];
  }
}

interface MyOrdersValue {
  tokens: string[];
  add: (token: string) => void;
}

const MyOrdersContext = createContext<MyOrdersValue | null>(null);

export function MyOrdersProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<string[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
    } catch {
    }
  }, [tokens]);

  const add = useCallback((token: string) => {
    setTokens((prev) => [token, ...prev.filter((t) => t !== token)].slice(0, MAX_ORDERS));
  }, []);

  const value = useMemo(() => ({ tokens, add }), [tokens, add]);
  return <MyOrdersContext.Provider value={value}>{children}</MyOrdersContext.Provider>;
}

export function useMyOrders(): MyOrdersValue {
  const ctx = useContext(MyOrdersContext);
  if (!ctx) throw new Error(tr("useMyOrders must be used inside MyOrdersProvider"));
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StoreProduct } from './types';
import { tr } from '@/i18n';

/** Mijoz tanlagan variant. Mahsulotda o'lcham/rang bo'lmasa — null */
export interface Variant {
  size: string | null;
  color: string | null;
}

export interface CartLine extends Variant {
  /** Qator kaliti: mahsulot + o'lcham + rang — har bir variant alohida qator */
  key: string;
  productId: number;
  name: string;
  code: string;
  price: number;
  unit: StoreProduct['unit'];
  imageUrl: string | null;
  quantity: number;
}

interface CartState {
  factoryId: number | null;
  factoryName: string;
  lines: CartLine[];
}

type FactoryRef = { id: number; name: string };

interface CartContextValue extends CartState {
  totalQuantity: number;
  totalAmount: number;
  quantityOf: (productId: number, variant: Variant) => number;
  /** Shu mahsulotning savatdagi barcha variantlari */
  linesOf: (productId: number) => CartLine[];
  /**
   * Variant miqdorini o'rnatadi (0 — savatdan olib tashlash).
   * Savatda boshqa zavod mahsulotlari bo'lsa false qaytaradi (avval tozalash kerak).
   */
  setQuantity: (factory: FactoryRef, product: StoreProduct, variant: Variant, quantity: number) => boolean;
  /** Savatni tozalab, boshqa zavodning mahsuloti bilan yangidan boshlaydi */
  startNew: (factory: FactoryRef, product: StoreProduct, variant: Variant, quantity: number) => void;
  /** Savatdagi qator miqdorini o'zgartirish (0 — olib tashlash) */
  setLineQuantity: (key: string, quantity: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const STORAGE_KEY = 'tfai_cart';
const EMPTY: CartState = { factoryId: null, factoryName: '', lines: [] };
export const MAX_QUANTITY = 100000;

export const lineKey = (productId: number, v: Variant) => `${productId}|${v.size ?? ''}|${v.color ?? ''}`;

function load(): CartState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as CartState;
    if (!Array.isArray(parsed.lines)) return EMPTY;
    // Eski formatdagi savat (variantsiz) — kalitlarni to'ldiramiz
    const lines = parsed.lines.map((l) => {
      const size = l.size ?? null;
      const color = l.color ?? null;
      return { ...l, size, color, key: lineKey(l.productId, { size, color }) };
    });
    return { ...parsed, lines };
  } catch {
    return EMPTY;
  }
}

const clampQuantity = (q: number) => Math.max(0, Math.min(MAX_QUANTITY, Math.floor(q) || 0));

const makeLine = (product: StoreProduct, variant: Variant, quantity: number): CartLine => ({
  key: lineKey(product.id, variant),
  productId: product.id,
  size: variant.size,
  color: variant.color,
  name: product.name,
  code: product.code,
  price: product.price,
  unit: product.unit,
  imageUrl: product.image_url,
  quantity,
});

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(load);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      if (state.lines.length === 0) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Brauzer xotirasi yopiq bo'lsa savat faqat sahifa ochiq turganda saqlanadi
    }
  }, [state]);

  const setQuantity = useCallback<CartContextValue['setQuantity']>(
    (factory, product, variant, quantity) => {
      // Bitta buyurtma — bitta zavod: boshqa zavod mahsuloti bo'lsa, qo'shmaymiz
      if (state.factoryId !== null && state.factoryId !== factory.id && state.lines.length > 0) return false;
      const key = lineKey(product.id, variant);
      setState((prev) => {
        const qty = clampQuantity(quantity);
        const lines =
          qty === 0
            ? prev.lines.filter((l) => l.key !== key)
            : prev.lines.some((l) => l.key === key)
              ? prev.lines.map((l) => (l.key === key ? { ...l, quantity: qty, price: product.price } : l))
              : [...prev.lines, makeLine(product, variant, qty)];
        return lines.length === 0 ? EMPTY : { factoryId: factory.id, factoryName: factory.name, lines };
      });
      return true;
    },
    [state.factoryId, state.lines.length],
  );

  const setLineQuantity = useCallback((key: string, quantity: number) => {
    const qty = clampQuantity(quantity);
    setState((prev) => {
      const lines =
        qty === 0 ? prev.lines.filter((l) => l.key !== key) : prev.lines.map((l) => (l.key === key ? { ...l, quantity: qty } : l));
      return lines.length === 0 ? EMPTY : { ...prev, lines };
    });
  }, []);

  const removeLine = useCallback((key: string) => setLineQuantity(key, 0), [setLineQuantity]);

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      totalQuantity: state.lines.reduce((s, l) => s + l.quantity, 0),
      totalAmount: state.lines.reduce((s, l) => s + l.quantity * l.price, 0),
      quantityOf: (id, variant) => state.lines.find((l) => l.key === lineKey(id, variant))?.quantity ?? 0,
      linesOf: (id) => state.lines.filter((l) => l.productId === id),
      setQuantity,
      startNew: (factory, product, variant, quantity) => {
        const qty = clampQuantity(quantity);
        setState(
          qty === 0 ? EMPTY : { factoryId: factory.id, factoryName: factory.name, lines: [makeLine(product, variant, qty)] },
        );
      },
      setLineQuantity,
      removeLine,
      clear: () => setState(EMPTY),
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [state, isOpen, setQuantity, setLineQuantity, removeLine],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error(tr("useCart must be used inside CartProvider"));
  return ctx;
}

/** "M · Oq" ko'rinishida variant nomi */
export const variantLabel = (v: Variant) => [v.size, v.color].filter(Boolean).join(' · ');

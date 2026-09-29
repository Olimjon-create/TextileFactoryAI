import axios, { AxiosError } from 'axios';
import { getLang, tr } from '@/i18n';

const TOKEN_KEY = 'tfai_token';

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
});

api.interceptors.request.use((config) => {
  const token = tokenStorage.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['Accept-Language'] = getLang();
  return config;
});

export const UNAUTHORIZED_EVENT = 'tfai:unauthorized';

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && tokenStorage.get()) {
      tokenStorage.clear();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    return Promise.reject(error);
  },
);

const FIELD_LABELS: Record<string, string> = {
  email: tr("Email"),
  password: tr("Parol"),
  full_name: tr("To'liq ism"),
  phone: tr("Telefon"),
  factory_name: tr("Fabrika nomi"),
  factory_address: tr("Fabrika manzili"),
  factory_id: tr("Fabrika"),
  role: 'Rol',
  name: 'Nomi',
  code: 'Kod',
  category: tr("Kategoriya"),
  description: tr("Tavsif"),
  address: tr("Manzil"),
  sizes: tr("O'lchamlar"),
  colors: tr("Ranglar"),
  unit: "O'lchov birligi",
  status: tr("Status"),
  material_type: tr("Material turi"),
  material_name: tr("Material nomi"),
  quantity: tr("Miqdor"),
  waste_percent: tr("Isrof foizi"),
  notes: tr("Izoh"),
  customer_code: tr("Mijoz kodi"),
  customer_type: tr("Mijoz turi"),
  contact_person: tr("Kontakt shaxs"),
  country: tr("Davlat"),
};

interface ValidationIssue {
  type?: string;
  msg?: string;
  loc?: (string | number)[];
  ctx?: Record<string, unknown>;
}

function translateIssue(issue: ValidationIssue): string {
  const ctx = issue.ctx ?? {};
  switch (issue.type) {
    case 'missing':
      return tr("to'ldirilishi shart");
    case 'string_too_short':
      return tr("kamida {0} ta belgidan iborat bo'lishi kerak", ctx.min_length);
    case 'string_too_long':
      return tr("{0} ta belgidan oshmasligi kerak", ctx.max_length);
    case 'greater_than':
      return tr("{0} dan katta bo'lishi kerak", ctx.gt);
    case 'greater_than_equal':
      return tr("kamida {0} bo'lishi kerak", ctx.ge);
    case 'less_than':
      return tr("{0} dan kichik bo'lishi kerak", ctx.lt);
    case 'less_than_equal':
      return tr("{0} dan oshmasligi kerak", ctx.le);
    case 'enum':
    case 'literal_error':
      return tr("noto'g'ri qiymat");
    case 'float_parsing':
    case 'int_parsing':
      return tr("son bo'lishi kerak");
    case 'value_error': {
      const msg = (issue.msg ?? '').replace(/^Value error, /, '');
      if (/email/i.test(msg) || /@-sign/.test(msg)) return tr("noto'g'ri formatda");
      return msg;
    }
    default:
      return issue.msg ?? tr("noto'g'ri qiymat");
  }
}

export function isServerUnavailable(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return !error.response || error.response.status >= 500;
}

export function getErrorMessage(error: unknown, fallback = tr("Xatolik yuz berdi")): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return tr(detail);
    if (Array.isArray(detail) && detail.length > 0) {
      const issue = detail[0] as ValidationIssue;
      const field = issue.loc?.filter((p) => typeof p === 'string' && p !== 'body').pop() as string | undefined;
      const label = field ? FIELD_LABELS[field] ?? field : '';
      const text = translateIssue(issue);
      return label ? `${label} ${text}` : text;
    }
    const statusCode = error.response?.status;
    if (!error.response || (statusCode && statusCode >= 500)) {
      return tr("Server bilan bog'lanib bo'lmadi. Backend (port 8001) va PostgreSQL ishlayotganini tekshiring.");
    }
  }
  return fallback;
}

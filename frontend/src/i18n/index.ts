import { telegramLanguage } from '@/shared/telegram';

export type Lang = 'uz' | 'ru' | 'en';

export const LANGUAGES: { code: Lang; label: string; short: string }[] = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'en', label: 'English', short: 'EN' },
];

const STORAGE_KEY = 'tfai_lang';

function readLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'uz' || v === 'ru' || v === 'en') return v;
  } catch {
  }
  const tg = telegramLanguage();
  return tg?.startsWith('ru') ? 'ru' : tg?.startsWith('en') ? 'en' : 'uz';
}

let lang: Lang = readLang();
let dict: Record<string, string> = {};

export const getLang = (): Lang => lang;

export const intlLocale = (): string => ({ uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' })[lang];

export async function loadDictionary(): Promise<void> {
  document.documentElement.lang = lang;
  if (lang === 'uz') return;
  try {
    const mod = lang === 'ru' ? await import('./locales/ru.json') : await import('./locales/en.json');
    dict = mod.default as Record<string, string>;
  } catch {
    dict = {};
  }
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
  }
  window.location.reload();
}

export function tr(text: string, ...args: unknown[]): string {
  const out = dict[text] ?? text;
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : out;
}

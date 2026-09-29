/**
 * Tarjima: kalit — o'zbekcha matnning o'zi (asosiy til). tr("Yangi xodim") tanlangan tilda qaytaradi,
 * tarjima bo'lmasa o'zbekchasi ko'rinadi. O'zgaruvchan qismlar: tr("{0} ta xodim", n).
 *
 * Til almashganda sahifa qayta yuklanadi — modul darajasidagi yorliqlar (…_LABELS) ham yangi tilda hisoblanadi.
 * Lug'atlar: locales/ru.json, locales/en.json — ilova ishga tushishidan oldin (main.tsx) yuklanadi.
 */

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
    /* saqlash yopiq (maxfiy oyna) — standart til */
  }
  return 'uz';
}

let lang: Lang = readLang();
let dict: Record<string, string> = {};

export const getLang = (): Lang => lang;

/** Brauzer/Intl uchun til kodi (sana, raqam, mamlakat nomlari) */
export const intlLocale = (): string => ({ uz: 'uz-UZ', ru: 'ru-RU', en: 'en-GB' })[lang];

/** Tanlangan til lug'atini yuklash — ilovani chizishdan oldin bir marta */
export async function loadDictionary(): Promise<void> {
  document.documentElement.lang = lang;
  if (lang === 'uz') return;
  try {
    const mod = lang === 'ru' ? await import('./locales/ru.json') : await import('./locales/en.json');
    dict = mod.default as Record<string, string>;
  } catch {
    dict = {}; // lug'at yuklanmasa — o'zbekcha ko'rinadi, ilova ishlayveradi
  }
}

/** Tilni almashtirish: saqlab, sahifani qayta yuklaydi */
export function setLang(next: Lang): void {
  if (next === lang) return;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* saqlanmasa ham shu seans uchun */
  }
  window.location.reload();
}

/** O'zbekcha matnni tanlangan tilga o'giradi; {0}, {1} … — args bilan almashtiriladi */
export function tr(text: string, ...args: unknown[]): string {
  const out = dict[text] ?? text;
  return args.length ? out.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : out;
}

/**
 * Telegram Mini App: bot "Do'konni ochish" tugmasi saytni Telegram ichida ochadi va URL'ning #hash qismida
 * tgWebAppData (imzolangan foydalanuvchi ma'lumoti) yuboradi. Router hash'ni yo'qotadi, shuning uchun
 * birinchi yuklanishda sessionStorage'ga olib qo'yamiz. Imzo serverda tekshiriladi — bu yerda faqat tashiladi.
 */

const KEY = 'tfai_tg_init';

function capture(): string | null {
  try {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('tgWebAppData');
    if (fromHash) {
      sessionStorage.setItem(KEY, fromHash);
      return fromHash;
    }
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const initData = capture();

/** Mini App ichida ochilganmi */
export const inTelegram = (): boolean => !!initData;

/** Buyurtma bilan serverga yuboriladi (mijozga holat xabarlari shu Telegram hisobiga boradi) */
export const telegramInitData = (): string | null => initData;

/** Telegram foydalanuvchisining ilova tili (sayt tili hali tanlanmagan bo'lsa ishlatiladi) */
export function telegramLanguage(): string | null {
  if (!initData) return null;
  try {
    const user = JSON.parse(new URLSearchParams(initData).get('user') ?? '{}') as { language_code?: string };
    return user.language_code ?? null;
  } catch {
    return null;
  }
}

/** Telegram'ning rasmiy skripti: to'liq ekran, "tayyor" signali. Faqat Mini App ichida yuklanadi. */
export function startTelegramApp(): void {
  if (!initData) return;
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.onload = () => {
    const app = (window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }).Telegram?.WebApp;
    app?.ready();
    app?.expand();
  };
  document.head.appendChild(script);
}

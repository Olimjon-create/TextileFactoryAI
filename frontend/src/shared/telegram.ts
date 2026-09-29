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

export const inTelegram = (): boolean => !!initData;

export const telegramInitData = (): string | null => initData;

export function telegramLanguage(): string | null {
  if (!initData) return null;
  try {
    const user = JSON.parse(new URLSearchParams(initData).get('user') ?? '{}') as { language_code?: string };
    return user.language_code ?? null;
  } catch {
    return null;
  }
}

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

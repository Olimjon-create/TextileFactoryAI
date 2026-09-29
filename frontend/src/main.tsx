import { loadDictionary } from '@/i18n';
import { startTelegramApp } from '@/shared/telegram';

startTelegramApp();

// Avval tanlangan til lug'ati, keyin ilova: modul darajasidagi yorliqlar (…_LABELS) import paytida
// hisoblanadi, shuning uchun ilova kodi lug'at tayyor bo'lgach import qilinadi.
loadDictionary().finally(() => import('./bootstrap'));

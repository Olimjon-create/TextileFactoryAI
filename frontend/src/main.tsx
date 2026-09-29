import { loadDictionary } from '@/i18n';
import { startTelegramApp } from '@/shared/telegram';

startTelegramApp();

loadDictionary().finally(() => import('./bootstrap'));

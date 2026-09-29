import { tr } from '@/i18n';
const formatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function formatMoney(amount: number | null | undefined, currency = 'UZS'): string {
  if (amount === null || amount === undefined) return '—';
  const suffix = currency === 'UZS' ? tr("so'm") : currency;
  return `${formatter.format(amount)} ${suffix}`;
}

export function formatMoneyShort(amount: number | null | undefined, currency = 'UZS', withCurrency = true): string {
  if (amount === null || amount === undefined) return '—';
  const suffix = withCurrency ? (currency === 'UZS' ? tr(" so'm") : ` ${currency}`) : '';
  const abs = Math.abs(amount);
  const short = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  if (abs >= 1e9) return `${short.format(amount / 1e9)} ${tr('mlrd')}${suffix}`;
  if (abs >= 1e6) return `${short.format(amount / 1e6)} ${tr('mln')}${suffix}`;
  if (abs >= 1e4) return `${short.format(amount / 1e3)} ${tr('ming')}${suffix}`;
  return withCurrency ? formatMoney(amount, currency) : short.format(amount);
}

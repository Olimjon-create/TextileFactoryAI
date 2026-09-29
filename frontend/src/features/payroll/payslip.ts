import { BRAND_NAME } from '@/shared/constants/brand';
import { formatDate } from '@/shared/utils/dates';
import { formatMoney } from '@/shared/utils/money';
import { PAY_TYPE_LABELS } from '@/features/resources/constants';
import type { Adjustment, PayrollRow } from './api';
import { getLang, intlLocale, tr } from '@/i18n';

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const KIND: Record<Adjustment['kind'], string> = { BONUS: tr('Bonus'), DEDUCTION: tr('Jarima / ushlab qolish'), ADVANCE: tr('Avans') };

export function printPayslip(row: PayrollRow, month: string, adjustments: Adjustment[]): void {
  const [y, m] = month.split('-').map(Number);
  const period = new Date(y, m - 1, 1).toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' });
  const work =
    row.pay_type === 'PIECE' ? tr('{0} dona', row.pieces) : row.pay_type === 'HOURLY' ? tr('{0} soat', row.hours) : tr('{0} kun keldi', row.present_days);
  const adj = adjustments
    .map((a) => `<tr><td>${esc(KIND[a.kind])}${a.note ? ` <span class="muted">(${esc(a.note)})</span>` : ''}</td><td class="muted">${esc(formatDate(a.created_at))}</td><td class="num">${a.kind === 'BONUS' ? '+' : '−'}${esc(formatMoney(a.amount))}</td></tr>`)
    .join('');
  const line = (label: string, value: string, bold = false) =>
    `<tr${bold ? ' class="total"' : ''}><td colspan="2">${esc(label)}</td><td class="num">${esc(value)}</td></tr>`;
  const html = `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>${esc(tr('Hisob varaqasi'))} — ${esc(row.full_name)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#222;max-width:620px;margin:32px auto;padding:0 20px}
h1{font-size:20px;margin:0}.muted{color:#777;font-size:12px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;margin:10px 0}td{padding:7px 4px;border-bottom:1px solid #ddd;font-size:14px}.num{text-align:right;white-space:nowrap}
.total td{font-weight:700;font-size:16px;border-top:2px solid #222}.sign{display:flex;justify-content:space-between;margin-top:48px;font-size:13px}
@media print{body{margin:0}}
</style></head><body>
<div class="head"><div><h1>${esc(tr('Hisob varaqasi'))}</h1><div class="muted">${esc(BRAND_NAME)} · ${esc(period)}</div></div>
<div style="text-align:right"><b>${esc(row.full_name)}</b><div class="muted">${esc(row.employee_code)}${row.position ? ` · ${esc(row.position)}` : ''}</div></div></div>
<table>
${line(`${PAY_TYPE_LABELS[row.pay_type]} · ${work}${row.pay_rate != null ? ` × ${formatMoney(row.pay_rate)}` : ''}`, formatMoney(row.base))}
${adj}
${line(tr("To'lanadi"), formatMoney(row.to_pay), true)}
</table>
${row.payment_id ? `<p class="muted">${esc(tr("To'langan"))}: ${esc(formatDate(row.paid_at ?? ''))}</p>` : ''}
<div class="sign"><span>${esc(tr('Hisobchi'))}: ____________</span><span>${esc(tr('Xodim imzosi'))}: ____________</span></div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const win = window.open('', '_blank', 'width=720,height=900');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

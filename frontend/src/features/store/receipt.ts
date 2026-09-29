import { formatMoney } from '@/shared/utils/money';
import { formatDateTime } from '@/shared/utils/dates';
import { BRAND_NAME } from '@/shared/constants/brand';
import { variantLabel } from './CartContext';
import type { PublicOrder } from './types';
import { getLang, tr } from '@/i18n';

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export function printReceipt(order: PublicOrder): void {
  const rows = order.items
    .map((i) => {
      const variant = variantLabel(i);
      return `<tr><td>${esc(i.product_name)}${variant ? ` <span class="muted">(${esc(variant)})</span>` : ''}<div class="muted">${esc(i.product_code)}</div></td>`
        + `<td class="num">${esc(i.quantity)}</td><td class="num">${esc(formatMoney(i.unit_price))}</td><td class="num">${esc(formatMoney(i.line_total))}</td></tr>`;
    })
    .join('');
  const html = `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><title>${esc(tr('Chek'))} ${esc(order.order_number)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#222;max-width:680px;margin:32px auto;padding:0 20px}
h1{font-size:22px;margin:0}.muted{color:#777;font-size:12px}.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;margin:12px 0}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #ddd;vertical-align:top;font-size:14px}th{font-size:12px;color:#555;text-transform:uppercase}
.num{text-align:right;white-space:nowrap}.total{display:flex;justify-content:space-between;font-size:18px;font-weight:700;margin-top:8px}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:14px}.foot{margin-top:28px;font-size:12px;color:#777;text-align:center}
@media print{body{margin:0}}
</style></head><body>
<div class="head"><div><h1>${esc(BRAND_NAME)}</h1><div class="muted">${esc(order.factory_name)}</div></div>
<div style="text-align:right"><div style="font-size:18px;font-weight:700">${esc(tr('Chek'))} ${esc(order.order_number)}</div><div class="muted">${esc(formatDateTime(order.paid_at ?? order.created_at))}</div></div></div>
<div class="meta"><span class="muted">${esc(tr('Mijoz'))}</span><span>${esc(order.customer_name)}</span>
<span class="muted">${esc(tr('Telefon'))}</span><span>${esc(order.customer_phone)}</span>
${order.delivery_address ? `<span class="muted">${esc(tr('Manzil'))}</span><span>${esc(order.delivery_address)}</span>` : ''}
<span class="muted">${esc(tr("To'lov"))}</span><span>${esc(order.payment_status === 'PAID' ? tr("To'langan") : order.payment_status)}${order.card_last4 ? ` · •••• ${esc(order.card_last4)}` : ''}</span></div>
<table><thead><tr><th>${esc(tr('Mahsulot'))}</th><th class="num">${esc(tr('Soni'))}</th><th class="num">${esc(tr('Narxi'))}</th><th class="num">${esc(tr('Summa'))}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="total"><span>${esc(tr('Jami'))}</span><span>${esc(formatMoney(order.total_amount, order.currency))}</span></div>
<div class="foot">${esc(tr('Xaridingiz uchun rahmat!'))}</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  const win = window.open('', '_blank', 'width=760,height=900');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

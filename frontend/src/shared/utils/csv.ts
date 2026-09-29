export type CsvValue = string | number | null | undefined;

export function downloadCsv(name: string, headers: string[], rows: CsvValue[][], footer?: CsvValue[]) {
  const esc = (v: CsvValue) => {
    const s = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows, ...(footer ? [footer] : [])].map((r) => r.map(esc).join(';'));
  const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function fetchAll<T>(page: (offset: number, limit: number) => Promise<{ items: T[]; total: number }>, max = 10_000): Promise<T[]> {
  const limit = 100;
  const items: T[] = [];
  for (let offset = 0; offset < max; offset += limit) {
    const res = await page(offset, limit);
    items.push(...res.items);
    if (items.length >= res.total || res.items.length < limit) break;
  }
  return items;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

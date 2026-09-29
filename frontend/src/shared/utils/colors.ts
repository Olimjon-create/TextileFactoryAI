// Mahsulot rang nomlari -> namuna rangi (katalogdagi rang tanlash doirachalari uchun).
// Ro'yxatda yo'q nomlar uchun namuna ko'rsatilmaydi.
const SWATCHES: Record<string, string> = {
  oq: '#f7f7f5',
  qora: '#1f1f22',
  "ko'k": '#1f3a93',
  havorang: '#8fb8de',
  qizil: '#c62828',
  yashil: '#2e7d32',
  bej: '#d8c3a5',
  kulrang: '#8d8f94',
  jigarrang: '#6d4c41',
  sariq: '#f9c80e',
  pushti: '#f06292',
  binafsha: '#7b1fa2',
  "to'q sariq": '#ef6c00',
};

export function colorSwatch(name: string): string | null {
  return SWATCHES[name.trim().toLowerCase().replace(/[`‘’ʻ]/g, "'")] ?? null;
}

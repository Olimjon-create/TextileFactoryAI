// Backenddagi pydantic tekshiruvlari bilan mos keladigan umumiy qoidalar
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;

export const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
export const isValidPhone = (v: string) => PHONE_RE.test(v.trim());

/** Bo'sh satrni null ga aylantiradi (ixtiyoriy maydonlar uchun) */
export const orNull = (v: string) => v.trim() || null;

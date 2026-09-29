/** So'rov parametrlaridan bo'sh qiymatlarni olib tashlaydi. `false` saqlanadi — backend uni "yo'q" deb emas, qiymat sifatida qabul qiladi */
export const cleanParams = (filters: object) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined && v !== null));

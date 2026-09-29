import type { MaterialType, MaterialUnit, ProductionUnit, ProductStatus } from './types';
import { tr } from '@/i18n';

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: tr("Qoralama"),
  ACTIVE: tr("Faol"),
  ARCHIVED: tr("Arxivlangan"),
};

export const PRODUCT_STATUS_COLORS: Record<ProductStatus, 'default' | 'success' | 'warning'> = {
  DRAFT: 'warning',
  ACTIVE: 'success',
  ARCHIVED: 'default',
};

export const PRODUCTION_UNIT_LABELS: Record<ProductionUnit, string> = {
  PIECE: tr("Dona"),
  PAIR: tr("Juft"),
  SET: tr("To'plam"),
  DOZEN: tr("Dyujina (12 dona)"),
};

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  FABRIC: tr("Mato"),
  THREAD: tr("Ip"),
  BUTTON: tr("Tugma"),
  ZIPPER: tr("Fermuar"),
  LABEL: tr("Yorliq"),
  ELASTIC: tr("Rezina"),
  INTERLINING: tr("Dublerin"),
  PACKAGING: tr("Qadoq"),
  ACCESSORY: tr("Aksessuar"),
  OTHER: tr("Boshqa"),
};

// Material turi tanlanganda taklif qilinadigan o'lchov birligi
export const DEFAULT_MATERIAL_UNIT: Record<MaterialType, MaterialUnit> = {
  FABRIC: 'METER',
  THREAD: 'METER',
  BUTTON: 'PIECE',
  ZIPPER: 'PIECE',
  LABEL: 'PIECE',
  ELASTIC: 'METER',
  INTERLINING: 'METER',
  PACKAGING: 'PIECE',
  ACCESSORY: 'PIECE',
  OTHER: 'PIECE',
};

export const MATERIAL_UNIT_LABELS: Record<MaterialUnit, string> = {
  METER: 'metr',
  CENTIMETER: 'sm',
  SQUARE_METER: 'm²',
  KILOGRAM: 'kg',
  GRAM: 'gramm',
  PIECE: 'dona',
  PAIR: 'juft',
  SPOOL: tr("g'altak"),
};

export const SIZE_SUGGESTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '42', '44', '46', '48', '50', '52', '54', '56'];
export const COLOR_SUGGESTIONS = [tr("Oq"), tr("Qora"), tr("Ko'k"), tr("Qizil"), tr("Yashil"), tr("Kulrang"), tr("Bej"), tr("Jigarrang"), tr("Sariq"), tr("Pushti")];

export const keysOf = <T extends string>(record: Record<T, unknown>) => Object.keys(record) as T[];

export const formatQuantity = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 }).format(value);

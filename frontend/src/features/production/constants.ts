import type { ProductionStage } from '@/features/resources/types';
import type { LogSource, WorkOrderStatus } from './types';
import { tr } from '@/i18n';

export { STAGE_LABELS } from '@/features/resources/constants';

/** Marshrut tartibi — backenddagi models.production.STAGE_ROUTE bilan bir xil */
export const STAGE_ROUTE: ProductionStage[] = ['CUTTING', 'SEWING', 'FINISHING', 'QUALITY_CONTROL', 'PACKING'];

export const STAGE_SHORT: Record<ProductionStage, string> = {
  CUTTING: tr("Kesish"),
  SEWING: tr("Tikuv"),
  FINISHING: tr("Pardoz"),
  QUALITY_CONTROL: tr("Sifat"),
  PACKING: tr("Qadoq"),
};

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  PLANNED: tr("Rejada"),
  IN_PROGRESS: tr("Jarayonda"),
  COMPLETED: tr("Tugallangan"),
  CANCELLED: tr("Bekor qilingan"),
};

export const WO_STATUS_COLORS: Record<WorkOrderStatus, 'default' | 'info' | 'success' | 'error'> = {
  PLANNED: 'default',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

export const SOURCE_LABELS: Record<LogSource, string> = {
  MANUAL: tr("Qo'lda"),
  SCANNER: tr("Skaner"),
  CAMERA: tr("Kamera (AI)"),
};

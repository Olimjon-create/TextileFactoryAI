import { Chip } from '@mui/material';
import { WO_STATUS_COLORS, WO_STATUS_LABELS } from '../constants';
import type { WorkOrder } from '../types';
import { tr } from '@/i18n';

export function WorkOrderStatusChip({ wo }: { wo: Pick<WorkOrder, 'status' | 'is_late'> }) {
  return (
    <>
      <Chip size="small" color={WO_STATUS_COLORS[wo.status]} variant={wo.status === 'PLANNED' ? 'outlined' : 'filled'} label={WO_STATUS_LABELS[wo.status]} />
      {wo.is_late && <Chip size="small" color="error" label={tr("Kechikmoqda")} sx={{ ml: 0.5 }} />}
    </>
  );
}

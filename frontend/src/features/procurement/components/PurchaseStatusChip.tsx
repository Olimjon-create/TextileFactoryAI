import { Box, Chip } from '@mui/material';
import { PURCHASE_STATUS_COLORS, PURCHASE_STATUS_LABELS } from '../constants';
import type { PurchaseOrder } from '../types';
import { tr } from '@/i18n';

export default function PurchaseStatusChip({ po }: { po: Pick<PurchaseOrder, 'status' | 'is_overdue'> }) {
  return (
    <Box sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
      <Chip size="small" label={PURCHASE_STATUS_LABELS[po.status]} color={PURCHASE_STATUS_COLORS[po.status]} />
      {po.is_overdue && <Chip size="small" label={tr("Kechikmoqda")} color="error" variant="outlined" />}
    </Box>
  );
}

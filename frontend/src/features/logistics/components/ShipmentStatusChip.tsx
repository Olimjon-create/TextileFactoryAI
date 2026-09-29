import { Box, Chip } from '@mui/material';
import { SHIPMENT_STATUS_COLORS, SHIPMENT_STATUS_LABELS } from '../constants';
import type { Shipment } from '../types';
import { tr } from '@/i18n';

export default function ShipmentStatusChip({ sh }: { sh: Pick<Shipment, 'status' | 'is_late'> }) {
  return (
    <Box sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap' }}>
      <Chip size="small" label={SHIPMENT_STATUS_LABELS[sh.status]} color={SHIPMENT_STATUS_COLORS[sh.status]} />
      {sh.is_late && <Chip size="small" label={tr("Kechikmoqda")} color="error" variant="outlined" />}
    </Box>
  );
}

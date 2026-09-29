import { Chip, Tooltip } from '@mui/material';
import { CUSTOMER_STATUS_COLORS, CUSTOMER_STATUS_HINTS, CUSTOMER_STATUS_LABELS } from '../constants';
import type { CustomerStatus } from '../types';

export default function CustomerStatusChip({ status }: { status: CustomerStatus }) {
  return (
    <Tooltip title={CUSTOMER_STATUS_HINTS[status]}>
      <Chip size="small" label={CUSTOMER_STATUS_LABELS[status]} color={CUSTOMER_STATUS_COLORS[status]} />
    </Tooltip>
  );
}

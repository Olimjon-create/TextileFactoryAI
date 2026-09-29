import { Chip } from '@mui/material';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '../constants';
import type { OrderStatus } from '../types';

export default function OrderStatusChip({ status }: { status: OrderStatus }) {
  return (
    <Chip
      size="small"
      label={ORDER_STATUS_LABELS[status]}
      color={ORDER_STATUS_COLORS[status]}
      variant={status === 'NEW' ? 'filled' : 'outlined'}
    />
  );
}

import { Chip, Typography } from '@mui/material';
import type { OrderListItem } from '../types';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

const DAY = 24 * 60 * 60 * 1000;

/** Topshirish muddati: kechikkan bo'lsa qizil, 3 kun qolgan bo'lsa sariq */
export default function DueDate({ order }: { order: Pick<OrderListItem, 'due_date' | 'is_overdue' | 'status'> }) {
  if (!order.due_date) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }
  const date = new Date(`${order.due_date}T00:00:00`);
  const label = formatDate(date);
  if (order.is_overdue) {
    const days = Math.max(1, Math.floor((Date.now() - date.getTime()) / DAY));
    return <Chip size="small" color="error" label={tr("{0} · {1} kun kechikdi", label, days)} />;
  }
  const open = !['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.status);
  const left = Math.ceil((date.getTime() - Date.now()) / DAY);
  if (open && left <= 3) {
    return <Chip size="small" color="warning" variant="outlined" label={`${label} · ${left <= 0 ? 'bugun' : tr("{0} kun qoldi", left)}`} />;
  }
  return <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{label}</Typography>;
}

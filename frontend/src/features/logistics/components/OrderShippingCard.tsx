import { useCallback, useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, LinearProgress, Typography } from '@mui/material';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import { useNavigate } from 'react-router-dom';
import { logisticsApi } from '../api';
import { variantLabel } from '../constants';
import { useLogisticsPermissions } from '../permissions';
import type { OrderShipping } from '../types';
import ShipmentFormDialog from './ShipmentFormDialog';
import ShipmentStatusChip from './ShipmentStatusChip';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

const NO_SHIP = ['PENDING_PAYMENT', 'CANCELLED', 'COMPLETED'];

export default function OrderShippingCard({ order, onChanged }: { order: { id: number; status: string }; onChanged?: () => void }) {
  const navigate = useNavigate();
  const { canView, canEdit } = useLogisticsPermissions();
  const [data, setData] = useState<OrderShipping | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    if (canView) logisticsApi.orderShipping(order.id).then(setData).catch(() => setData(null));
  }, [order.id, canView]);
  useEffect(load, [load, order.status]);

  if (!data) return null;
  const remaining = data.lines.reduce((s, l) => s + l.remaining, 0);
  const canCreate = canEdit && remaining > 0 && !NO_SHIP.includes(order.status);
  if (data.shipments.length === 0 && !canCreate) return null;
  const ordered = data.lines.reduce((s, l) => s + l.ordered, 0);
  const shipped = data.lines.reduce((s, l) => s + l.shipped, 0);

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="h6">{tr("Jo'natish")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("Jo'natilgan:")}{' '}{shipped} / {ordered} {tr("dona")}
            </Typography>
          </Box>
          {canCreate && (
            <Button variant="contained" startIcon={<LocalShippingOutlinedIcon />} onClick={() => setOpen(true)}>
              {tr("Jo'natma tayyorlash")}
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: data.shipments.length ? 2 : 0 }}>
          {data.lines.map((l) => {
            const variant = variantLabel(l.size, l.color);
            return (
              <Box key={l.order_item_id}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {l.product_name}
                    {variant ? ` (${variant})` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                    {l.shipped} / {l.ordered}
                  </Typography>
                </Box>
                <LinearProgress variant="determinate" value={Math.min((l.shipped / l.ordered) * 100, 100)} color={l.shipped >= l.ordered ? 'success' : 'primary'} sx={{ height: 6, borderRadius: 3 }} />
                <Typography variant="caption" color={l.remaining > 0 && l.in_stock < l.remaining ? 'warning.main' : 'text.secondary'}>
                  {tr("Omborda")}{' '}{l.in_stock}
                  {l.preparing ? tr(" · tayyorlanmoqda {0}", l.preparing) : ''}
                </Typography>
              </Box>
            );
          })}
        </Box>
        {data.shipments.map((s) => (
          <Box
            key={s.id}
            onClick={() => navigate(`/shipments/${s.id}`)}
            sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', py: 1.25, borderTop: 1, borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{s.number}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 160 }}>
              {s.total_quantity} {tr("dona")}
              {s.vehicle_no ? ` · ${s.vehicle_no}` : ''}
              {s.shipped_at ? ` · ${formatDate(s.shipped_at)}` : s.planned_date ? tr(" · reja {0}", formatDate(s.planned_date)) : ''}
            </Typography>
            <ShipmentStatusChip sh={s} />
          </Box>
        ))}
      </CardContent>
      <ShipmentFormDialog
        open={open}
        orderId={order.id}
        onClose={() => setOpen(false)}
        onSaved={(sh) => {
          setOpen(false);
          load();
          onChanged?.();
          navigate(`/shipments/${sh.id}`);
        }}
      />
    </Card>
  );
}

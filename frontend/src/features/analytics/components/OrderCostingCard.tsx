import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Collapse, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Link as RouterLink } from 'react-router-dom';
import { formatQty } from '@/features/inventory/constants';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import type { MaterialUnit } from '@/features/products/types';
import { formatMoney } from '@/shared/utils/money';
import { analyticsApi } from '../api';
import { useCanSeeFinance } from '../permissions';
import type { OrderCosting } from '../types';
import { tr } from '@/i18n';

const PAY_TYPE: Record<string, string> = { PIECE: tr('ishbay'), HOURLY: tr('soatbay'), MONTHLY: tr('oylik') };

/** Buyurtma sahifasida: tannarx (material + ish haqi + ustama), reja bilan solishtirish va foyda. Faqat moliya rollari */
export default function OrderCostingCard({ order }: { order: { id: number; status: string } }) {
  const canSee = useCanSeeFinance();
  const [data, setData] = useState<OrderCosting | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (canSee) analyticsApi.orderCosting(order.id).then(setData).catch(() => setData(null));
  }, [canSee, order.id, order.status]);

  if (!canSee || !data) return null;
  const cur = data.currency;
  const parts: [string, number, string][] = [
    [tr("Material"), data.material_actual, 'primary.main'],
    [tr("Ish haqi"), data.labor, 'info.main'],
    [tr("Ustama ({0}%)", data.overhead_percent), data.overhead, 'warning.main'],
  ];
  const variance = data.material_planned ? ((data.material_actual - data.material_planned) / data.material_planned) * 100 : null;

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="h6">{tr("Tannarx va foyda")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("Chiqarilgan material, ishlab chiqarish yozuvlari bo'yicha ish haqi va ustama xarajatlar")}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }} color={data.margin < 0 ? 'error.main' : data.low_margin ? 'warning.main' : 'success.main'}>
              {formatMoney(data.margin, cur)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("foyda")}{data.margin_pct != null ? ` · ${data.margin_pct}%` : ''}
              {data.low_margin && <Chip size="small" color="warning" label={tr("Past")} sx={{ ml: 1 }} />}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, mb: 2 }}>
          {[
            [tr("Buyurtma summasi"), formatMoney(data.revenue, cur)],
            [tr("Jami tannarx"), formatMoney(data.total_cost, cur)],
            [tr("1 dona tannarxi"), data.cost_per_unit != null ? formatMoney(data.cost_per_unit, cur) : '—'],
            [tr("Qadoqlangan"), `${data.produced_qty} / ${data.ordered_qty}`],
            [
              tr("Material: reja → fakt"),
              `${formatMoney(data.material_planned, cur)} → ${formatMoney(data.material_actual, cur)}${variance != null ? ` (${variance > 0 ? '+' : ''}${variance.toFixed(1)}%)` : ''}`,
            ],
          ].map(([label, value]) => (
            <Box key={label}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography sx={{ fontWeight: 600 }}>{value}</Typography>
            </Box>
          ))}
        </Box>

        {data.total_cost > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover' }}>
              {parts.map(([label, v, c]) => (
                <Box key={label} title={`${label}: ${formatMoney(v, cur)}`} sx={{ width: `${(v / data.total_cost) * 100}%`, bgcolor: c }} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 1 }}>
              {parts.map(([label, v, c]) => (
                <Typography key={label} variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c, display: 'inline-block' }} />
                  {label}: {formatMoney(v, cur)}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {data.warnings.map((w) => (
          <Alert key={w} severity="info" sx={{ mb: 1, py: 0 }}>
            {w}
          </Alert>
        ))}

        {(data.materials.length > 0 || data.labor_lines.length > 0) && (
          <Button size="small" onClick={() => setOpen((v) => !v)} endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}>
            {tr("Batafsil")}
          </Button>
        )}
        <Collapse in={open}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mt: 1, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Material")}</TableCell>
                  <TableCell align="right">{tr("Miqdor")}</TableCell>
                  <TableCell align="right">{tr("Qiymat")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.materials.map((m) => (
                  <TableRow key={m.material_id}>
                    <TableCell>
                      <Link component={RouterLink} to={`/inventory/materials/${m.material_id}`}>
                        {m.code}
                      </Link>{' '}
                      {m.name}
                    </TableCell>
                    <TableCell align="right">
                      {formatQty(m.quantity)} {MATERIAL_UNIT_LABELS[m.unit as MaterialUnit] ?? m.unit}
                    </TableCell>
                    <TableCell align="right">{m.unpriced ? tr("narx yo'q") : formatMoney(m.cost, cur)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Xodim")}</TableCell>
                  <TableCell align="right">{tr("Dona / vaqt")}</TableCell>
                  <TableCell align="right">{tr("Ish haqi")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.labor_lines.map((l) => (
                  <TableRow key={l.employee_id ?? 'none'}>
                    <TableCell>
                      {l.name}
                      {l.pay_type && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {PAY_TYPE[l.pay_type] ?? l.pay_type}
                          {l.unpriced_logs ? tr(" · {0} yozuv hisobga kirmagan", l.unpriced_logs) : ''}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {l.good} {tr("dona")}{l.minutes ? tr(" · {0} soat", Math.round((l.minutes / 60) * 10) / 10) : ''}
                    </TableCell>
                    <TableCell align="right">{formatMoney(l.cost, cur)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

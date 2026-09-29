import type { ReactNode } from 'react';
import { Box, ButtonBase, Card, CardContent, Chip, Typography, alpha } from '@mui/material';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AllInboxOutlinedIcon from '@mui/icons-material/AllInboxOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import CallMadeRoundedIcon from '@mui/icons-material/CallMadeRounded';
import { useNavigate } from 'react-router-dom';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/features/orders/constants';
import type { OrderStatus } from '@/features/orders/types';
import StatCard from '@/shared/components/StatCard';
import { formatMoneyShort } from '@/shared/utils/money';
import type { Overview } from '../types';
import BarChart from './BarChart';
import { tr } from '@/i18n';

function Tile({ to, onClick, children }: { to?: string; onClick?: () => void; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <ButtonBase
      onClick={onClick ?? (() => to && navigate(to))}
      sx={{ display: 'block', minWidth: 0, width: '100%', textAlign: 'left', borderRadius: '18px', '& > *': { height: '100%' } }}
    >
      {children}
    </ButtonBase>
  );
}

export const TILE_GRID = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(4, 1fr)' },
  '@media (min-width: 1900px)': { gridTemplateColumns: 'repeat(6, 1fr)' },
  gap: { xs: 1.5, sm: 2 },
} as const;

export default function ManagementOverview({ data, onRevenueClick }: { data: Overview; onRevenueClick?: () => void }) {
  const { sales, production, inventory, finished_goods: fg, procurement, resources } = data;
  const out7 = production?.summary.output_7d ?? [];
  const good7 = out7.reduce((s, x) => s + x.good, 0);
  const bad7 = out7.reduce((s, x) => s + x.defect, 0);
  const defect7 = good7 + bad7 ? Math.round((bad7 / (good7 + bad7)) * 1000) / 10 : null;
  const packedToday = production?.summary.output_today.find((x) => x.stage === 'PACKING')?.good ?? 0;

  const tiles: ReactNode[] = [];
  if (sales) {
    tiles.push(
      <Tile key="open" to="/orders"><StatCard label={tr("Faol buyurtmalar")} value={sales.open_orders} icon={<ReceiptLongOutlinedIcon />} hint={tr("7 kunda topshiriladi: {0}", sales.due_7d)} /></Tile>,
      <Tile key="overdue" to="/orders"><StatCard label={tr("Kechikayotgan buyurtmalar")} value={sales.overdue} icon={<AlarmOutlinedIcon />} color={sales.overdue ? 'error.main' : 'grey.500'} hint={sales.overdue ? tr("Muddati o'tgan") : tr("Hammasi o'z vaqtida")} /></Tile>,
      <Tile key="rev" onClick={onRevenueClick} to="/orders"><StatCard label={tr("Tushum 30 kun, so'm")} value={formatMoneyShort(sales.revenue_30d, 'UZS', false)} icon={<PaymentsOutlinedIcon />} color="success.main" hint={tr("{0} ta to'lov · batafsil", sales.orders_30d)} /></Tile>,
    );
  }
  if (production) {
    tiles.push(
      <Tile key="wo" to="/production"><StatCard label={tr("Faol ish buyurtmalari")} value={production.summary.work_orders_active} icon={<AssignmentOutlinedIcon />} hint={tr("Kechikayotgan: {0}", production.summary.work_orders_late)} /></Tile>,
      <Tile key="packed" to="/production"><StatCard label={tr("Bugun qadoqlandi")} value={tr("{0} dona", packedToday)} icon={<EventOutlinedIcon />} color="info.main" hint={tr("30 kunda tugallangan: {0}", production.summary.completed_30d)} /></Tile>,
      <Tile key="defect" to="/production/kpi"><StatCard label={tr("Brak (7 kun)")} value={defect7 != null ? `${defect7}%` : '0%'} icon={<ReportProblemOutlinedIcon />} color="warning.main" hint={defect7 != null ? tr("{0} dona brak", bad7) : tr("Ishlab chiqarish qayd etilmagan")} /></Tile>,
    );
  }
  if (inventory) {
    tiles.push(
      <Tile key="inv" to="/inventory/materials"><StatCard label={tr("Ombor qiymati, so'm")} value={formatMoneyShort(inventory.stock_value, 'UZS', false)} icon={<Inventory2OutlinedIcon />} color="secondary.main" hint={tr("Kam qolgan: {0} · tugagan: {1}", inventory.low_stock_count, inventory.out_of_stock_count)} /></Tile>,
    );
  }
  if (fg) {
    tiles.push(
      <Tile key="fg" to="/finished-goods"><StatCard label={tr("Tayyor mahsulot")} value={tr("{0} dona", fg.units)} icon={<AllInboxOutlinedIcon />} hint={tr("Yo'lda: {0} · kechikkan: {1}", fg.shipments_in_transit, fg.shipments_late)} /></Tile>,
    );
  }
  if (procurement) {
    tiles.push(
      <Tile key="po" to="/purchases"><StatCard label={tr("Kutilayotgan xaridlar")} value={procurement.open_orders} icon={<ShoppingCartOutlinedIcon />} color={procurement.overdue_orders ? 'warning.main' : 'primary.main'} hint={tr("Kechikkan: {0} · {1}", procurement.overdue_orders, formatMoneyShort(procurement.open_value))} /></Tile>,
    );
  }
  if (resources) {
    const broken = resources.machines_by_status.BROKEN ?? 0;
    tiles.push(
      <Tile key="mach" to="/machines"><StatCard label={tr("Mashinalar tayyorligi (30 kun)")} value={`${resources.availability_pct_30d}%`} icon={<PrecisionManufacturingOutlinedIcon />} color={broken ? 'error.main' : 'success.main'} hint={tr("Buzilgan: {0} · to'xtash {1} soat", broken, resources.downtime_hours_30d)} /></Tile>,
      <Tile key="maint" to="/machines"><StatCard label={tr("Texnik xizmat")} value={resources.maintenance_overdue} icon={<BuildOutlinedIcon />} color={resources.maintenance_overdue ? 'warning.main' : 'grey.500'} hint={tr("Muddati o'tgan · yaqinlashgan: {0}", resources.maintenance_due_soon)} /></Tile>,
    );
  }
  if (data.material_issued_30d !== null) {
    tiles.push(
      <Tile key="mat" to="/inventory/movements"><StatCard label={tr("Material sarfi (30 kun)")} value={formatMoneyShort(data.material_issued_30d, 'UZS', false)} icon={<CallMadeRoundedIcon />} color="secondary.main" hint={tr("Buyurtmalarga chiqarilgan, so'm")} /></Tile>,
    );
  }
  if (!tiles.length) return null;
  return <Box sx={{ ...TILE_GRID, mb: { xs: 2, sm: 2.5 } }}>{tiles}</Box>;
}

function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="h6">{title}</Typography>
        {subtitle && <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Box>
  );
}

const shortDay = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function PackedCard({ data }: { data: NonNullable<Overview['production']> }) {
  const total = data.packed_by_day.reduce((s, d) => s + d.value, 0);
  const defects = data.packed_by_day.reduce((s, d) => s + d.extra, 0);
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <SectionTitle
          title={tr("Qadoqlangan mahsulot")}
          subtitle={tr("Oxirgi 14 kun · jami {0} dona{1}", total, defects ? tr(", brak {0}", defects) : '')}
          action={<Chip size="small" color="error" variant="outlined" label={tr("qizil — brak")} />}
        />
        <BarChart
          data={data.packed_by_day.map((d, i, a) => ({ key: d.day, label: shortDay(d.day), fullLabel: shortDay(d.day), value: d.value, extra: d.extra, current: i === a.length - 1 }))}
          height={200}
          color="info"
          extraLabel="brak"
          format={(v) => tr("{0} dona", v)}
          emptyText={tr("Oxirgi 14 kunda qadoqlash qayd etilmagan")}
          compact
        />
      </CardContent>
    </Card>
  );
}

export function OrdersStatusCard({ sales }: { sales: NonNullable<Overview['sales']> }) {
  const navigate = useNavigate();
  const statuses = (Object.keys(sales.by_status) as OrderStatus[]).filter((s) => sales.by_status[s]);
  const total = statuses.reduce((a, s) => a + sales.by_status[s], 0);
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <SectionTitle title={tr("Buyurtmalar holati")} subtitle={tr("Jami {0} ta buyurtma", total)} />
        {statuses.map((s) => {
          const color = ORDER_STATUS_COLORS[s] === 'default' ? 'grey.500' : `${ORDER_STATUS_COLORS[s]}.main`;
          return (
            <ButtonBase key={s} onClick={() => navigate('/orders')} sx={{ display: 'block', width: '100%', textAlign: 'left', mb: 1.5, borderRadius: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {ORDER_STATUS_LABELS[s]}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 800 }}>
                  {sales.by_status[s]}
                  <Typography component="span" sx={{ color: 'text.secondary', fontSize: 12, fontWeight: 600, ml: 0.75 }}>
                    {Math.round((sales.by_status[s] / total) * 100)}%
                  </Typography>
                </Typography>
              </Box>
              <Box sx={(t) => ({ height: 8, borderRadius: 4, bgcolor: alpha(t.palette.text.primary, 0.07), overflow: 'hidden' })}>
                <Box sx={{ height: '100%', width: `${(sales.by_status[s] / total) * 100}%`, bgcolor: color, borderRadius: 4 }} />
              </Box>
            </ButtonBase>
          );
        })}
        {total === 0 && <Typography color="text.secondary">{tr("Buyurtmalar yo'q")}</Typography>}
      </CardContent>
    </Card>
  );
}

export function DefectsCard({ data }: { data: NonNullable<Overview['production']> }) {
  const max = Math.max(1, ...data.top_defects.map((d) => d.quantity));
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <SectionTitle title={tr("Asosiy brak sabablari")} subtitle={tr("Oxirgi 30 kun")} />
        {data.top_defects.map((d) => (
          <Box key={d.reason} sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {d.reason}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                {d.quantity} {tr("dona")}
              </Typography>
            </Box>
            <Box sx={(t) => ({ height: 8, borderRadius: 4, bgcolor: alpha(t.palette.text.primary, 0.07), overflow: 'hidden' })}>
              <Box sx={{ height: '100%', width: `${(d.quantity / max) * 100}%`, bgcolor: 'error.main', borderRadius: 4 }} />
            </Box>
          </Box>
        ))}
        {data.top_defects.length === 0 && (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 700 }}>{tr("Brak qayd etilmagan")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("Oxirgi 30 kunda sifat bo'yicha muammo yo'q")}
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

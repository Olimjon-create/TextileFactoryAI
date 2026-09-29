import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, Link, Skeleton, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import AllInboxOutlinedIcon from '@mui/icons-material/AllInboxOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import WarehouseOutlinedIcon from '@mui/icons-material/WarehouseOutlined';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import FgMovementDialog from '@/features/logistics/components/FgMovementDialog';
import { logisticsApi } from '@/features/logistics/api';
import { FG_MOVEMENT_COLORS, FG_MOVEMENT_LABELS, variantLabel } from '@/features/logistics/constants';
import type { FgMovement, FgSummary, StockRow } from '@/features/logistics/types';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { productsApi } from '@/features/products/api';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { formatMoney } from '@/shared/utils/money';
import { inventoryApi } from '../api';
import MovementFormDialog from '../components/MovementFormDialog';
import { formatQty, formatSignedQty, MOVEMENT_TYPE_COLORS, MOVEMENT_TYPE_LABELS } from '../constants';
import { useCanEditInventory } from '../permissions';
import type { InventorySummary, Material, Movement } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

type ChipColor = 'success' | 'warning' | 'info' | 'error' | 'default' | 'secondary';

interface FeedItem {
  key: string;
  at: string;
  kind: 'Material' | 'Mahsulot';
  label: string;
  color: ChipColor;
  title: string;
  where: string;
  qty: string;
  positive: boolean;
}

function fromMaterial(m: Movement): FeedItem {
  return {
    key: `m${m.id}`,
    at: m.created_at,
    kind: 'Material',
    label: MOVEMENT_TYPE_LABELS[m.movement_type],
    color: MOVEMENT_TYPE_COLORS[m.movement_type],
    title: `${m.material.code} — ${m.material.name}`,
    where: [m.location.code, m.created_by_name].filter(Boolean).join(' · '),
    qty: `${formatSignedQty(m.quantity)} ${MATERIAL_UNIT_LABELS[m.material_unit]}`,
    positive: m.quantity > 0,
  };
}

function fromProduct(m: FgMovement): FeedItem {
  const variant = variantLabel(m.size, m.color);
  return {
    key: `p${m.id}`,
    at: m.created_at,
    kind: 'Mahsulot',
    label: FG_MOVEMENT_LABELS[m.movement_type],
    color: FG_MOVEMENT_COLORS[m.movement_type],
    title: `${m.product.name}${variant ? ` (${variant})` : ''}`,
    where: [m.location.code, m.created_by_name].filter(Boolean).join(' · '),
    qty: tr("{0}{1} dona", m.quantity > 0 ? '+' : '−', Math.abs(m.quantity)),
    positive: m.quantity > 0,
  };
}

interface Data {
  inv: InventorySummary;
  fg: FgSummary;
  lowMaterials: Material[];
  topStock: StockRow[];
  feed: FeedItem[];
  productsCount: number;
}

export default function WarehouseOverviewPage() {
  const navigate = useNavigate();
  const canEdit = useCanEditInventory();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'material' | 'product' | null>(null);

  const load = useCallback(async () => {
    try {
      const [inv, fg, low, out, stock, mMoves, pMoves, products] = await Promise.all([
        inventoryApi.summary(),
        logisticsApi.summary(),
        inventoryApi.materials({ stock_state: 'low', is_active: true, limit: 6 }),
        inventoryApi.materials({ stock_state: 'out', is_active: true, limit: 6 }),
        logisticsApi.stock({ limit: 6 }),
        inventoryApi.movements({ limit: 8 }),
        logisticsApi.movements({ limit: 8 }),
        productsApi.list(),
      ]);
      const feed = [...mMoves.items.map(fromMaterial), ...pMoves.items.map(fromProduct)]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 8);
      setData({ inv, fg, lowMaterials: [...out.items, ...low.items].slice(0, 6), topStock: stock.items, feed, productsCount: products.length });
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saved = () => {
    setDialog(null);
    load();
  };

  const inv = data?.inv;
  const fg = data?.fg;
  const needsAttention = inv ? inv.low_stock_count + inv.out_of_stock_count : 0;
  const steps = data && [
    { done: data.inv.locations_count > 0, title: tr("Ombor joyini qo'shing"), text: tr("Masalan: «A-1 Mato ombori», «TM-1 Tayyor mahsulot»"), to: '/inventory/locations' },
    { done: data.inv.materials_count > 0, title: tr("Materiallar katalogini to'ldiring"), text: tr("Mato, ip, tugma, aksessuarlar — minimal qoldiq bilan"), to: '/inventory/materials' },
    { done: data.productsCount > 0, title: tr("Mahsulotlarni qo'shing"), text: tr("Sotiladigan modellar, o'lcham va ranglari bilan"), to: '/products' },
    { done: data.inv.receipts_30d > 0 || data.fg.units > 0, title: tr("Birinchi kirimni kiriting"), text: tr("Materialni yoki tayyor mahsulotni omborga qabul qiling"), to: '' },
  ];
  const setupDone = !steps || steps.every((s) => s.done);

  return (
    <>
      <PageHeader
        title={tr("Ombor")}
        subtitle={tr("Materiallar va tayyor mahsulot: qoldiq, qiymat, ogohlantirishlar va oxirgi harakatlar")}
        action={
          canEdit && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setDialog('material')}>
                {tr("Material kirimi")}
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog('product')}>
                {tr("Mahsulot kirimi")}
              </Button>
            </Box>
          )
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {steps && !setupDone && (
        <Card sx={{ mb: 2.5 }}>
          <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Typography variant="h6">{tr("Omborni ishga tushirish")}</Typography>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', mb: 1.5 }}>
              {steps.filter((s) => s.done).length} / {steps.length} {tr("qadam bajarildi")}
            </Typography>
            <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' } }}>
              {steps.map((s, i) => (
                <Box
                  key={s.title}
                  onClick={() => (s.to ? navigate(s.to) : canEdit && setDialog('material'))}
                  sx={{
                    p: 1.5,
                    borderRadius: '12px',
                    border: 1,
                    borderColor: s.done ? 'success.main' : 'divider',
                    cursor: 'pointer',
                    opacity: s.done ? 0.75 : 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    {s.done ? <CheckCircleRoundedIcon color="success" fontSize="small" /> : <RadioButtonUncheckedRoundedIcon color="disabled" fontSize="small" />}
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                      {i + 1}. {s.title}
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {s.text}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2.5 }}>
        <StatCard
          label={tr("Materiallar qiymati")}
          value={inv ? formatMoney(inv.stock_value) : '—'}
          icon={<Inventory2OutlinedIcon />}
          hint={inv ? tr("{0} ta material", inv.materials_count) : undefined}
        />
        <StatCard
          label={tr("Tayyor mahsulot")}
          value={fg ? tr("{0} dona", fg.units) : '—'}
          icon={<AllInboxOutlinedIcon />}
          color="success.main"
          hint={fg ? tr("{0} · {1} variant", formatMoney(fg.value), fg.skus) : undefined}
        />
        <StatCard
          label={tr("E'tibor talab qiladi")}
          value={inv ? needsAttention : '—'}
          icon={<WarningAmberRoundedIcon />}
          color={needsAttention ? 'error.main' : 'text.secondary'}
          hint={inv ? tr("Kam qolgan: {0} · tugagan: {1}", inv.low_stock_count, inv.out_of_stock_count) : undefined}
        />
        <StatCard
          label={tr("Ombor joylari")}
          value={inv?.locations_count ?? '—'}
          icon={<WarehouseOutlinedIcon />}
          color="info.main"
          hint={inv ? tr("Bugun {0} ta harakat", inv.movements_today) : undefined}
        />
      </Box>

      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, mb: 2.5 }}>
        <Panel title={tr("Kam qolgan materiallar")} subtitle={tr("Minimal qoldiqdan past yoki tugagan")} to="/inventory/materials">
          {!data ? (
            <RowsSkeleton />
          ) : data.lowMaterials.length === 0 ? (
            <Empty>{tr("Hamma materiallar yetarli — kam qolgani yo'q")}</Empty>
          ) : (
            data.lowMaterials.map((m) => (
              <Row
                key={m.id}
                to={`/inventory/materials/${m.id}`}
                title={`${m.code} — ${m.name}`}
                subtitle={tr("Minimal: {0} {1}", formatQty(m.min_stock), MATERIAL_UNIT_LABELS[m.unit])}
                trailing={
                  <Chip
                    size="small"
                    color={m.stock <= 0 ? 'error' : 'warning'}
                    label={m.stock <= 0 ? tr("Tugagan") : `${formatQty(m.stock)} ${MATERIAL_UNIT_LABELS[m.unit]}`}
                  />
                }
              />
            ))
          )}
        </Panel>

        <Panel title={tr("Tayyor mahsulot qoldig'i")} subtitle={fg ? tr("30 kunda: {0} dona kirim · {1} dona jo'natildi", fg.received_30d, fg.shipped_30d) : ' '} to="/finished-goods">
          {!data ? (
            <RowsSkeleton />
          ) : data.topStock.length === 0 ? (
            <Empty>
              {tr("Omborda tayyor mahsulot yo'q.")}{' '}
              {canEdit && (
                <Link component="button" onClick={() => setDialog('product')} sx={{ verticalAlign: 'baseline' }}>
                  {tr("Mahsulot kirimi")}
                </Link>
              )}
            </Empty>
          ) : (
            data.topStock.map((r) => (
              <Row
                key={`${r.product.id}-${r.size}-${r.color}`}
                to={`/products/${r.product.id}`}
                title={`${r.product.name}${variantLabel(r.size, r.color) ? ` (${variantLabel(r.size, r.color)})` : ''}`}
                subtitle={r.locations.map((l) => `${l.location.code}: ${l.quantity}`).join(' · ')}
                trailing={<Typography sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{r.quantity} {tr("dona")}</Typography>}
              />
            ))
          )}
        </Panel>
      </Box>

      <Panel title={tr("Oxirgi harakatlar")} subtitle={tr("Kirim, chiqim, ko'chirish va inventarizatsiya")} to="/inventory/movements">
        {!data ? (
          <RowsSkeleton />
        ) : data.feed.length === 0 ? (
          <Empty>{tr("Hali harakat yo'q")}</Empty>
        ) : (
          data.feed.map((f) => (
            <Row
              key={f.key}
              title={f.title}
              subtitle={`${formatDateTime(f.at)} · ${f.where}`}
              leading={
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', width: { xs: '100%', sm: 210 }, flexShrink: 0 }}>
                  <Chip size="small" variant="outlined" label={f.kind} />
                  <Chip size="small" variant="outlined" color={f.color} label={f.label} />
                </Box>
              }
              trailing={<Typography sx={{ fontWeight: 800, whiteSpace: 'nowrap', color: f.positive ? 'success.main' : 'error.main' }}>{f.qty}</Typography>}
            />
          ))
        )}
      </Panel>

      <MovementFormDialog open={dialog === 'material'} initialType="RECEIPT" onClose={() => setDialog(null)} onSaved={saved} />
      <FgMovementDialog open={dialog === 'product'} initialKind="RECEIPT" onClose={() => setDialog(null)} onSaved={saved} />
    </>
  );
}

function Panel({ title, subtitle, to, children }: { title: string; subtitle: string; to: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6">{title}</Typography>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>{subtitle}</Typography>
          </Box>
          <Button component={RouterLink} to={to} endIcon={<ArrowForwardRoundedIcon />} sx={{ flexShrink: 0 }}>
            {tr("Barchasi")}
          </Button>
        </Box>
        {children}
      </CardContent>
    </Card>
  );
}

function Row({ title, subtitle, trailing, leading, to }: { title: string; subtitle: string; trailing: ReactNode; leading?: ReactNode; to?: string }) {
  return (
    <Box
      {...(to ? { component: RouterLink, to } : {})}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1,
        px: 0.5,
        borderTop: 1,
        borderColor: 'divider',
        color: 'inherit',
        textDecoration: 'none',
        flexWrap: { xs: leading ? 'wrap' : 'nowrap', sm: 'nowrap' },
        '&:hover': to ? { bgcolor: 'action.hover' } : undefined,
      }}
    >
      {leading}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap component="div">
          {subtitle}
        </Typography>
      </Box>
      {trailing}
    </Box>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center', borderTop: 1, borderColor: 'divider' }}>
      {children}
    </Typography>
  );
}

function RowsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <Box key={i} sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}>
          <Skeleton width="55%" />
          <Skeleton width="35%" />
        </Box>
      ))}
    </>
  );
}

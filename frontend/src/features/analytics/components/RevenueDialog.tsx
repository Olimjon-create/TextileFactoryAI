import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import { getErrorMessage } from '@/shared/api/client';
import { formatMoney, formatMoneyShort } from '@/shared/utils/money';
import { analyticsApi } from '../api';
import type { RevenuePeriod, RevenueStats } from '../types';
import BarChart from './BarChart';
import { tr } from '@/i18n';

export const PERIOD_LABELS: Record<RevenuePeriod, { tab: string; range: string; unit: string; prev: string }> = {
  day: { tab: tr("Kunlik"), range: tr("oxirgi 30 kun"), unit: 'Kun', prev: tr("oldingi 30 kunga nisbatan") },
  week: { tab: tr("Haftalik"), range: tr("oxirgi 12 hafta"), unit: 'Hafta', prev: tr("oldingi 12 haftaga nisbatan") },
  month: { tab: tr("Oylik"), range: tr("oxirgi 12 oy"), unit: 'Oy', prev: tr("oldingi 12 oyga nisbatan") },
  year: { tab: tr("Yillik"), range: tr("oxirgi 5 yil"), unit: 'Yil', prev: tr("oldingi 5 yilga nisbatan") },
};

export function ChangeBadge({ pct, size = 'md' }: { pct: number | null; size?: 'sm' | 'md' }) {
  if (pct === null) return null;
  const up = pct >= 0;
  const Icon = up ? TrendingUpRoundedIcon : TrendingDownRoundedIcon;
  return (
    <Box
      sx={(t) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.4,
        px: 0.9,
        py: 0.2,
        borderRadius: 999,
        fontSize: size === 'sm' ? 12 : 13,
        fontWeight: 800,
        color: up ? 'success.main' : 'error.main',
        bgcolor: alpha(up ? t.palette.success.main : t.palette.error.main, 0.12),
      })}
    >
      <Icon sx={{ fontSize: size === 'sm' ? 15 : 17 }} />
      {up ? '+' : ''}
      {pct}%
    </Box>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Box sx={{ flex: '1 1 170px', p: 2, borderRadius: '16px', bgcolor: 'action.hover', minWidth: 0 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</Typography>
      <Typography sx={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', mt: 0.5, wordBreak: 'break-word' }}>{value}</Typography>
      {hint && <Box sx={{ mt: 0.5, fontSize: 12.5, color: 'text.secondary', fontWeight: 600 }}>{hint}</Box>}
    </Box>
  );
}

interface Props {
  open: boolean;
  initialPeriod?: RevenuePeriod;
  onClose: () => void;
}

/** Fabrika tushumi: kunlik / haftalik / oylik / yillik diagramma, jami ko'rsatkichlar va davrlar jadvali */
export default function RevenueDialog({ open, initialPeriod = 'day', onClose }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [period, setPeriod] = useState<RevenuePeriod>(initialPeriod);
  const [data, setData] = useState<RevenueStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) setPeriod(initialPeriod);
  }, [open, initialPeriod]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setData(null);
    analyticsApi
      .revenue(period)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError('');
      })
      .catch((e) => alive && setError(getErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [open, period]);

  const p = PERIOD_LABELS[period];
  const maxRevenue = Math.max(1, ...(data?.buckets.map((b) => b.revenue) ?? [0]));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth fullScreen={fullScreen} scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, pb: 1 }}>
        <Box sx={{ flex: 1 }}>
          {tr("Fabrika tushumi")}
          <Typography color="text.secondary" sx={{ fontSize: 14, fontWeight: 500, mt: 0.5 }}>
            {tr("To'langan buyurtmalar bo'yicha ·")}{' '}{p.range}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label={tr("Yopish")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <Box sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={period} onChange={(_, v) => setPeriod(v)} variant="scrollable" allowScrollButtonsMobile>
          {(Object.keys(PERIOD_LABELS) as RevenuePeriod[]).map((k) => (
            <Tab key={k} value={k} label={PERIOD_LABELS[k].tab} />
          ))}
        </Tabs>
      </Box>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}

        {/* Joriy davrlar — tab'dan qat'i nazar doim ko'rinadi */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.25, mb: 2.5 }}>
          {([
            [tr("Bugun"), data?.quick.today],
            [tr("Shu hafta"), data?.quick.week],
            [tr("Shu oy"), data?.quick.month],
            [tr("Shu yil"), data?.quick.year],
          ] as const).map(([label, v]) => (
            <Box key={label} sx={{ p: 1.5, borderRadius: '14px', border: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
              {data ? (
                <Typography sx={{ fontSize: 18, fontWeight: 800 }} title={formatMoney(v)}>
                  {formatMoneyShort(v ?? 0)}
                </Typography>
              ) : (
                <Skeleton width="70%" height={28} />
              )}
            </Box>
          ))}
        </Box>

        {data ? (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
              <Kpi
                label={tr("Jami ({0})", p.range)}
                value={formatMoneyShort(data.total)}
                hint={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <ChangeBadge pct={data.change_pct} size="sm" />
                    <span>{data.change_pct !== null ? p.prev : data.prev_total === 0 && data.total > 0 ? tr("oldingi davrda tushum bo'lmagan") : ''}</span>
                  </Box>
                }
              />
              <Kpi label={tr("To'lovlar soni")} value={data.orders} hint={tr("oldingi davrda: {0}", data.prev_orders)} />
              <Kpi label={tr("O'rtacha buyurtma")} value={formatMoneyShort(data.average_order)} />
              <Kpi
                label={tr("Eng yaxshi {0}", p.unit.toLowerCase())}
                value={data.best ? formatMoneyShort(data.best.revenue) : '—'}
                hint={data.best?.full_label}
              />
            </Box>

            <BarChart
              data={data.buckets.map((b) => ({
                key: b.start,
                label: b.label,
                fullLabel: b.full_label + (b.current ? ' (joriy)' : ''),
                value: b.revenue,
                current: b.current,
                note: tr("{0} ta to'lov", b.orders),
              }))}
              height={fullScreen ? 240 : 320}
              color="success"
              format={(v) => formatMoney(v)}
              axisFormat={(v) => formatMoneyShort(v, 'UZS', false)}
              emptyText={tr("{0} ichida to'lov bo'lmagan", p.range)}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {tr("Och rangli ustun — joriy")}{' '}{p.unit.toLowerCase()} {tr("(hali tugamagan). Ustun ustiga olib boring — aniq summa ko'rinadi.")}
            </Typography>

            <Box sx={{ display: 'grid', gap: 2.5, mt: 3, gridTemplateColumns: { xs: '1fr', md: data.by_factory.length ? '2fr 1fr' : '1fr' } }}>
              <TableContainer sx={{ border: 1, borderColor: 'divider', maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>{p.unit}</TableCell>
                      <TableCell align="right">{tr("To'lovlar")}</TableCell>
                      <TableCell align="right">{tr("Tushum")}</TableCell>
                      <TableCell sx={{ width: '30%', display: { xs: 'none', sm: 'table-cell' } }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...data.buckets].reverse().map((b) => (
                      <TableRow key={b.start} hover>
                        <TableCell sx={{ fontWeight: b.current ? 800 : 600, whiteSpace: 'nowrap' }}>
                          {b.full_label}
                          {b.current && (
                            <Typography component="span" sx={{ ml: 1, fontSize: 11, fontWeight: 800, color: 'primary.main' }}>
                              {tr("JORIY")}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ color: b.orders ? 'text.primary' : 'text.disabled' }}>
                          {b.orders}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: b.revenue ? 'text.primary' : 'text.disabled' }}>
                          {b.revenue ? formatMoney(b.revenue) : '—'}
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', width: `${(b.revenue / maxRevenue) * 100}%`, bgcolor: 'success.main', borderRadius: 4 }} />
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {data.by_factory.length > 0 && (
                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '16px', p: 2 }}>
                  <Typography sx={{ fontWeight: 800, mb: 1.5 }}>{tr("Fabrikalar bo'yicha")}</Typography>
                  {data.by_factory.map((f) => (
                    <Box key={f.factory_id} sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                        <Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
                          {f.name}
                        </Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>{formatMoneyShort(f.revenue)}</Typography>
                      </Box>
                      <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                        <Box sx={{ height: '100%', width: `${data.total ? (f.revenue / data.total) * 100 : 0}%`, bgcolor: 'primary.main' }} />
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        {f.orders} {tr("ta to'lov ·")}{' '}{data.total ? Math.round((f.revenue / data.total) * 100) : 0}%
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </>
        ) : (
          !error && (
            <>
              <Box sx={{ display: 'flex', gap: 1.5, mb: 3 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} variant="rounded" height={96} sx={{ flex: 1, borderRadius: '16px' }} />
                ))}
              </Box>
              <Skeleton variant="rounded" height={320} sx={{ borderRadius: '16px' }} />
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

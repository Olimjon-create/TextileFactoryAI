import { useEffect, useRef, useState } from 'react';
import { Box, Button, ButtonBase, Card, CardContent, Skeleton, Typography, alpha } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { analyticsApi } from '@/features/analytics/api';
import BarChart from '@/features/analytics/components/BarChart';
import RevenueDialog, { ChangeBadge } from '@/features/analytics/components/RevenueDialog';
import type { RevenuePeriod, RevenueStats } from '@/features/analytics/types';
import { formatMoney, formatMoneyShort } from '@/shared/utils/money';
import { tr } from '@/i18n';

const CHART_MIN_HEIGHT = 210;

const QUICK:{ key: keyof RevenueStats['quick']; label: string; period: RevenuePeriod }[] = [
  { key: 'today', label: tr("Bugun"), period: 'day' },
  { key: 'week', label: tr("Shu hafta"), period: 'week' },
  { key: 'month', label: tr("Shu oy"), period: 'month' },
  { key: 'year', label: tr("Shu yil"), period: 'year' },
];

export default function RevenueCard() {
  const [data, setData] = useState<RevenueStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<RevenuePeriod | null>(null);

  const chartBox = useRef<HTMLButtonElement>(null);
  const [chartHeight, setChartHeight] = useState(CHART_MIN_HEIGHT);

  useEffect(() => {
    analyticsApi.revenue('day').then(setData).catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    const el = chartBox.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setChartHeight(Math.max(CHART_MIN_HEIGHT, Math.floor(e.contentRect.height))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [failed]);

  if (failed) return null;
  const average = data && data.orders ? data.total / data.orders : 0;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } }, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 2 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6">{tr("Tushum")}</Typography>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>{tr("To'langan buyurtmalar bo'yicha")}</Typography>
          </Box>
          <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => setDialog('day')} sx={{ flexShrink: 0 }}>
            {tr("Batafsil")}
          </Button>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 0.9fr) 2fr' },
            gap: { xs: 1.5, md: 2.5 },
            alignItems: 'center',
            mb: 2,
          }}
        >
          <Box sx={{ pr: { md: 2.5 }, borderRight: { md: 1 }, borderColor: { md: 'divider' } }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {tr("Oxirgi 30 kun")}
            </Typography>
            {data ? (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', my: 0.25 }}>
                  <Typography sx={{ fontSize: { xs: 28, sm: 32 }, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15 }} title={formatMoney(data.total)}>
                    {formatMoneyShort(data.total)}
                  </Typography>
                  <ChangeBadge pct={data.change_pct} />
                </Box>
                <Typography sx={{ fontSize: 13, color: 'text.secondary', fontWeight: 600 }}>
                  {data.orders} {tr("ta to'lov")}{data.orders > 0 && tr(" · o'rtacha {0}", formatMoneyShort(average))}
                </Typography>
              </>
            ) : (
              <>
                <Skeleton width={180} height={44} />
                <Skeleton width={140} />
              </>
            )}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)', md: '1fr 1fr' }, gap: 1 }}>
            {QUICK.map((q) => (
              <ButtonBase
                key={q.key}
                onClick={() => setDialog(q.period)}
                sx={(t) => ({
                  display: 'block',
                  textAlign: 'left',
                  minWidth: 0,
                  p: 1.25,
                  borderRadius: '12px',
                  border: 1,
                  borderColor: 'divider',
                  transition: 'background-color .15s, border-color .15s',
                  '&:hover': { bgcolor: alpha(t.palette.success.main, 0.06), borderColor: alpha(t.palette.success.main, 0.4) },
                })}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>{q.label}</Typography>
                {data ? (
                  <Typography sx={{ fontSize: 16, fontWeight: 800 }} noWrap title={formatMoney(data.quick[q.key])}>
                    {formatMoneyShort(data.quick[q.key])}
                  </Typography>
                ) : (
                  <Skeleton width="60%" height={24} />
                )}
              </ButtonBase>
            ))}
          </Box>
        </Box>

        <ButtonBase
          ref={chartBox}
          onClick={() => setDialog('day')}
          sx={{ display: 'block', position: 'relative', width: '100%', borderRadius: '12px', flex: 1, minHeight: CHART_MIN_HEIGHT }}
          aria-label={tr("Tushumni batafsil ko'rish")}
        >
          <Box sx={{ position: 'absolute', inset: 0 }}>
            {data ? (
              <BarChart
                data={data.buckets.map((b) => ({
                  key: b.start,
                  label: b.label,
                  fullLabel: b.full_label + (b.current ? ' (bugun)' : ''),
                  value: b.revenue,
                  current: b.current,
                  note: tr("{0} ta to'lov", b.orders),
                }))}
                height={chartHeight}
                color="success"
                format={(v) => formatMoney(v)}
                axisFormat={(v) => formatMoneyShort(v, 'UZS', false)}
                emptyText={tr("Oxirgi 30 kunda to'lov bo'lmagan")}
                compact
              />
            ) : (
              <Skeleton variant="rounded" height={chartHeight} sx={{ borderRadius: '12px' }} />
            )}
          </Box>
        </ButtonBase>
      </CardContent>
      <RevenueDialog open={dialog !== null} initialPeriod={dialog ?? 'day'} onClose={() => setDialog(null)} />
    </Card>
  );
}

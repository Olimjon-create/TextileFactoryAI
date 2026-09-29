import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Typography, alpha, useTheme } from '@mui/material';
import { tr } from '@/i18n';

export interface BarDatum {
  key: string;
  label: string;
  fullLabel?: string;
  value: number;
  extra?: number;
  current?: boolean;
  note?: string;
}

interface Props {
  data: BarDatum[];
  height?: number;
  color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning';
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  extraLabel?: string;
  emptyText?: ReactNode;
  compact?: boolean;
}

function niceScale(v: number): { max: number; divisions: number } {
  if (v <= 0) return { max: 1, divisions: 4 };
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return { max: step * pow, divisions: step === 1 || step === 2 ? 4 : 5 };
}

export default function BarChart({
  data,
  height = 220,
  color = 'primary',
  format = (v) => String(v),
  axisFormat = (v) => String(v),
  extraLabel,
  emptyText = tr("Bu davrda ma'lumot yo'q"),
  compact = false,
}: Props) {
  const theme = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const main = theme.palette[color].main;
  const total = data.reduce((s, d) => s + d.value + (d.extra ?? 0), 0);
  const { max, divisions } = niceScale(Math.max(0, ...data.map((d) => d.value + (d.extra ?? 0))));
  const padL = compact ? 44 : 56;
  const padB = 26;
  const padT = 10;
  const chartW = Math.max(0, width - padL - 4);
  const chartH = height - padB - padT;
  const n = data.length || 1;
  const slot = chartW / n;
  const barW = Math.max(2, Math.min(slot * (compact ? 0.62 : 0.66), 56));
  const ticks = Array.from({ length: divisions + 1 }, (_, i) => i / divisions);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(chartW / (compact ? 44 : 52)))));
  const showLabel = (i: number) => i === n - 1 || (i % labelEvery === 0 && n - 1 - i >= labelEvery);
  const y = (v: number) => padT + chartH - (v / max) * chartH;
  const h = hover !== null ? data[hover] : null;

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%', height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - 4} y1={y(max * t)} y2={y(max * t)} stroke={theme.palette.divider} strokeDasharray={t === 0 ? undefined : '3 4'} />
              <text x={padL - 8} y={y(max * t) + 4} textAnchor="end" fontSize={11} fontWeight={600} fill={theme.palette.text.secondary}>
                {total ? axisFormat(max * t) : t === 0 ? '0' : ''}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = padL + slot * i + slot / 2;
            const v = d.value + (d.extra ?? 0);
            const top = y(v);
            const bh = v > 0 ? Math.max(padT + chartH - top, 3) : 0;
            const eh = d.extra ? (d.extra / max) * chartH : 0;
            const active = hover === i;
            const fill = d.current ? alpha(main, 0.55) : main;
            return (
              <g key={d.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} style={{ cursor: 'default' }}>
                <rect x={padL + slot * i} y={padT} width={slot} height={chartH} fill={active ? alpha(main, 0.07) : 'transparent'} rx={6} />
                {bh > 0 && (
                  <>
                    <rect x={cx - barW / 2} y={padT + chartH - bh} width={barW} height={Math.max(bh - eh, 0)} rx={Math.min(6, barW / 3, bh / 2.5)} fill={fill} opacity={hover === null || active ? 1 : 0.55} />
                    {eh > 0 && <rect x={cx - barW / 2} y={padT + chartH - eh} width={barW} height={eh} fill={theme.palette.error.main} opacity={0.9} />}
                  </>
                )}
                {showLabel(i) && (
                  <text
                    x={cx}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={d.current || active ? 800 : 600}
                    fill={d.current || active ? theme.palette.text.primary : theme.palette.text.secondary}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {total === 0 && width > 0 && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', pb: `${padB}px`, pl: `${padL}px` }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.secondary', bgcolor: 'background.paper', px: 1.5, py: 0.5, borderRadius: 2 }}>
            {emptyText}
          </Typography>
        </Box>
      )}
      {h && total > 0 && hover !== null && (
        <Box
          sx={{
            position: 'absolute',
            top: Math.max(0, y(h.value + (h.extra ?? 0)) - 64),
            left: Math.min(Math.max(padL + slot * hover + slot / 2, 90), width - 90),
            transform: 'translateX(-50%)',
            bgcolor: theme.palette.mode === 'light' ? '#1d1c19' : '#ece9e2',
            color: theme.palette.mode === 'light' ? '#fff' : '#111',
            px: 1.25,
            py: 0.75,
            borderRadius: 2,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            boxShadow: '0 8px 24px -8px rgba(0,0,0,0.35)',
            zIndex: 2,
          }}
        >
          <Typography sx={{ fontSize: 11.5, opacity: 0.75, fontWeight: 600 }}>{h.fullLabel ?? h.label}</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{format(h.value)}</Typography>
          {extraLabel && !!h.extra && (
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'error.light' }}>
              {extraLabel}: {format(h.extra)}
            </Typography>
          )}
          {h.note && <Typography sx={{ fontSize: 12, opacity: 0.8 }}>{h.note}</Typography>}
        </Box>
      )}
    </Box>
  );
}

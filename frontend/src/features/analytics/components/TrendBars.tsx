import { Box, Typography, useTheme } from '@mui/material';
import type { DayPoint } from '../types';

interface Props {
  points: DayPoint[];
  /** Asosiy ustun rangi (theme palette kaliti) */
  color?: 'primary' | 'success' | 'info' | 'warning';
  /** extra — ustun ustida qizil qism (masalan, brak) */
  extraLabel?: string;
  format?: (v: number) => string;
  height?: number;
}

const dayLabel = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Kunlik ko'rsatkichlar uchun ixcham ustunli diagramma (tashqi kutubxonasiz) */
export default function TrendBars({ points, color = 'primary', extraLabel, format = (v) => String(v), height = 140 }: Props) {
  const theme = useTheme();
  const max = Math.max(1, ...points.map((p) => p.value + p.extra));
  const n = points.length || 1;
  const gap = 4;
  const w = 100 / n;
  return (
    <Box>
      <Box component="svg" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" sx={{ width: '100%', height, display: 'block' }}>
        {points.map((p, i) => {
          const h = ((p.value + p.extra) / max) * (height - 4);
          const he = (p.extra / max) * (height - 4);
          const x = i * w + (w * gap) / 100;
          const bw = w - (w * gap * 2) / 100;
          return (
            <g key={p.day}>
              <title>{`${dayLabel(p.day)}: ${format(p.value)}${extraLabel && p.extra ? ` · ${extraLabel}: ${format(p.extra)}` : ''}`}</title>
              <rect x={x} y={height - h} width={bw} height={Math.max(h - he, 0)} rx={0.8} fill={theme.palette[color].main} opacity={0.85} />
              {p.extra > 0 && <rect x={x} y={height - he} width={bw} height={he} fill={theme.palette.error.main} opacity={0.8} />}
            </g>
          );
        })}
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {points[0] ? dayLabel(points[0].day) : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {points.length ? dayLabel(points[points.length - 1].day) : ''}
        </Typography>
      </Box>
    </Box>
  );
}

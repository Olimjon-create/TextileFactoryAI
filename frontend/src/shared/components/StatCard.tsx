import { Box, Card, CardContent, Typography, alpha, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { resolveColor } from '@/app/theme';

interface Props {
  label: string;
  value: number | string;
  icon: ReactNode;
  color?: string;
  hint?: string;
}

export default function StatCard({ label, value, icon, color = 'primary.main', hint }: Props) {
  const theme = useTheme();
  const c = resolveColor(theme, color);
  return (
    <Card
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform .18s ease, box-shadow .18s ease',
        '&:hover': { transform: 'translateY(-2px)' },
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 20,
          right: 20,
          top: 0,
          height: 3,
          borderRadius: '0 0 3px 3px',
          bgcolor: c,
          opacity: 0.85,
        },
      }}
    >
      <CardContent sx={{ p: { xs: 1.75, sm: 2.5 }, '&:last-child': { pb: { xs: 1.75, sm: 2.5 } } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
          <Typography
            sx={{
              fontSize: { xs: 11.5, sm: 12.5 },
              fontWeight: 700,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              lineHeight: 1.35,
              pt: 0.5,
            }}
          >
            {label}
          </Typography>
          <Box
            sx={{
              width: { xs: 34, sm: 42 },
              height: { xs: 34, sm: 42 },
              borderRadius: { xs: 2.5, sm: 3 },
              flexShrink: 0,
              display: 'grid',
              placeItems: 'center',
              color: c,
              bgcolor: alpha(c, theme.palette.mode === 'light' ? 0.1 : 0.16),
              '& svg': { fontSize: { xs: 19, sm: 22 } },
            }}
          >
            {icon}
          </Box>
        </Box>
        <Typography
          sx={{
            mt: { xs: 0.75, sm: 1.25 },
            fontWeight: 800,
            letterSpacing: '-0.03em',
            fontSize: { xs: String(value).length > 8 ? 18 : 24, sm: 30 },
            lineHeight: 1.1,
            wordBreak: 'break-word',
          }}
        >
          {value}
        </Typography>
        {hint && (
          <Typography sx={{ mt: 0.75, fontSize: 12.5, color: 'text.secondary', fontWeight: 500 }}>{hint}</Typography>
        )}
      </CardContent>
    </Card>
  );
}

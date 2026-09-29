import { useEffect, useState } from 'react';
import { Box, Tooltip, alpha, type SxProps, type Theme } from '@mui/material';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

const WEEKDAYS = [tr("Yakshanba"), tr("Dushanba"), tr("Seshanba"), tr("Chorshanba"), tr("Payshanba"), tr("Juma"), tr("Shanba")];
const pad = (n: number) => String(n).padStart(2, '0');

/** Hozirgi sana va vaqt; daqiqa almashganda yangilanadi (soniyasiz — ortiqcha qayta chizish yo'q) */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    // Keyingi daqiqa boshigacha kutib, keyin har 60 soniyada
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60_000);
    }, 60_000 - (Date.now() % 60_000));
    // Uyqu rejimidan/boshqa tabdan qaytganda darhol to'g'rilash
    const onVisible = () => document.visibilityState === 'visible' && setNow(new Date());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

/** 📅 28.09.2026 · 🕐 22:03 — yuqori paneldagi sana va soat */
export default function LiveClock({ sx }: { sx?: SxProps<Theme> }) {
  const now = useNow();
  return (
    <Tooltip title={WEEKDAYS[now.getDay()]}>
      <Box
        sx={[
          (t) => ({
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 0.6,
            borderRadius: 999,
            border: 1,
            borderColor: 'divider',
            bgcolor: alpha(t.palette.text.primary, t.palette.mode === 'light' ? 0.03 : 0.06),
            fontSize: 13.5,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
            '& svg': { fontSize: 17, color: 'text.secondary' },
          }),
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
          <CalendarMonthOutlinedIcon />
          {/* Keng ekranda hafta kuni ham */}
          <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>
            {WEEKDAYS[now.getDay()]},
          </Box>
          {formatDate(now)}
        </Box>
        <Box component="span" sx={{ color: 'text.disabled' }}>
          ·
        </Box>
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
          <ScheduleOutlinedIcon />
          {pad(now.getHours())}:{pad(now.getMinutes())}
        </Box>
      </Box>
    </Tooltip>
  );
}

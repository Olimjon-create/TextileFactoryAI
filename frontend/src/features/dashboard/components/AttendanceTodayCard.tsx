import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Skeleton, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useNavigate } from 'react-router-dom';
import { attendanceApi } from '@/features/attendance/api';
import { DAY_STATE_COLORS, DAY_STATE_LABELS, hhmm } from '@/features/attendance/constants';
import type { DailyBoard } from '@/features/attendance/types';
import { tr } from '@/i18n';

const SEGMENTS: { field: keyof DailyBoard['summary']; label: string; color: string }[] = [
  { field: 'present', label: tr("Keldi"), color: 'success.main' },
  { field: 'absent', label: tr("Kelmadi"), color: 'error.main' },
  { field: 'on_leave', label: tr("Javobda"), color: 'info.main' },
  { field: 'sick', label: tr("Kasal"), color: 'secondary.main' },
  { field: 'not_marked', label: tr("Hali kelmadi"), color: 'text.disabled' },
];

/** Dashboard: bugungi davomat — nechta keldi, kechikdi, kelmadi va e'tibor talab qiladigan xodimlar */
export default function AttendanceTodayCard() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    attendanceApi.daily().then(setBoard).catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  const s = board?.summary;
  const attention = board?.rows.filter((r) => r.state === 'LATE' || r.state === 'ABSENT' || r.leave?.status === 'PENDING').slice(0, 5) ?? [];

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } }, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6">{tr("Bugungi davomat")}</Typography>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>{board?.now ? tr("Holat {0} bo'yicha", hhmm(board.now)) : tr("Xodimlar")}</Typography>
          </Box>
          <Button endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/attendance')}>
            {tr("Ochish")}
          </Button>
        </Box>

        {s ? (
          s.total === 0 ? (
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', py: 4 }}>
              <Box>
                <Typography sx={{ fontWeight: 700 }}>{tr("Faol xodimlar yo'q")}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {tr("Davomat yuritish uchun avval xodimlarni qo'shing")}
                </Typography>
                <Button variant="outlined" size="small" onClick={() => navigate('/employees')}>
                  {tr("Xodimlar")}
                </Button>
              </Box>
            </Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.5 }}>
                <Typography sx={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.present}</Typography>
                <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'text.secondary' }}>/ {s.total} {tr("keldi")}</Typography>
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: 'primary.main' }}>{s.at_work} {tr("ishda")}</Typography>
              </Box>
              {/* Taqsimot chizig'i */}
              <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover', mt: 1.5, mb: 1.25 }}>
                {SEGMENTS.map((seg) => (s[seg.field] ? <Box key={seg.field} sx={{ width: `${(s[seg.field] / s.total) * 100}%`, bgcolor: seg.color }} /> : null))}
              </Box>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.75, rowGap: 0.5, mb: 2 }}>
                {SEGMENTS.map((seg) => (
                  <Box key={seg.field} sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: seg.color }} />
                    {seg.label}: <b>{s[seg.field]}</b>
                  </Box>
                ))}
                {s.late > 0 && (
                  <Box sx={{ fontSize: 12.5, fontWeight: 700, color: 'warning.main' }}>{tr("kechikkan:")}{' '}{s.late}</Box>
                )}
              </Box>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.75 }}>
                {tr("E'tibor bering")}
              </Typography>
              {attention.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {tr("Kechikkan yoki sababsiz kelmagan xodim yo'q")}
                </Typography>
              ) : (
                attention.map((r) => (
                  <Box key={r.employee.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6, borderTop: 1, borderColor: 'divider' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
                        {r.employee.full_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap component="div">
                        {r.state === 'LATE' && r.record ? tr("{0} da keldi · +{1} daq", hhmm(r.record.check_in), r.record.late_minutes) : r.employee.phone ?? ''}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={r.leave?.status === 'PENDING' && r.state !== 'LATE' && r.state !== 'ABSENT' ? tr("Javob so'ragan") : DAY_STATE_LABELS[r.state]}
                      color={r.leave?.status === 'PENDING' && r.state !== 'LATE' && r.state !== 'ABSENT' ? 'warning' : DAY_STATE_COLORS[r.state]}
                    />
                  </Box>
                ))
              )}
            </>
          )
        ) : (
          <>
            <Skeleton width="50%" height={48} sx={{ mt: 1 }} />
            <Skeleton variant="rounded" height={10} sx={{ my: 1.5 }} />
            <Skeleton width="80%" />
            <Skeleton width="70%" />
            <Skeleton width="75%" />
          </>
        )}
      </CardContent>
    </Card>
  );
}

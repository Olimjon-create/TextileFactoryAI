import { useCallback, useEffect, useState } from 'react';
import { Avatar, Box, Button, Card, CardContent, Chip, Skeleton, Typography } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { attendanceApi } from '@/features/attendance/api';
import { DAY_STATE_COLORS, DAY_STATE_LABELS, hhmm } from '@/features/attendance/constants';
import { ATTENDANCE_VIEW_ROLES } from '@/features/attendance/permissions';
import type { DailyBoard, DailyRow, DayState } from '@/features/attendance/types';
import { resourcesApi } from '@/features/resources/api';
import { DEPARTMENT_LABELS } from '@/features/resources/constants';
import { useResourcePermissions } from '@/features/resources/permissions';
import type { Employee } from '@/features/resources/types';
import { tr } from '@/i18n';

const LIMIT = 7;
const STATE_ORDER: Record<DayState, number> = { ABSENT: 0, LATE: 1, NOT_MARKED: 2, SICK: 3, LEAVE: 4, VACATION: 5, PRESENT: 6 };

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function EmployeesCard() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { canEditWorkforce } = useResourcePermissions();
  const canSeeAttendance = hasRole(...ATTENDANCE_VIEW_ROLES);
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [total, setTotal] = useState(0);
  const [board, setBoard] = useState<DailyBoard | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    resourcesApi
      .employees({ status: 'ACTIVE', limit: 100 })
      .then((page) => {
        setEmployees(page.items);
        setTotal(page.total);
      })
      .catch(() => setFailed(true));
    if (canSeeAttendance) attendanceApi.daily().then(setBoard).catch(() => setBoard(null));
  }, [canSeeAttendance]);

  useEffect(load, [load]);

  if (failed) return null;

  const today = new Map<number, DailyRow>(board?.rows.map((r) => [r.employee.id, r]) ?? []);
  const sorted = [...(employees ?? [])].sort(
    (a, b) => (STATE_ORDER[today.get(a.id)?.state ?? 'PRESENT'] ?? 9) - (STATE_ORDER[today.get(b.id)?.state ?? 'PRESENT'] ?? 9),
  );
  const s = board?.summary;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } }, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6">{tr("Xodimlar")}</Typography>
            <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>
              {employees ? tr("{0} ta faol xodim", total) : tr("Yuklanmoqda...")}
              {board?.now ? tr(" · {0} holati", hhmm(board.now)) : ''}
            </Typography>
          </Box>
        </Box>

        {s && s.total > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, mb: 1.5 }}>
            <MiniTile label={tr("Keldi")} value={`${s.present}/${s.total}`} color="success.main" />
            <MiniTile label={tr("Kechikdi")} value={s.late} color={s.late ? 'warning.main' : undefined} />
            <MiniTile label={tr("Kelmadi")} value={s.absent} color={s.absent ? 'error.main' : undefined} />
          </Box>
        )}

        {employees === null ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.9 }}>
              <Skeleton variant="circular" width={34} height={34} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="60%" />
                <Skeleton width="40%" />
              </Box>
            </Box>
          ))
        ) : employees.length === 0 ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', py: 3 }}>
            <Box>
              <Avatar sx={{ mx: 'auto', mb: 1.25, bgcolor: 'action.hover', color: 'text.secondary', width: 48, height: 48 }}>
                <PersonAddAlt1RoundedIcon />
              </Avatar>
              <Typography sx={{ fontWeight: 700 }}>{tr("Hali xodim yo'q")}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, maxWidth: 260 }}>
                {tr("Xodimlarni qo'shing — davomat, ish haqi va ishlab chiqarish hisobi shu ro'yxatdan yuritiladi")}
              </Typography>
              {canEditWorkforce && (
                <Button variant="outlined" size="small" startIcon={<PersonAddAlt1RoundedIcon />} onClick={() => navigate('/employees/new')}>
                  {tr("Birinchi xodimni qo'shish")}
                </Button>
              )}
            </Box>
          </Box>
        ) : (
          <Box sx={{ flex: 1 }}>
            {sorted.slice(0, LIMIT).map((e) => {
              const row = today.get(e.id);
              return (
                <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 0.85, borderTop: 1, borderColor: 'divider' }}>
                  <Avatar sx={{ width: 34, height: 34, fontSize: 12.5, fontWeight: 800, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                    {initials(e.full_name)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 700 }} noWrap>
                      {e.full_name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap component="div">
                      {row?.state === 'LATE' && row.record
                        ? tr("{0} da keldi · +{1} daq", hhmm(row.record.check_in), row.record.late_minutes)
                        : [e.position, DEPARTMENT_LABELS[e.department]].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                  {row && <Chip size="small" label={DAY_STATE_LABELS[row.state]} color={DAY_STATE_COLORS[row.state]} />}
                </Box>
              );
            })}
          </Box>
        )}

        {employees && employees.length > 0 && (
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'space-between', borderTop: 1, borderColor: 'divider', pt: 1.25, mt: 'auto' }}>
            {canSeeAttendance ? (
              <Button size="small" onClick={() => navigate('/attendance')}>
                {tr("Davomat")}
              </Button>
            ) : (
              <span />
            )}
            <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/employees')}>
              {total > LIMIT ? tr("Barchasi ({0})", total) : tr("Barchasi")}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function MiniTile({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box sx={{ p: 1, borderRadius: '12px', border: 1, borderColor: 'divider' }}>
      <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontSize: 17, fontWeight: 800, color, lineHeight: 1.2 }}>{value}</Typography>
    </Box>
  );
}

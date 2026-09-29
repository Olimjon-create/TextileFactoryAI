import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import { getErrorMessage } from '@/shared/api/client';
import { attendanceApi } from '../api';
import {
  DAY_STATE_COLORS,
  DAY_STATE_LABELS,
  duration,
  hhmm,
  LEAVE_STATUS_COLORS,
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  longDate,
  shortDate,
} from '../constants';
import type { AttendanceRecord, DayState, EmployeeMonthDetail } from '../types';
import { tr } from '@/i18n';

const stateOf = (r: AttendanceRecord): DayState => (r.status === 'PRESENT' ? (r.late_minutes > 0 ? 'LATE' : 'PRESENT') : r.status);

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Box sx={{ flex: '1 1 110px', p: 1.5, borderRadius: '14px', bgcolor: 'action.hover' }}>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 700 }}>{label}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 800, color }}>{value}</Typography>
    </Box>
  );
}

/** Xodimning bir oylik davomati: kunma-kun, jami ko'rsatkichlar va javob so'rovlari */
export default function EmployeeMonthDialog({ employeeId, month: initialMonth, onClose }: { employeeId: number | null; month: string; onClose: () => void }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<EmployeeMonthDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => setMonth(initialMonth), [initialMonth, employeeId]);
  useEffect(() => {
    if (!employeeId) return;
    setData(null);
    attendanceApi
      .employeeMonth(employeeId, month)
      .then((d) => {
        setData(d);
        setError('');
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [employeeId, month]);

  const e = data?.employee;
  const t = data?.totals;

  return (
    <Dialog open={!!employeeId} onClose={onClose} maxWidth="sm" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {e ? e.full_name : <Skeleton width={200} />}
          {e && (
            <Typography color="text.secondary" sx={{ fontSize: 13.5, fontWeight: 500, mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
              <span>{e.employee_code}</span>
              {e.position && <span>{e.position}</span>}
              {e.phone && (
                <Link href={`tel:${e.phone}`} underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                  <PhoneOutlinedIcon sx={{ fontSize: 15 }} />
                  {e.phone}
                </Link>
              )}
              {e.shift_name && (
                <span>
                  {e.shift_name}: {hhmm(e.shift_start)}–{hhmm(e.shift_end)}
                </span>
              )}
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} aria-label={tr("Yopish")}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <TextField type="month" label={tr("Oy")} value={month} onChange={(ev) => ev.target.value && setMonth(ev.target.value)} sx={{ maxWidth: 200, mb: 2 }} slotProps={{ inputLabel: { shrink: true } }} />
        {error && <Alert severity="error">{error}</Alert>}
        {!data && !error && <Skeleton variant="rounded" height={220} />}
        {t && data && (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.25, mb: 2.5 }}>
              <Stat label={tr("Kelgan kunlar")} value={t.present_days} color="success.main" />
              <Stat label={tr("Ishlagan vaqt")} value={duration(t.worked_minutes)} />
              <Stat label={tr("Kechikkan")} value={t.late_days ? tr("{0} kun", t.late_days) : 0} color={t.late_days ? 'warning.main' : undefined} />
              <Stat label={tr("Kelmagan")} value={t.absent_days} color={t.absent_days ? 'error.main' : undefined} />
              <Stat label={tr("Javob / kasal")} value={`${t.leave_days + t.vacation_days} / ${t.sick_days}`} />
            </Box>
            {t.late_minutes > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {tr("Oy davomida jami kechikish:")}{' '}<b>{duration(t.late_minutes)}</b>
              </Typography>
            )}

            <Typography sx={{ fontWeight: 800, mb: 1 }}>{tr("Kunlar")}</Typography>
            {data.days.length === 0 && (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                {tr("Bu oyda davomat yozuvi yo'q")}
              </Typography>
            )}
            <Stack divider={<Divider flexItem />}>
              {data.days.map((r) => {
                const st = stateOf(r);
                return (
                  <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}>
                    <Box sx={{ width: 150, flexShrink: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{shortDate(r.work_date)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {longDate(r.work_date).split(',')[0]}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {r.status === 'PRESENT' ? (
                        <Typography sx={{ fontSize: 14 }}>
                          {hhmm(r.check_in)} → {r.check_out ? hhmm(r.check_out) : '…'}
                          {r.worked_minutes !== null && <Typography component="span" color="text.secondary" sx={{ fontSize: 13 }}> · {duration(r.worked_minutes)}</Typography>}
                          {r.late_minutes > 0 && <Typography component="span" color="warning.main" sx={{ fontSize: 13, fontWeight: 700 }}> · +{r.late_minutes} {tr("daq")}</Typography>}
                        </Typography>
                      ) : null}
                      {r.note && (
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {r.note}
                        </Typography>
                      )}
                    </Box>
                    <Chip size="small" label={DAY_STATE_LABELS[st]} color={DAY_STATE_COLORS[st]} variant={st === 'PRESENT' ? 'outlined' : 'filled'} />
                  </Box>
                );
              })}
            </Stack>

            {data.leaves.length > 0 && (
              <>
                <Typography sx={{ fontWeight: 800, mt: 3, mb: 1 }}>{tr("Javob so'rovlari")}</Typography>
                <Stack spacing={1}>
                  {data.leaves.map((l) => (
                    <Box key={l.id} sx={{ p: 1.5, borderRadius: '14px', border: 1, borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                          {LEAVE_TYPE_LABELS[l.leave_type]} · {shortDate(l.start_date)}
                          {l.end_date !== l.start_date ? `–${shortDate(l.end_date)}` : ''}
                          {l.start_time ? ` · ${hhmm(l.start_time)}–${hhmm(l.end_time)}` : ''}
                        </Typography>
                        <Chip size="small" label={LEAVE_STATUS_LABELS[l.status]} color={LEAVE_STATUS_COLORS[l.status]} />
                      </Box>
                      <Typography variant="body2" color="text.secondary">
                        {l.reason}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
          </>
        )}
        <Box sx={{ mt: 2, textAlign: 'right' }}>
          <Button onClick={onClose}>{tr("Yopish")}</Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

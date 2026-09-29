import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import { attendanceApi } from '../api';
import { ATTENDANCE_STATUS_LABELS, hhmm, keys, longDate } from '../constants';
import type { AttendanceStatus, DailyRow } from '../types';
import { tr } from '@/i18n';

interface Props {
  row: DailyRow | null;
  date: string;
  /** Dialog ochilganda tanlangan holat (masalan menyudan "Kelmadi") */
  initialStatus?: AttendanceStatus;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Kunlik yozuvni qo'lda kiritish/tuzatish: keldi (vaqtlar bilan), kelmadi, kasal, javob, ta'til */
export default function MarkDialog({ row, date, initialStatus, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!row) return;
    const r = row.record;
    setStatus(initialStatus ?? r?.status ?? 'PRESENT');
    setCheckIn(r?.check_in ? hhmm(r.check_in) : row.employee.shift_start ? hhmm(row.employee.shift_start) : '08:00');
    setCheckOut(r?.check_out ? hhmm(r.check_out) : '');
    setNote(r?.note ?? '');
    setError('');
  }, [row, initialStatus]);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await attendanceApi.upsert({
        employee_id: row.employee.id,
        work_date: date,
        status,
        check_in: status === 'PRESENT' ? checkIn || null : null,
        check_out: status === 'PRESENT' ? checkOut || null : null,
        note: note || null,
      });
      onSaved(`${row.employee.full_name}: ${ATTENDANCE_STATUS_LABELS[status].toLowerCase()}`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {tr("Davomatni belgilash")}
        {row && (
          <Typography color="text.secondary" sx={{ fontSize: 14, fontWeight: 500, mt: 0.5 }}>
            {row.employee.full_name} · {longDate(date)}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label={tr("Holat")} value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)}>
            {keys(ATTENDANCE_STATUS_LABELS).map((s) => (
              <MenuItem key={s} value={s}>
                {ATTENDANCE_STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
          {status === 'PRESENT' && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField label={tr("Keldi")} type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required slotProps={{ inputLabel: { shrink: true } }} />
              <TextField label={tr("Ketdi")} type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} helperText={tr("Hali ketmagan bo'lsa bo'sh")} />
            </Box>
          )}
          {row?.employee.shift_start && (
            <Typography variant="body2" color="text.secondary">
              {tr("Smena:")}{' '}{row.employee.shift_name} ({hhmm(row.employee.shift_start)}–{hhmm(row.employee.shift_end)}{tr("). Kechikish va ishlagan vaqt avtomatik hisoblanadi.")}
            </Typography>
          )}
          <TextField
            label={tr("Izoh")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            placeholder={status === 'ABSENT' ? tr("Masalan: telefoni o'chiq, sababini bilmaymiz") : ''}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          {tr("Bekor qilish")}
        </Button>
        <Button variant="contained" onClick={save} disabled={saving || (status === 'PRESENT' && !checkIn)}>
          {tr("Saqlash")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

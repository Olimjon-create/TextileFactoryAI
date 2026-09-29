import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import { resourcesApi } from '@/features/resources/api';
import type { Employee } from '@/features/resources/types';
import { attendanceApi } from '../api';
import { isoDate, keys, LEAVE_TYPE_LABELS } from '../constants';
import type { EmployeeBrief, LeaveType } from '../types';
import { tr } from '@/i18n';

type Picked = Pick<Employee, 'id' | 'full_name' | 'employee_code' | 'phone'> | EmployeeBrief;

interface Props {
  open: boolean;
  employee?: EmployeeBrief | null;
  date?: string;
  canApprove: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function LeaveDialog({ open, employee, date, canApprove, onClose, onSaved }: Props) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [options, setOptions] = useState<Picked[]>([]);
  const [query, setQuery] = useState('');
  const [leaveType, setLeaveType] = useState<LeaveType>('PERSONAL');
  const [start, setStart] = useState(isoDate());
  const [end, setEnd] = useState(isoDate());
  const [hourly, setHourly] = useState(false);
  const [fromTime, setFromTime] = useState('14:00');
  const [toTime, setToTime] = useState('16:00');
  const [reason, setReason] = useState('');
  const [approve, setApprove] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked(employee ?? null);
    setLeaveType('PERSONAL');
    setStart(date ?? isoDate());
    setEnd(date ?? isoDate());
    setHourly(false);
    setReason('');
    setApprove(canApprove);
    setError('');
  }, [open, employee, date, canApprove]);

  useEffect(() => {
    if (!open || employee) return;
    const t = setTimeout(() => {
      resourcesApi
        .employees({ search: query.trim(), status: 'ACTIVE', limit: 20 })
        .then((r) => setOptions(r.items))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, employee]);

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      await attendanceApi.createLeave({
        employee_id: picked.id,
        leave_type: leaveType,
        start_date: start,
        end_date: hourly ? start : end,
        start_time: hourly ? fromTime : null,
        end_time: hourly ? toTime : null,
        reason,
        approve: canApprove && approve,
      });
      onSaved(canApprove && approve ? tr("{0}ga javob berildi", picked.full_name) : tr("Javob so'rovi yuborildi — rahbar tasdiqlaydi"));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const valid = !!picked && reason.trim().length >= 2 && !!start && (hourly ? fromTime < toTime : end >= start);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {tr("Javob (ruxsat) so'rovi")}
        <Typography color="text.secondary" sx={{ fontSize: 14, fontWeight: 500, mt: 0.5 }}>
          {tr("Xodim ishga kela olmasa yoki ish vaqtida ketishi kerak bo'lsa")}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {employee ? (
            <TextField label={tr("Xodim")} value={`${employee.full_name} · ${employee.employee_code}`} disabled />
          ) : (
            <Autocomplete
              options={options}
              value={picked}
              onChange={(_, v) => setPicked(v)}
              onInputChange={(_, v) => setQuery(v)}
              filterOptions={(x) => x}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              getOptionLabel={(o) => `${o.full_name} · ${o.employee_code}`}
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Box>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{o.full_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {o.employee_code}
                      {o.phone ? ` · ${o.phone}` : ''}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label={tr("Xodim")} placeholder={tr("Ism yoki tabel raqami")} required />}
              noOptionsText={tr("Xodim topilmadi")}
            />
          )}
          <TextField select label={tr("Sabab turi")} value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
            {keys(LEAVE_TYPE_LABELS).map((t) => (
              <MenuItem key={t} value={t}>
                {LEAVE_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Switch checked={hourly} onChange={(e) => setHourly(e.target.checked)} />}
            label={tr("Bir necha soatga (kun ichida ketib-kelish)")}
          />
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', '& > *': { flex: '1 1 140px' } }}>
            <TextField
              label={hourly ? tr("Sana") : tr("Qaysi kundan")}
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            {hourly ? (
              <>
                <TextField label={tr("Soat")} type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label="gacha" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </>
            ) : (
              <TextField
                label={tr("Qaysi kungacha")}
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: start } }}
              />
            )}
          </Box>
          <TextField
            label={tr("Sababi")}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            minRows={2}
            required
            placeholder={tr("Masalan: farzandi kasal, shifokorga olib boradi")}
          />
          {canApprove && (
            <FormControlLabel
              control={<Checkbox checked={approve} onChange={(e) => setApprove(e.target.checked)} />}
              label={tr("Darhol javob berish (tasdiqlash)")}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit">
          {tr("Bekor qilish")}
        </Button>
        <Button variant="contained" onClick={save} disabled={!valid || saving}>
          {canApprove && approve ? tr("Javob berish") : tr("So'rov yuborish")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

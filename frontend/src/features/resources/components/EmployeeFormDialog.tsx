import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { resourcesApi } from '../api';
import { DEPARTMENT_LABELS, EMPLOYEE_STATUS_LABELS, keys, PAY_RATE_UNIT, PAY_TYPE_LABELS } from '../constants';
import { useResourcePermissions } from '../permissions';
import type { Department, Employee, EmployeePayload, EmployeeStatus, PayType, ProductionLine, Shift } from '../types';
import FactoryField, { useNeedsFactory } from './FactoryField';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSaved: (e: Employee) => void;
}

const EMPTY = {
  employee_code: '',
  full_name: '',
  phone: '',
  position: '',
  department: 'SEWING' as Department,
  line_id: '' as number | '',
  shift_id: '' as number | '',
  hire_date: '',
  pay_type: 'MONTHLY' as PayType,
  pay_rate: '',
  daily_norm: '',
  status: 'ACTIVE' as EmployeeStatus,
  notes: '',
  factory_id: '' as number | '',
};

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));

export default function EmployeeFormDialog({ open, employee, onClose, onSaved }: Props) {
  const { canSeePay } = useResourcePermissions();
  const needsFactory = useNeedsFactory(!employee);
  const [form, setForm] = useState(EMPTY);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setForm(
      employee
        ? {
            employee_code: employee.employee_code,
            full_name: employee.full_name,
            phone: employee.phone ?? '',
            position: employee.position ?? '',
            department: employee.department,
            line_id: employee.line?.id ?? '',
            shift_id: employee.shift?.id ?? '',
            hire_date: employee.hire_date ?? '',
            pay_type: employee.pay_type,
            pay_rate: employee.pay_rate !== null ? String(employee.pay_rate) : '',
            daily_norm: employee.daily_norm !== null ? String(employee.daily_norm) : '',
            status: employee.status,
            notes: employee.notes ?? '',
            factory_id: employee.factory_id,
          }
        : EMPTY,
    );
    resourcesApi.lines().then(setLines).catch(() => undefined);
    resourcesApi.shifts().then(setShifts).catch(() => undefined);
  }, [open, employee, save.reset]);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const rate = num(form.pay_rate);
  const norm = num(form.daily_norm);
  const rateError = rate !== null && (!Number.isFinite(rate) || rate < 0);
  const normError = norm !== null && (!Number.isInteger(norm) || norm < 1);
  const codeError = form.employee_code !== '' && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(form.employee_code.trim());
  const valid = form.full_name.trim().length >= 2 && !rateError && !normError && !codeError && (!needsFactory || form.factory_id !== '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const payload: EmployeePayload = {
      employee_code: form.employee_code.trim() || null,
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      position: form.position.trim() || null,
      department: form.department,
      line_id: form.line_id === '' ? null : form.line_id,
      shift_id: form.shift_id === '' ? null : form.shift_id,
      hire_date: form.hire_date || null,
      daily_norm: norm,
      status: form.status,
      notes: form.notes.trim() || null,
      // Maosh maydonlari faqat ruxsati borlardan yuboriladi
      ...(canSeePay ? { pay_type: form.pay_type, pay_rate: rate } : {}),
      ...(needsFactory ? { factory_id: Number(form.factory_id) } : {}),
    };
    try {
      const saved = await save.run(() => (employee ? resourcesApi.updateEmployee(employee.id, payload) : resourcesApi.createEmployee(payload)));
      toast.success(employee ? tr("O'zgarishlar saqlandi") : tr("Xodim qo'shildi: {0}", saved.employee_code));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{employee ? tr("Xodimni tahrirlash") : tr("Yangi xodim")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && <FactoryField value={form.factory_id} onChange={(id) => set('factory_id', id)} />}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' } }}>
              <TextField label="F.I.Sh." required autoFocus value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
              <TextField
                label={tr("Tabel raqami")}
                value={form.employee_code}
                onChange={(e) => set('employee_code', e.target.value.toUpperCase())}
                placeholder={tr("Avtomatik")}
                error={codeError}
                helperText={!employee ? tr("Bo'sh — EMP-00001 kabi") : undefined}
              />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label={tr("Lavozim")} value={form.position} onChange={(e) => set('position', e.target.value)} placeholder={tr("Tikuvchi, bichuvchi, mexanik...")} />
              <TextField label={tr("Telefon")} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+998 90 123 45 67" />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField select label={tr("Bo'lim")} value={form.department} onChange={(e) => set('department', e.target.value as Department)}>
                {keys(DEPARTMENT_LABELS).map((d) => (
                  <MenuItem key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Liniya")} value={form.line_id} onChange={(e) => set('line_id', e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">—</MenuItem>
                {lines.map((l) => (
                  <MenuItem key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Smena")} value={form.shift_id} onChange={(e) => set('shift_id', e.target.value === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">—</MenuItem>
                {shifts.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField
                label={tr("Smenadagi me'yor")}
                value={form.daily_norm}
                onChange={(e) => set('daily_norm', e.target.value)}
                inputMode="numeric"
                error={normError}
                helperText={tr("KPI shu bilan solishtiriladi")}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("dona")}</InputAdornment> } }}
              />
              <TextField type="date" label={tr("Ishga kirgan sana")} value={form.hire_date} onChange={(e) => set('hire_date', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField select label={tr("Holati")} value={form.status} onChange={(e) => set('status', e.target.value as EmployeeStatus)}>
                {keys(EMPLOYEE_STATUS_LABELS).map((s) => (
                  <MenuItem key={s} value={s}>
                    {EMPLOYEE_STATUS_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            {canSeePay && (
              <>
                <Divider textAlign="left">
                  <Typography variant="caption" color="text.secondary">
                    {tr("Ish haqi (maxfiy — faqat rahbariyat ko'radi)")}
                  </Typography>
                </Divider>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  <TextField select label={tr("To'lov turi")} value={form.pay_type} onChange={(e) => set('pay_type', e.target.value as PayType)}>
                    {keys(PAY_TYPE_LABELS).map((p) => (
                      <MenuItem key={p} value={p}>
                        {PAY_TYPE_LABELS[p]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    label={tr("Stavka")}
                    value={form.pay_rate}
                    onChange={(e) => set('pay_rate', e.target.value)}
                    inputMode="decimal"
                    error={rateError}
                    helperText={tr("Tannarx hisobida ishlatiladi")}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">{PAY_RATE_UNIT[form.pay_type]}</InputAdornment> } }}
                  />
                </Box>
              </>
            )}
            <TextField label={tr("Izoh")} value={form.notes} onChange={(e) => set('notes', e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={!valid} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

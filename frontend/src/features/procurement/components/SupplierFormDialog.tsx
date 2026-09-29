import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import type { Factory } from '@/shared/types';
import { getErrorMessage } from '@/shared/api/client';
import CountrySelect from '@/shared/components/CountrySelect';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { procurementApi } from '../api';
import type { SupplierDetail, SupplierPayload } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  supplier?: SupplierDetail | null;
  onClose: () => void;
  onSaved: (s: SupplierDetail) => void;
}

const EMPTY = {
  name: '',
  code: '',
  contact_person: '',
  phone: '',
  email: '',
  country: 'UZ' as string | null,
  address: '',
  tax_id: '',
  payment_terms_days: '',
  lead_time_days: '',
  notes: '',
  is_active: true,
  factory_id: '' as number | '',
};

const days = (v: string) => (v.trim() === '' ? null : Number(v));
const daysValid = (v: string) => v.trim() === '' || (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 365);

export default function SupplierFormDialog({ open, supplier, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const needsFactory = user?.role === 'SUPER_ADMIN' && !supplier;
  const [form, setForm] = useState(EMPTY);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setForm(
      supplier
        ? {
            name: supplier.name,
            code: supplier.code,
            contact_person: supplier.contact_person ?? '',
            phone: supplier.phone ?? '',
            email: supplier.email ?? '',
            country: supplier.country,
            address: supplier.address ?? '',
            tax_id: supplier.tax_id ?? '',
            payment_terms_days: supplier.payment_terms_days?.toString() ?? '',
            lead_time_days: supplier.lead_time_days?.toString() ?? '',
            notes: supplier.notes ?? '',
            is_active: supplier.is_active,
            factory_id: supplier.factory_id,
          }
        : EMPTY,
    );
    if (needsFactory) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [open, supplier, needsFactory, save.reset]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const valid = form.name.trim().length >= 2 && daysValid(form.payment_terms_days) && daysValid(form.lead_time_days) && (!needsFactory || form.factory_id !== '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    const payload: SupplierPayload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      country: form.country,
      address: form.address.trim() || null,
      tax_id: form.tax_id.trim() || null,
      payment_terms_days: days(form.payment_terms_days),
      lead_time_days: days(form.lead_time_days),
      notes: form.notes.trim() || null,
      ...(needsFactory ? { factory_id: Number(form.factory_id) } : {}),
      ...(supplier ? { is_active: form.is_active } : {}),
    };
    try {
      const saved = await save.run(() => (supplier ? procurementApi.updateSupplier(supplier.id, payload) : procurementApi.createSupplier(payload)));
      toast.success(supplier ? tr("O'zgarishlar saqlandi") : tr("{0} qo'shildi", saved.name));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{supplier ? tr("Yetkazib beruvchini tahrirlash") : tr("Yangi yetkazib beruvchi")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && (
              <TextField select label={tr("Fabrika")} required value={form.factory_id} onChange={(e) => set('factory_id', Number(e.target.value))}>
                {factories.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' } }}>
              <TextField label={tr("Nomi")} required autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
              <TextField label={tr("Kod")} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder={tr("Avtomatik")} helperText={supplier ? undefined : tr("Bo'sh — SUP-00001")} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <TextField label={tr("Mas'ul shaxs")} value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
              <TextField label={tr("Telefon")} value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" placeholder="+998 90 123 45 67" />
              <TextField label={tr("Email")} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              <TextField label={tr("STIR (INN)")} value={form.tax_id} onChange={(e) => set('tax_id', e.target.value)} slotProps={{ htmlInput: { maxLength: 30 } }} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <CountrySelect value={form.country} onChange={(c) => set('country', c)} size="medium" />
              <TextField label={tr("Manzil")} value={form.address} onChange={(e) => set('address', e.target.value)} />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField
                label={tr("Yetkazish muddati")}
                value={form.lead_time_days}
                onChange={(e) => set('lead_time_days', e.target.value)}
                inputMode="numeric"
                error={!daysValid(form.lead_time_days)}
                helperText={tr("Xaridda kutilgan sana shundan hisoblanadi")}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("kun")}</InputAdornment> } }}
              />
              <TextField
                label={tr("To'lov muddati")}
                value={form.payment_terms_days}
                onChange={(e) => set('payment_terms_days', e.target.value)}
                inputMode="numeric"
                error={!daysValid(form.payment_terms_days)}
                helperText={tr("Qabul qilingandan keyin")}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("kun")}</InputAdornment> } }}
              />
            </Box>
            <TextField label={tr("Izoh")} value={form.notes} onChange={(e) => set('notes', e.target.value)} multiline minRows={2} />
            {supplier && <FormControlLabel control={<Switch checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} />} label={tr("Faol (xarid buyurtmasida tanlanadi)")} />}
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

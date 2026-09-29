import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import CountrySelect from '@/shared/components/CountrySelect';
import type { Factory } from '@/shared/types';
import { isValidEmail, isValidPhone, orNull } from '@/shared/utils/validators';
import { customersApi } from '../api';
import { CUSTOMER_STATUS_HINTS, CUSTOMER_STATUS_LABELS, CUSTOMER_STATUSES } from '../constants';
import type { Customer, CustomerPayload, CustomerStatus, CustomerType } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  customer: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{1,29}$/;

const EMPTY = {
  name: '',
  customer_code: '',
  customer_type: 'COMPANY' as CustomerType,
  status: 'ACTIVE' as CustomerStatus,
  contact_person: '',
  phone: '',
  email: '',
  country: 'UZ' as string | null,
  address: '',
  notes: '',
  factory_id: '' as number | '',
};

type Form = typeof EMPTY;
type TextField_ = 'name' | 'customer_code' | 'contact_person' | 'phone' | 'email' | 'address' | 'notes';

function validate(form: Form, needsFactory: boolean): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  const name = form.name.trim();
  if (!name) e.name = tr("Nomini kiriting");
  else if (name.length < 2) e.name = tr("Kamida 2 ta belgidan iborat bo'lishi kerak");
  else if (name.length > 200) e.name = tr("200 ta belgidan oshmasin");

  const code = form.customer_code.trim();
  if (code && !CODE_RE.test(code)) e.customer_code = tr("2-30 belgi: lotin harflari, raqam, '-', '_', '.'");
  if (form.phone.trim() && !isValidPhone(form.phone)) e.phone = tr("Telefon raqami noto'g'ri (masalan: +998 90 123 45 67)");
  if (form.email.trim() && !isValidEmail(form.email)) e.email = tr("Email noto'g'ri formatda");
  if (form.contact_person.trim().length > 200) e.contact_person = tr("200 ta belgidan oshmasin");
  if (form.address.trim().length > 300) e.address = tr("300 ta belgidan oshmasin");
  if (form.notes.length > 5000) e.notes = tr("5000 ta belgidan oshmasin");
  if (needsFactory && form.factory_id === '') e.factory_id = tr("Fabrikani tanlang");
  return e;
}

export default function CustomerFormDialog({ open, customer, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const needsFactory = user?.role === 'SUPER_ADMIN' && !customer;
  const [form, setForm] = useState<Form>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof Form, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setTouched({});
    setSubmitted(false);
    setForm(
      customer
        ? {
            name: customer.name,
            customer_code: customer.customer_code,
            customer_type: customer.customer_type,
            status: customer.status,
            contact_person: customer.contact_person ?? '',
            phone: customer.phone ?? '',
            email: customer.email ?? '',
            country: customer.country,
            address: customer.address ?? '',
            notes: customer.notes ?? '',
            factory_id: customer.factory_id,
          }
        : EMPTY,
    );
    if (needsFactory) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [open, customer, needsFactory, save.reset]);

  const errors = validate(form, needsFactory);
  const errorOf = (field: keyof Form) => ((touched[field] || submitted) && errors[field]) || '';

  const textProps = (field: TextField_) => ({
    value: form[field],
    onChange: (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: field === 'customer_code' ? e.target.value.toUpperCase() : e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [field]: true })),
    error: !!errorOf(field),
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setError('');
    if (Object.keys(errors).length > 0) return;
    const payload: CustomerPayload = {
      name: form.name.trim(),
      customer_code: orNull(form.customer_code),
      customer_type: form.customer_type,
      status: form.status,
      contact_person: orNull(form.contact_person),
      phone: orNull(form.phone),
      email: orNull(form.email),
      country: form.country,
      address: orNull(form.address),
      notes: orNull(form.notes),
    };
    if (needsFactory) payload.factory_id = Number(form.factory_id);
    if (customer && !payload.customer_code) delete (payload as Partial<CustomerPayload>).customer_code;
    try {
      const saved = await save.run(() => (customer ? customersApi.update(customer.id, payload) : customersApi.create(payload)));
      toast.success(customer ? tr("O'zgarishlar saqlandi") : tr("Yangi mijoz qo'shildi"));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const isCompany = form.customer_type === 'COMPANY';

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{customer ? tr("Mijozni tahrirlash") : tr("Yangi mijoz")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            {needsFactory && (
              <TextField
                select
                label={tr("Fabrika")}
                required
                value={form.factory_id}
                onChange={(e) => setForm({ ...form, factory_id: Number(e.target.value) })}
                onBlur={() => setTouched((t) => ({ ...t, factory_id: true }))}
                error={!!errorOf('factory_id')}
                helperText={errorOf('factory_id') || undefined}
              >
                {factories.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="text.secondary">
                {tr("Mijoz turi:")}
              </Typography>
              <ToggleButtonGroup
                size="small"
                exclusive
                color="primary"
                value={form.customer_type}
                onChange={(_, v: CustomerType | null) => v && setForm({ ...form, customer_type: v })}
              >
                <ToggleButton value="COMPANY" sx={{ gap: 0.75, px: 2 }}>
                  <ApartmentOutlinedIcon fontSize="small" /> {tr("Kompaniya")}
                </ToggleButton>
                <ToggleButton value="INDIVIDUAL" sx={{ gap: 0.75, px: 2 }}>
                  <PersonOutlineIcon fontSize="small" /> {tr("Jismoniy shaxs")}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' } }}>
              <TextField
                label={isCompany ? tr("Kompaniya nomi") : "F.I.Sh."}
                required
                autoFocus
                {...textProps('name')}
                helperText={errorOf('name') || undefined}
              />
              <TextField
                label={tr("Mijoz kodi")}
                placeholder={tr("Avtomatik")}
                {...textProps('customer_code')}
                helperText={errorOf('customer_code') || (customer ? undefined : tr("Bo'sh qoldirilsa: CUS-00001"))}
              />
              <TextField
                select
                label={tr("Status")}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as CustomerStatus })}
                helperText={CUSTOMER_STATUS_HINTS[form.status]}
              >
                {CUSTOMER_STATUSES.map((s) => (
                  <MenuItem key={s} value={s}>
                    {CUSTOMER_STATUS_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
            </Box>

            <Typography variant="subtitle2" sx={{ pt: 1 }}>
              {tr("Aloqa ma'lumotlari")}
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' } }}>
              <TextField
                label={tr("Kontakt shaxs")}
                placeholder={isCompany ? tr("Masalan: xarid menejeri") : ''}
                {...textProps('contact_person')}
                helperText={errorOf('contact_person') || undefined}
              />
              <TextField
                label={tr("Telefon")}
                placeholder="+998 90 123 45 67"
                autoComplete="off"
                {...textProps('phone')}
                helperText={errorOf('phone') || undefined}
              />
              <TextField
                label={tr("Email")}
                type="email"
                autoComplete="off"
                {...textProps('email')}
                helperText={errorOf('email') || undefined}
              />
            </Box>

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <CountrySelect value={form.country} onChange={(country) => setForm((f) => ({ ...f, country }))} />
              <TextField label={tr("Manzil")} placeholder={tr("Shahar, ko'cha, uy")} {...textProps('address')} helperText={errorOf('address') || undefined} />
            </Box>

            <TextField
              label={tr("Izoh")}
              multiline
              minRows={3}
              placeholder={tr("Shartnoma shartlari, to'lov tartibi, afzal ko'rgan mahsulotlar...")}
              {...textProps('notes')}
              helperText={errorOf('notes') || undefined}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

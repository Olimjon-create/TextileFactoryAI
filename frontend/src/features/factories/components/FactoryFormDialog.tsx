import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { getErrorMessage } from '@/shared/api/client';
import ImageUpload from '@/shared/components/ImageUpload';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import type { Factory } from '@/shared/types';
import { factoriesApi, type FactoryPayload } from '../api';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  factory: Factory | null; // null — yangi fabrika
  canToggleActive: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const SHORT_MAX = 200;

const EMPTY = {
  name: '',
  address: '',
  phone: '',
  isActive: true,
  isPublic: true,
  city: '',
  shortDescription: '',
  description: '',
  logoUrl: null as string | null,
  coverUrl: null as string | null,
};

export default function FactoryFormDialog({ open, factory, canToggleActive, onClose, onSaved }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setForm(
      factory
        ? {
            name: factory.name,
            address: factory.address ?? '',
            phone: factory.phone ?? '',
            isActive: factory.is_active,
            isPublic: factory.is_public,
            city: factory.city ?? '',
            shortDescription: factory.short_description ?? '',
            description: factory.description ?? '',
            logoUrl: factory.logo_url,
            coverUrl: factory.cover_url,
          }
        : EMPTY,
    );
    setError('');
  }, [open, factory, save.reset]);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: FactoryPayload = {
      name: form.name.trim(),
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      is_public: form.isPublic,
      city: form.city.trim() || null,
      short_description: form.shortDescription.trim() || null,
      description: form.description.trim() || null,
      logo_url: form.logoUrl,
      cover_url: form.coverUrl,
      ...(canToggleActive ? { is_active: form.isActive } : {}),
    };
    try {
      await save.run(() => (factory ? factoriesApi.update(factory.id, payload) : factoriesApi.create(payload)));
      toast.success(factory ? tr("O'zgarishlar saqlandi") : tr("Yangi fabrika qo'shildi"));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const busy = save.busy;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{factory ? tr("Fabrikani tahrirlash") : tr("Yangi fabrika")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label={tr("Nomi")} value={form.name} onChange={(e) => set('name', e.target.value)} required autoFocus />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr 1fr' } }}>
              <TextField label={tr("Shahar")} value={form.city} onChange={(e) => set('city', e.target.value)} placeholder={tr("Toshkent")} />
              <TextField label={tr("Manzil")} value={form.address} onChange={(e) => set('address', e.target.value)} />
              <TextField label={tr("Telefon")} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </Box>
            {canToggleActive && (
              <FormControlLabel
                control={<Switch checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />}
                label={tr("Faol")}
              />
            )}

            <Divider />
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {tr("Mijozlar katalogidagi profil")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tr("Mijozlar zavodni katalogda shu ma'lumotlar orqali ko'radi. Katalogda faqat narxi kiritilgan \"Faol\" mahsulotlar ko'rsatiladi.")}
              </Typography>
            </Box>
            <FormControlLabel
              control={<Switch checked={form.isPublic} onChange={(e) => set('isPublic', e.target.checked)} />}
              label={tr("Katalogda ko'rsatish")}
            />
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              <ImageUpload label={tr("Logo")} value={form.logoUrl} onChange={(v) => set('logoUrl', v)} width={120} hint={tr("Kvadrat rasm")} />
              <Box sx={{ flex: '1 1 280px' }}>
                <ImageUpload
                  label={tr("Muqova rasmi (zavod, sex yoki mahsulotlar)")}
                  value={form.coverUrl}
                  onChange={(v) => set('coverUrl', v)}
                  aspectRatio={16 / 7}
                  width="100%"
                  hint={tr("Kenglikka cho'zilgan rasm, masalan 1600×700")}
                />
              </Box>
            </Box>
            <TextField
              label={tr("Qisqa tavsif")}
              value={form.shortDescription}
              onChange={(e) => set('shortDescription', e.target.value)}
              placeholder={tr("Masalan: Paxtadan erkaklar va bolalar futbolkalari, polo va hudilar")}
              slotProps={{ htmlInput: { maxLength: SHORT_MAX } }}
              helperText={tr("Katalog kartasida ko'rinadi · {0}/{1}", form.shortDescription.length, SHORT_MAX)}
            />
            <TextField
              label={tr("Batafsil ma'lumot")}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              multiline
              minRows={3}
              placeholder={tr("Tajriba, ishlab chiqarish quvvati, xomashyo, minimal buyurtma, yetkazib berish...")}
              slotProps={{ htmlInput: { maxLength: 3000 } }}
              helperText={tr("Zavod sahifasining yuqorisida ko'rinadi")}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={form.name.trim().length < 2} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

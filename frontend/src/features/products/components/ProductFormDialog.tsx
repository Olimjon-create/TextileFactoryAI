import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import ImageUpload from '@/shared/components/ImageUpload';
import type { Factory } from '@/shared/types';
import { productsApi } from '../api';
import {
  COLOR_SUGGESTIONS,
  keysOf,
  PRODUCT_STATUS_LABELS,
  PRODUCTION_UNIT_LABELS,
  SIZE_SUGGESTIONS,
} from '../constants';
import type { Product, ProductionUnit, ProductPayload, ProductStatus } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: (product: Product) => void;
}

const CODE_RE = /^[A-Z0-9][A-Z0-9._-]{1,49}$/;

const emptyForm = {
  name: '',
  code: '',
  category: '',
  description: '',
  sizes: [] as string[],
  colors: [] as string[],
  unit: 'PIECE' as ProductionUnit,
  status: 'DRAFT' as ProductStatus,
  factory_id: '' as number | '',
  price: '',
  image_url: null as string | null,
  model_image_url: null as string | null,
};

function VariantInput({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string[];
  options: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      options={options.filter((o) => !value.includes(o))}
      value={value}
      onChange={(_, v) => onChange(Array.from(new Set((v as string[]).map((s) => s.trim()).filter(Boolean))))}
      renderTags={(tags, getTagProps) =>
        tags.map((tag, index) => {
          const { key, ...rest } = getTagProps({ index });
          return <Chip key={key} label={tag} size="small" {...rest} />;
        })
      }
      renderInput={(params) => (
        <TextField {...params} label={label} placeholder={tr("Tanlang yoki yozib Enter bosing")} />
      )}
    />
  );
}

export default function ProductFormDialog({ open, product, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [form, setForm] = useState(emptyForm);
  const [categories, setCategories] = useState<string[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setForm(
      product
        ? {
            name: product.name,
            code: product.code,
            category: product.category,
            description: product.description ?? '',
            sizes: product.sizes,
            colors: product.colors,
            unit: product.unit,
            status: product.status,
            factory_id: product.factory_id,
            price: product.price !== null ? String(product.price) : '',
            image_url: product.image_url,
            model_image_url: product.model_image_url,
          }
        : emptyForm,
    );
    productsApi.categories().then(setCategories).catch(() => undefined);
    if (isSuperAdmin && !product) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [open, product, isSuperAdmin, save.reset]);

  const code = form.code.trim().toUpperCase();
  const codeError = form.code !== '' && !CODE_RE.test(code);
  const needsFactory = isSuperAdmin && !product;
  const priceNumber = form.price.trim() === '' ? null : Number(form.price.replace(/\s/g, '').replace(',', '.'));
  const priceError = priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 0);
  const valid =
    form.name.trim().length >= 2 &&
    CODE_RE.test(code) &&
    form.category.trim().length >= 2 &&
    !priceError &&
    (!needsFactory || form.factory_id !== '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: ProductPayload = {
      name: form.name.trim(),
      code,
      category: form.category.trim(),
      description: form.description.trim() || null,
      sizes: form.sizes,
      colors: form.colors,
      unit: form.unit,
      status: form.status,
      price: priceNumber,
      image_url: form.image_url,
      model_image_url: form.model_image_url,
    };
    if (needsFactory) payload.factory_id = Number(form.factory_id);
    try {
      const saved = await save.run(() => (product ? productsApi.update(product.id, payload) : productsApi.create(payload)));
      toast.success(product ? tr("O'zgarishlar saqlandi") : tr("Yangi mahsulot qo'shildi"));
      onSaved(saved);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{product ? tr("Mahsulotni tahrirlash") : tr("Yangi mahsulot")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && (
              <TextField
                select
                label={tr("Fabrika")}
                value={form.factory_id}
                onChange={(e) => setForm({ ...form, factory_id: Number(e.target.value) })}
                required
              >
                {factories.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' } }}>
              <TextField label={tr("Mahsulot nomi")} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
              <TextField
                label={tr("Kod (artikul)")}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                required
                error={codeError}
                helperText={codeError ? tr("Lotin harflari, raqam, '-', '_', '.'") : tr("Masalan: TS-001")}
              />
            </Box>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' } }}>
              <Autocomplete
                freeSolo
                options={categories}
                inputValue={form.category}
                onInputChange={(_, v) => setForm((f) => ({ ...f, category: v }))}
                renderInput={(params) => <TextField {...params} label={tr("Kategoriya")} required placeholder={tr("Futbolka, ko'ylak, shim...")} />}
              />
              <TextField select label={tr("Ishlab chiqarish birligi")} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value as ProductionUnit })}>
                {keysOf(PRODUCTION_UNIT_LABELS).map((u) => (
                  <MenuItem key={u} value={u}>
                    {PRODUCTION_UNIT_LABELS[u]}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select label={tr("Status")} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}>
                {keysOf(PRODUCT_STATUS_LABELS).map((s) => (
                  <MenuItem key={s} value={s}>
                    {PRODUCT_STATUS_LABELS[s]}
                  </MenuItem>
                ))}
              </TextField>
            </Box>
            <VariantInput label={tr("O'lchamlar")} value={form.sizes} options={SIZE_SUGGESTIONS} onChange={(sizes) => setForm((f) => ({ ...f, sizes }))} />
            <VariantInput label={tr("Ranglar")} value={form.colors} options={COLOR_SUGGESTIONS} onChange={(colors) => setForm((f) => ({ ...f, colors }))} />
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <ImageUpload
                label={tr("Mahsulot rasmi")}
                value={form.image_url}
                onChange={(image_url) => setForm((f) => ({ ...f, image_url }))}
                width={140}
                hint={tr("Kiyimning o'zi")}
              />
              <ImageUpload
                label={tr("Odam ustida")}
                value={form.model_image_url}
                onChange={(model_image_url) => setForm((f) => ({ ...f, model_image_url }))}
                width={140}
                aspectRatio={3 / 4}
                hint={tr("Model kiyib turgan surat")}
              />
              <Stack spacing={2} sx={{ flex: '1 1 300px' }}>
                <TextField
                  label={tr("Narxi (1 {0} uchun)", PRODUCTION_UNIT_LABELS[form.unit].toLowerCase())}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  error={priceError}
                  helperText={
                    priceError
                      ? tr("Narx musbat son bo'lishi kerak")
                      : tr("Katalogda faqat narxi kiritilgan va statusi \"Faol\" mahsulotlar ko'rinadi")
                  }
                  slotProps={{
                    htmlInput: { inputMode: 'decimal' },
                    input: { endAdornment: <InputAdornment position="end">{tr("so'm")}</InputAdornment> },
                  }}
                />
                <TextField
                  label={tr("Tavsif")}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  multiline
                  minRows={3}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                />
              </Stack>
            </Box>
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

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { customersApi } from '@/features/customers/api';
import type { Customer } from '@/features/customers/types';
import { productsApi } from '@/features/products/api';
import type { ProductListItem } from '@/features/products/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { formatMoney } from '@/shared/utils/money';
import { ordersApi } from '../api';
import type { Order } from '../types';
import { tr } from '@/i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (order: Order) => void;
}

interface Line {
  key: number;
  product: ProductListItem | null;
  size: string;
  color: string;
  quantity: string;
  price: string;
}

let nextKey = 1;
const emptyLine = (): Line => ({ key: nextKey++, product: null, size: '', color: '', quantity: '', price: '' });
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')));
const today = () => new Date().toISOString().slice(0, 10);

/** Menejer CRM'dagi mijoz uchun buyurtma kiritadi (B2B). Mahsulot, variant va narx katalogdan olinadi. */
export default function CreateOrderDialog({ open, onClose, onSaved }: Props) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [dueDate, setDueDate] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setCustomer(null);
    setLines([emptyLine()]);
    setDueDate('');
    setAddress('');
    setComment('');
    setSubmitted(false);
    setError('');
  }, [open, save.reset]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      customersApi
        .list({ search: customerQuery.trim(), limit: 20 })
        .then((r) => setCustomers(r.items.filter((c) => c.status !== 'INACTIVE')))
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [open, customerQuery]);

  // Mahsulotlar — faqat mijoz zavodining sotuvdagi (faol) mahsulotlari
  useEffect(() => {
    if (!customer) {
      setProducts([]);
      return;
    }
    productsApi.list({ status: 'ACTIVE', factory_id: customer.factory_id }).then(setProducts).catch(() => setProducts([]));
    setAddress((a) => a || customer.address || '');
  }, [customer]);

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const lineErrors = lines.map((l) => {
    const qty = num(l.quantity);
    const price = num(l.price);
    return {
      product: !l.product ? tr("Mahsulotni tanlang") : '',
      size: l.product && l.product.sizes.length > 0 && !l.size ? "O'lchamni tanlang" : '',
      color: l.product && l.product.colors.length > 0 && !l.color ? 'Rangni tanlang' : '',
      quantity: qty === null || !Number.isInteger(qty) || qty < 1 ? tr("Butun son (≥ 1)") : '',
      price: price === null ? (l.product && l.product.price === null ? tr("Narx kiriting") : '') : !Number.isFinite(price) || price < 0 ? tr("Noto'g'ri narx") : '',
    };
  });
  const dueError = dueDate !== '' && dueDate < today() ? tr("O'tgan sana bo'lmasin") : '';
  const valid = !!customer && !dueError && lineErrors.every((e) => Object.values(e).every((v) => !v));

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const qty = num(l.quantity) ?? 0;
        const price = num(l.price) ?? l.product?.price ?? 0;
        return sum + (Number.isFinite(qty * price) ? qty * price : 0);
      }, 0),
    [lines],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid || !customer) return;
    setError('');
    try {
      const order = await save.run(() =>
        ordersApi.create({
          customer_id: customer.id,
          items: lines.map((l) => ({
            product_id: l.product!.id,
            quantity: num(l.quantity)!,
            size: l.size || null,
            color: l.color || null,
            unit_price: num(l.price),
          })),
          due_date: dueDate || null,
          delivery_address: address.trim() || null,
          comment: comment.trim() || null,
        }),
      );
      toast.success(tr("Buyurtma {0} kiritildi", order.order_number));
      onSaved(order);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const show = (msg: string) => (submitted ? msg : '');

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit} noValidate>
        <DialogTitle>{tr("Yangi buyurtma")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Autocomplete
              options={customers}
              value={customer}
              onChange={(_, c) => {
                setCustomer(c);
                setLines([emptyLine()]);
              }}
              onInputChange={(_, v, reason) => reason === 'input' && setCustomerQuery(v)}
              getOptionLabel={(c) => `${c.name} · ${c.customer_code}`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={(x) => x}
              noOptionsText={tr("Mijoz topilmadi — avval «Mijozlar» bo'limida qo'shing")}
              renderOption={(props, c) => (
                <li {...props} key={c.id}>
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[c.customer_code, c.phone, c.factory?.name].filter(Boolean).join(' · ')}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} label={tr("Mijoz (CRM)")} required error={submitted && !customer} helperText={show(!customer ? tr("Mijozni tanlang") : '')} />
              )}
            />

            <Divider textAlign="left">
              <Typography variant="body2" color="text.secondary">
                {tr("Mahsulotlar")}
              </Typography>
            </Divider>
            {lines.map((l, i) => {
              const err = lineErrors[i];
              return (
                <Box
                  key={l.key}
                  sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: '2.4fr 1fr 1fr 0.9fr 1.2fr auto' }, alignItems: 'start' }}
                >
                  <Autocomplete
                    sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
                    options={products}
                    value={l.product}
                    disabled={!customer}
                    onChange={(_, p) => setLine(l.key, { product: p, size: '', color: '', price: p?.price != null ? String(p.price) : '' })}
                    getOptionLabel={(p) => `${p.code} — ${p.name}`}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    noOptionsText={tr("Faol mahsulot yo'q")}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={tr("Mahsulot")}
                        size="small"
                        error={!!show(err.product)}
                        helperText={!customer ? tr("Avval mijozni tanlang") : show(err.product) || (l.product && l.product.bom_items_count === 0 ? tr("BOM yo'q — material hisoblanmaydi") : undefined)}
                      />
                    )}
                  />
                  <TextField select size="small" label={tr("O'lcham")} value={l.size} onChange={(e) => setLine(l.key, { size: e.target.value })} disabled={!l.product?.sizes.length} error={!!show(err.size)}>
                    {(l.product?.sizes ?? []).map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField select size="small" label={tr("Rang")} value={l.color} onChange={(e) => setLine(l.key, { color: e.target.value })} disabled={!l.product?.colors.length} error={!!show(err.color)}>
                    {(l.product?.colors ?? []).map((c) => (
                      <MenuItem key={c} value={c}>
                        {c}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    label={tr("Soni")}
                    value={l.quantity}
                    onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                    inputMode="numeric"
                    error={!!show(err.quantity) || (l.quantity !== '' && !!err.quantity)}
                    helperText={l.quantity !== '' ? err.quantity || undefined : show(err.quantity) || undefined}
                  />
                  <TextField
                    size="small"
                    label={tr("Narx (1 dona)")}
                    value={l.price}
                    onChange={(e) => setLine(l.key, { price: e.target.value })}
                    inputMode="decimal"
                    error={!!err.price && (submitted || l.price !== '')}
                    helperText={(submitted || l.price !== '') && err.price ? err.price : undefined}
                    slotProps={{ input: { endAdornment: <InputAdornment position="end">{tr("so'm")}</InputAdornment> } }}
                  />
                  <IconButton aria-label={tr("Qatorni o'chirish")} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={lines.length === 1} sx={{ mt: 0.25 }}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              );
            })}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Button startIcon={<AddIcon />} onClick={() => setLines((ls) => [...ls, emptyLine()])} disabled={!customer || lines.length >= 200}>
                {tr("Qator qo'shish")}
              </Button>
              <Typography sx={{ fontWeight: 700 }}>{tr("Jami:")}{' '}{formatMoney(total)}</Typography>
            </Box>

            <Divider />
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 2fr' } }}>
              <TextField
                type="date"
                label={tr("Topshirish muddati")}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                error={!!dueError}
                helperText={dueError || tr("Kechikayotgan buyurtmalar shu bo'yicha aniqlanadi")}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today() } }}
              />
              <TextField label={tr("Yetkazib berish manzili")} value={address} onChange={(e) => setAddress(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
            </Box>
            <TextField label={tr("Izoh")} value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} placeholder={tr("Logotip, qadoqlash talablari, partiyalar...")} slotProps={{ htmlInput: { maxLength: 2000 } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status}>{tr("Buyurtmani kiritish")}</SaveButton>
        </DialogActions>
      </form>
    </Dialog>
  );
}

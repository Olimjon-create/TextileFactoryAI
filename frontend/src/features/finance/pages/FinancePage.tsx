import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import { useToast } from '@/shared/components/Toast';
import type { Factory } from '@/shared/types';
import { downloadCsv, today } from '@/shared/utils/csv';
import { formatDate } from '@/shared/utils/dates';
import { formatMoney, formatMoneyShort } from '@/shared/utils/money';
import { financeApi, type ExpenseCategory, type ProfitLoss } from '../api';
import { tr } from '@/i18n';

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: tr('Ijara'),
  UTILITIES: tr('Kommunal (svet, gaz, suv)'),
  TAX: tr('Soliq va yig\'imlar'),
  TRANSPORT: tr('Transport va yetkazish'),
  MAINTENANCE: tr("Ta'mirlash va ehtiyot qismlar"),
  MARKETING: tr('Reklama'),
  OFFICE: tr('Ofis va xo\'jalik'),
  OTHER: tr('Boshqa'),
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function AddExpenseDialog({ open, month, factoryId, onClose, onSaved }: { open: boolean; month: string; factoryId: number | ''; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState<ExpenseCategory>('RENT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = today();
    setDate(now.startsWith(month) ? now : `${month}-01`);
    setAmount('');
    setNote('');
    setError('');
  }, [open, month]);

  const value = Number(amount.replace(/\s/g, '').replace(',', '.'));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!(value > 0) || !date) return;
    setBusy(true);
    setError('');
    try {
      await financeApi.addExpense({ expense_date: date, category, amount: value, note: note.trim() || null, factory_id: factoryId || null });
      toast.success(tr("Xarajat qo'shildi"));
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{tr("Xarajat qo'shish")}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField select label={tr('Turi')} value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
            {(Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[]).map((k) => (
              <MenuItem key={k} value={k}>{EXPENSE_CATEGORY_LABELS[k]}</MenuItem>
            ))}
          </TextField>
          <TextField label={tr("Summa (so'm)")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus />
          <TextField type="date" label={tr('Sana')} value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label={tr('Izoh')} value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 300 }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose}>{tr('Bekor qilish')}</Button>
          <Button type="submit" variant="contained" disabled={busy || !(value > 0)}>{tr('Saqlash')}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default function FinancePage() {
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [month, setMonth] = useState(currentMonth);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [factories, setFactories] = useState<Factory[]>([]);
  const [data, setData] = useState<ProfitLoss | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (isSuper) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [isSuper]);

  const load = useCallback(() => {
    if (!month) return;
    setError('');
    financeApi.profitLoss(month, factoryId).then(setData).catch((e) => setError(getErrorMessage(e)));
  }, [month, factoryId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const remove = async (id: number) => {
    try {
      await financeApi.deleteExpense(id);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const exportCsv = () =>
    data &&
    downloadCsv(
      `foyda-zarar-${month}`,
      [tr("Ko'rsatkich"), tr("Summa (so'm)")],
      [
        [tr('Tushum (to\'langan buyurtmalar)'), data.revenue],
        [tr('Materiallar (ishlab chiqarishga chiqim)'), -data.materials],
        [tr('Ish haqi (hisoblangan)'), -data.payroll],
        ...data.expenses_by_category.map((c) => [EXPENSE_CATEGORY_LABELS[c.category], -c.amount]),
      ],
      [tr('Sof foyda'), data.profit],
    );

  const costRows = data
    ? [
        { label: tr('Materiallar'), value: data.materials, hint: tr('Ishlab chiqarishga chiqarilgan va hisobdan chiqarilgan materiallar') },
        { label: tr('Ish haqi'), value: data.payroll, hint: tr("Shu oy uchun hisoblangan ish haqi (bonus va jarimalar bilan)") },
        ...data.expenses_by_category.map((c) => ({ label: EXPENSE_CATEGORY_LABELS[c.category], value: c.amount, hint: '' })),
      ]
    : [];
  const maxCost = Math.max(1, ...costRows.map((r) => r.value));

  return (
    <>
      <PageHeader
        title={tr('Foyda va xarajatlar')}
        subtitle={tr('Oylik foyda-zarar: tushum, material, ish haqi va boshqa xarajatlar')}
        action={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={exportCsv} disabled={!data}>
              {tr('Excel')}
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)} disabled={isSuper && !factoryId}>
              {tr('Xarajat')}
            </Button>
          </Box>
        }
      />

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField size="small" fullWidth={false} type="month" label={tr('Oy')} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        {isSuper && (
          <TextField select size="small" fullWidth={false} label={tr('Zavod')} value={factoryId} onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 200 }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}>
            <MenuItem value="">{tr('Barchasi')}</MenuItem>
            {factories.map((f) => (
              <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
            ))}
          </TextField>
        )}
        {isSuper && !factoryId && (
          <Typography variant="caption" color="text.secondary">{tr("Xarajat qo'shish uchun zavodni tanlang")}</Typography>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {!!data?.payroll_missing_rate && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {tr("{0} ta xodimning stavkasi kiritilmagan — ish haqi xarajati to'liq emas.", data.payroll_missing_rate)}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2 }}>
        <StatCard label={tr('Tushum')} value={data ? formatMoneyShort(data.revenue) : '…'} icon={<TrendingUpIcon />} color="success.main" hint={data ? tr('{0} ta buyurtma', data.orders) : undefined} />
        <StatCard label={tr('Jami xarajatlar')} value={data ? formatMoneyShort(data.total_costs) : '…'} icon={<TrendingDownIcon />} color="error.main" />
        <StatCard label={tr('Sof foyda')} value={data ? formatMoneyShort(data.profit) : '…'} icon={<AccountBalanceWalletOutlinedIcon />} color={data && data.profit < 0 ? 'error.main' : 'primary.main'}
          hint={data?.margin_pct != null ? tr('Rentabellik: {0}%', data.margin_pct) : undefined} />
        <StatCard label={tr('Boshqa xarajatlar')} value={data ? formatMoneyShort(data.expenses) : '…'} icon={<ReceiptLongOutlinedIcon />} color="warning.main" hint={data ? tr('{0} ta yozuv', data.items.length) : undefined} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1.3fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>{tr('Xarajatlar tarkibi')}</Typography>
            {!data ? (
              <Skeleton variant="rounded" height={200} />
            ) : costRows.every((r) => !r.value) ? (
              <Typography color="text.secondary">{tr("Bu oyda xarajat yo'q")}</Typography>
            ) : (
              costRows.filter((r) => r.value).map((r) => (
                <Tooltip key={r.label} title={r.hint} placement="top-start" disableHoverListener={!r.hint}>
                  <Box sx={{ mb: 1.75 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.label}</Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                        {formatMoney(r.value)}
                        {data.total_costs ? ` · ${((r.value / data.total_costs) * 100).toFixed(0)}%` : ''}
                      </Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={(r.value / maxCost) * 100} sx={{ height: 8, borderRadius: 4 }} color="error" />
                  </Box>
                </Tooltip>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ pb: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{tr('Kiritilgan xarajatlar')}</Typography>
          </CardContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{tr('Sana')}</TableCell>
                  <TableCell>{tr('Turi')}</TableCell>
                  <TableCell>{tr('Izoh')}</TableCell>
                  <TableCell align="right">{tr('Summa')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.items.map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(e.expense_date)}</TableCell>
                    <TableCell>{EXPENSE_CATEGORY_LABELS[e.category]}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{e.note || '—'}</Typography>
                      {e.created_by_name && <Typography variant="caption" color="text.secondary">{e.created_by_name}</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatMoney(e.amount)}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => remove(e.id)} aria-label={tr("O'chirish")}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {data && data.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                      {tr("Hali xarajat kiritilmagan — «Xarajat» tugmasi orqali ijara, kommunal va boshqalarni qo'shing")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      </Box>

      <AddExpenseDialog open={adding} month={month} factoryId={factoryId} onClose={() => setAdding(false)} onSaved={load} />
    </>
  );
}

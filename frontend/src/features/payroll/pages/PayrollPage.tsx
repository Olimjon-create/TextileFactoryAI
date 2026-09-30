import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { DEPARTMENT_LABELS, PAY_TYPE_LABELS } from '@/features/resources/constants';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import StatCard from '@/shared/components/StatCard';
import { useToast } from '@/shared/components/Toast';
import type { Factory } from '@/shared/types';
import { downloadCsv } from '@/shared/utils/csv';
import { formatDate, formatDateTime } from '@/shared/utils/dates';
import { formatMoney, formatMoneyShort } from '@/shared/utils/money';
import { payrollApi, type Adjustment, type AdjustmentKind, type PayrollReport, type PayrollRow } from '../api';
import { printPayslip } from '../payslip';
import { intlLocale, tr } from '@/i18n';

const KIND_LABELS: Record<AdjustmentKind, string> = {
  BONUS: tr('Bonus'),
  DEDUCTION: tr('Jarima / ushlab qolish'),
  ADVANCE: tr('Avans'),
};

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(intlLocale(), { month: 'long', year: 'numeric' });
};

function workText(r: PayrollRow): string {
  if (r.pay_type === 'PIECE') return tr('{0} dona', r.pieces.toLocaleString(intlLocale()));
  if (r.pay_type === 'HOURLY') return tr('{0} soat', r.hours.toLocaleString(intlLocale()));
  return r.absent_days ? tr('{0} kun keldi · {1} kun kelmadi', r.present_days, r.absent_days) : tr('{0} kun keldi', r.present_days);
}

const money = (v: number) => (v ? formatMoney(v) : '—');

function AdjustDialog({ row, month, onClose, onChanged }: { row: PayrollRow | null; month: string; onClose: () => void; onChanged: () => void }) {
  const [items, setItems] = useState<Adjustment[] | null>(null);
  const [kind, setKind] = useState<AdjustmentKind>('BONUS');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const paid = !!row?.payment_id;

  const load = useCallback(() => {
    if (!row) return;
    setItems(null);
    payrollApi.adjustments(month, row.employee_id).then(setItems).catch((e) => setError(getErrorMessage(e)));
  }, [row, month]);

  useEffect(() => {
    setError('');
    setAmount('');
    setNote('');
    load();
  }, [load]);

  const value = Number(amount.replace(/\s/g, '').replace(',', '.'));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!row || !(value > 0)) return;
    setBusy(true);
    setError('');
    try {
      await payrollApi.addAdjustment({ employee_id: row.employee_id, month, kind, amount: value, note: note.trim() || null });
      setAmount('');
      setNote('');
      load();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    setError('');
    try {
      await payrollApi.deleteAdjustment(id);
      load();
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={!!row} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        {row?.full_name}
        <Typography variant="body2" color="text.secondary">
          {monthTitle(month)} · {row && PAY_TYPE_LABELS[row.pay_type]} · {row && workText(row)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {row && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 0.5, mb: 2 }}>
            <Typography variant="body2" color="text.secondary">{tr('Hisoblangan')}</Typography>
            <Typography variant="body2" sx={{ textAlign: 'right' }}>{formatMoney(row.base)}</Typography>
            <Typography variant="body2" color="text.secondary">{tr('Bonus')}</Typography>
            <Typography variant="body2" sx={{ textAlign: 'right', color: 'success.main' }}>+{formatMoney(row.bonus)}</Typography>
            <Typography variant="body2" color="text.secondary">{tr('Jarima / ushlab qolish')}</Typography>
            <Typography variant="body2" sx={{ textAlign: 'right', color: 'error.main' }}>−{formatMoney(row.deduction)}</Typography>
            <Typography variant="body2" color="text.secondary">{tr('Avans')}</Typography>
            <Typography variant="body2" sx={{ textAlign: 'right' }}>−{formatMoney(row.advance)}</Typography>
            <Typography sx={{ fontWeight: 700 }}>{tr("To'lanadi")}</Typography>
            <Typography sx={{ fontWeight: 700, textAlign: 'right' }}>{formatMoney(row.to_pay)}</Typography>
          </Box>
        )}
        <Divider sx={{ mb: 1.5 }} />
        {items === null ? (
          <Skeleton height={60} />
        ) : items.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{tr("Bu oy uchun bonus, jarima yoki avans yo'q")}</Typography>
        ) : (
          <Box sx={{ mb: 2 }}>
            {items.map((a) => (
              <Box key={a.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                <Chip size="small" label={KIND_LABELS[a.kind]} color={a.kind === 'BONUS' ? 'success' : a.kind === 'DEDUCTION' ? 'error' : 'default'} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {a.note || '—'} <Typography component="span" variant="caption" color="text.secondary">· {formatDate(a.created_at)}</Typography>
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{formatMoney(a.amount)}</Typography>
                {!paid && (
                  <IconButton size="small" onClick={() => remove(a.id)} aria-label={tr("O'chirish")}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            ))}
          </Box>
        )}
        {paid ? (
          <Alert severity="info">{tr("Ish haqi to'langan — o'zgartirish uchun avval to'lovni bekor qiling")}</Alert>
        ) : (
          <Box component="form" onSubmit={add} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <TextField select size="small" label={tr('Turi')} value={kind} onChange={(e) => setKind(e.target.value as AdjustmentKind)}>
              {(Object.keys(KIND_LABELS) as AdjustmentKind[]).map((k) => (
                <MenuItem key={k} value={k}>{KIND_LABELS[k]}</MenuItem>
              ))}
            </TextField>
            <TextField size="small" label={tr("Summa (so'm)")} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            <TextField size="small" label={tr('Izoh')} value={note} onChange={(e) => setNote(e.target.value)} inputProps={{ maxLength: 300 }} sx={{ gridColumn: { sm: '1 / -1' } }} />
            <Button type="submit" variant="contained" disabled={busy || !(value > 0)} sx={{ gridColumn: { sm: '1 / -1' } }}>
              {tr("Qo'shish")}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {row && (
          <Button startIcon={<PrintOutlinedIcon />} onClick={() => items && printPayslip(row, month, items)} disabled={!items}>
            {tr('Hisob varaqasi')}
          </Button>
        )}
        <Button onClick={onClose}>{tr('Yopish')}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PayrollPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isMobile = useIsMobile();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [month, setMonth] = useState(currentMonth);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [factories, setFactories] = useState<Factory[]>([]);
  const [data, setData] = useState<PayrollReport | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  const [paying, setPaying] = useState<PayrollRow | null>(null);
  const [cancelling, setCancelling] = useState<PayrollRow | null>(null);
  const [sendingSlips, setSendingSlips] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isSuper) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [isSuper]);

  const load = useCallback(() => {
    if (!month) return;
    setError('');
    payrollApi
      .report(month, factoryId)
      .then((r) => {
        setData(r);
        setEditing((cur) => (cur ? r.rows.find((x) => x.employee_id === cur.employee_id) ?? null : null));
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [month, factoryId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const confirmPay = async () => {
    if (!paying) return;
    setBusy(true);
    try {
      await payrollApi.pay(paying.employee_id, month);
      toast.success(tr("{0}: ish haqi to'landi", paying.full_name));
      setPaying(null);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
      setPaying(null);
    } finally {
      setBusy(false);
    }
  };

  const confirmSendSlips = async () => {
    setBusy(true);
    try {
      const r = await payrollApi.sendPayslips(month, factoryId);
      toast.success(
        r.not_linked
          ? tr("{0} ta xodimga yuborildi, {1} tasi botga ulanmagan", r.sent, r.not_linked)
          : tr("{0} ta xodimga yuborildi", r.sent),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
      setSendingSlips(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelling?.payment_id) return;
    setBusy(true);
    try {
      await payrollApi.cancelPayment(cancelling.payment_id);
      setCancelling(null);
      load();
    } catch (err) {
      setError(getErrorMessage(err));
      setCancelling(null);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () =>
    data &&
    downloadCsv(
      `ish-haqi-${month}`,
      [tr('Kod'), tr('Xodim'), tr("Bo'lim"), tr('Turi'), tr('Stavka'), tr('Ish hajmi'), tr('Hisoblangan'), tr('Bonus'), tr('Jarima / ushlab qolish'), tr('Avans'), tr("To'lanadi"), tr('Holati')],
      data.rows.map((r) => [
        r.employee_code, r.full_name, DEPARTMENT_LABELS[r.department], PAY_TYPE_LABELS[r.pay_type], r.pay_rate, workText(r),
        r.base, r.bonus, r.deduction, r.advance, r.to_pay, r.payment_id ? tr("To'landi") : tr("To'lanmagan"),
      ]),
      ['', tr('Jami'), '', '', '', '', data.totals.base, data.totals.bonus, data.totals.deduction, data.totals.advance, data.totals.to_pay, ''],
    );

  return (
    <>
      <PageHeader
        title={tr('Ish haqi')}
        subtitle={tr("Oylik, soatbay va ishbay ish haqi — davomat va ishlab chiqarish jurnalidan avtomatik hisoblanadi")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" color="inherit" startIcon={<TelegramIcon />} onClick={() => setSendingSlips(true)} disabled={!data || data.rows.length === 0}>
              {tr('Hisob varaqalarini botga yuborish')}
            </Button>
            <Button variant="outlined" color="inherit" startIcon={<FileDownloadOutlinedIcon />} onClick={exportCsv} disabled={!data}>
              {tr('Excel')}
            </Button>
          </Box>
        }
      />

      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <TextField size="small" fullWidth={false} type="month" label={tr('Oy')} value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        {isSuper && (
          <TextField select size="small" fullWidth={false} label={tr('Zavod')} value={factoryId} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 200 }}>
            <MenuItem value="">{tr('Barchasi')}</MenuItem>
            {factories.map((f) => (
              <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {!!data?.totals.missing_rate && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {tr("{0} ta xodimning stavkasi kiritilmagan — ularga ish haqi hisoblanmadi. Xodimlar bo'limida stavkani kiriting.", data.totals.missing_rate)}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2 }}>
        <StatCard label={tr('Xodimlar')} value={data ? data.totals.employees : '…'} icon={<GroupsOutlinedIcon />} />
        <StatCard label={tr("Jami to'lanadi")} value={data ? formatMoneyShort(data.totals.to_pay) : '…'} icon={<PaymentsOutlinedIcon />} color="info.main" />
        <StatCard label={tr("To'langan")} value={data ? formatMoneyShort(data.totals.paid) : '…'} icon={<CheckCircleOutlineIcon />} color="success.main" />
        <StatCard label={tr("To'lanmagan")} value={data ? formatMoneyShort(data.totals.unpaid) : '…'} icon={<PendingActionsOutlinedIcon />} color="warning.main" />
      </Box>

      {isMobile ? (
        <Card>
          {data === null && <MobileListSkeleton rows={4} />}
          {data?.rows.map((r) => (
            <MobileListItem
              key={r.employee_id}
              overline={`${r.employee_code} · ${PAY_TYPE_LABELS[r.pay_type]}`}
              title={r.full_name}
              subtitle={`${workText(r)} · ${tr('Hisoblangan')}: ${money(r.base)}`}
              trailing={
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: r.to_pay < 0 ? 'error.main' : 'text.primary' }}>{formatMoney(r.to_pay)}</Typography>
                  {r.payment_id && <Chip size="small" color="success" label={tr("To'landi")} onClick={() => setCancelling(r)} sx={{ mt: 0.5 }} />}
                </Box>
              }
              meta={(r.bonus || r.deduction || r.advance) ? `${tr('Bonus')}: ${money(r.bonus)} · ${tr('Jarima')}: ${money(r.deduction)} · ${tr('Avans')}: ${money(r.advance)}` : undefined}
              actions={
                <>
                  <Button size="small" startIcon={<TuneIcon />} onClick={() => setEditing(r)}>{tr('Bonus, jarima, avans')}</Button>
                  {!r.payment_id && (
                    <Button size="small" variant="contained" disabled={r.to_pay <= 0} onClick={() => setPaying(r)}>{tr("To'lash")}</Button>
                  )}
                </>
              }
            />
          ))}
          {data?.rows.length === 0 && <MobileListEmpty>{tr("Xodimlar yo'q — avval Xodimlar bo'limida xodim qo'shing")}</MobileListEmpty>}
        </Card>
      ) : (
      <Card>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr('Xodim')}</TableCell>
                <TableCell>{tr('Turi')}</TableCell>
                <TableCell>{tr('Ish hajmi')}</TableCell>
                <TableCell align="right">{tr('Hisoblangan')}</TableCell>
                <TableCell align="right">{tr('Bonus')}</TableCell>
                <TableCell align="right">{tr('Jarima')}</TableCell>
                <TableCell align="right">{tr('Avans')}</TableCell>
                <TableCell align="right">{tr("To'lanadi")}</TableCell>
                <TableCell align="center">{tr('Holati')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {data === null
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={10}><Skeleton /></TableCell>
                    </TableRow>
                  ))
                : data.rows.map((r) => (
                    <TableRow key={r.employee_id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.full_name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {r.employee_code} · {r.position || DEPARTMENT_LABELS[r.department]}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{PAY_TYPE_LABELS[r.pay_type]}</Typography>
                        <Typography variant="caption" color={r.pay_rate == null ? 'error' : 'text.secondary'}>
                          {r.pay_rate == null ? tr('stavka yo\'q') : formatMoney(r.pay_rate)}
                        </Typography>
                      </TableCell>
                      <TableCell>{workText(r)}</TableCell>
                      <TableCell align="right">{money(r.base)}</TableCell>
                      <TableCell align="right" sx={{ color: r.bonus ? 'success.main' : 'text.disabled' }}>{r.bonus ? `+${formatMoney(r.bonus)}` : '—'}</TableCell>
                      <TableCell align="right" sx={{ color: r.deduction ? 'error.main' : 'text.disabled' }}>{r.deduction ? `−${formatMoney(r.deduction)}` : '—'}</TableCell>
                      <TableCell align="right">{r.advance ? `−${formatMoney(r.advance)}` : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: r.to_pay < 0 ? 'error.main' : 'text.primary' }}>
                        {formatMoney(r.to_pay)}
                      </TableCell>
                      <TableCell align="center">
                        {r.payment_id ? (
                          <Tooltip title={`${formatDateTime(r.paid_at ?? '')} · ${tr("bekor qilish uchun bosing")}`}>
                            <Chip size="small" color="success" label={tr("To'landi")} onClick={() => setCancelling(r)} />
                          </Tooltip>
                        ) : (
                          <Button size="small" variant="contained" disabled={r.to_pay <= 0} onClick={() => setPaying(r)}>
                            {tr("To'lash")}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={tr('Bonus, jarima, avans')}>
                          <IconButton size="small" onClick={() => setEditing(r)}>
                            <TuneIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
              {data?.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {tr("Xodimlar yo'q — avval Xodimlar bo'limida xodim qo'shing")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      )}

      <AdjustDialog row={editing} month={month} onClose={() => setEditing(null)} onChanged={load} />
      <ConfirmDialog
        open={!!paying}
        title={tr("Ish haqini to'lash")}
        message={paying ? tr("{0} uchun {1} oyi ish haqi {2} to'landi deb belgilansinmi?", paying.full_name, monthTitle(month), formatMoney(paying.to_pay)) : ''}
        confirmText={tr("To'landi")}
        loading={busy}
        onConfirm={confirmPay}
        onClose={() => setPaying(null)}
      />
      <ConfirmDialog
        open={!!cancelling}
        title={tr("To'lovni bekor qilish")}
        message={cancelling ? tr("{0}: {1} oyi to'lovi bekor qilinsinmi?", cancelling.full_name, monthTitle(month)) : ''}
        confirmText={tr('Bekor qilish')}
        loading={busy}
        onConfirm={confirmCancel}
        onClose={() => setCancelling(null)}
      />
      <ConfirmDialog
        open={sendingSlips}
        title={tr('Hisob varaqalarini yuborish')}
        message={tr("{0} oyi hisob varaqasi Telegram botga ulangan barcha xodimlarga yuborilsinmi?", monthTitle(month))}
        confirmText={tr('Yuborish')}
        loading={busy}
        onConfirm={confirmSendSlips}
        onClose={() => setSendingSlips(false)}
      />
    </>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, InputAdornment, MenuItem, Skeleton, Stack, TextField, Typography } from '@mui/material';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { useColorMode } from '@/app/ColorModeContext';
import { useAuth } from '@/features/auth/AuthContext';
import ChangePasswordDialog from '@/features/auth/components/ChangePasswordDialog';
import { telegramApi, type TelegramStatus } from '@/features/auth/api';
import LanguageSwitcher from '@/shared/components/LanguageSwitcher';
import { ROLE_LABELS } from '@/shared/constants/roles';
import { FINANCE_ROLES } from '../permissions';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import type { Factory } from '@/shared/types';
import { analyticsApi } from '../api';
import type { FactorySettings } from '../types';
import { tr } from '@/i18n';

type Form = Record<Exclude<keyof FactorySettings, 'factory_id'>, string>;

const FIELDS: { key: keyof Form; label: string; unit: string; hint: string; min: number; max: number }[] = [
  { key: 'overhead_percent', label: tr("Ustama xarajatlar"), unit: '%', hint: tr("Ijara, elektr, boshqaruv: material + ish haqi ustiga qo'shiladi"), min: 0, max: 500 },
  { key: 'monthly_work_hours', label: tr("Oylik ish soati"), unit: 'soat', hint: tr("Oylik maoshli xodimning soatlik narxi = oylik / shu soat"), min: 1, max: 744 },
  { key: 'defect_alert_percent', label: tr("Brak ogohlantirishi"), unit: '%', hint: tr("Ish buyurtmasida brak shundan oshsa — bildirishnoma"), min: 0, max: 100 },
  { key: 'low_margin_percent', label: tr("Past foyda chegarasi"), unit: '%', hint: tr("Buyurtma foydasi shundan past bo'lsa — ogohlantirish"), min: -100, max: 100 },
];

/** Sozlamalar: profil (hamma), zavod nomi (ega/admin) va moliyaviy sozlamalar (ega/menejer/admin) */
export default function SettingsPage() {
  const { hasRole } = useAuth();
  const canFinance = hasRole(...FINANCE_ROLES);
  const canTelegram = hasRole('SUPER_ADMIN', 'FACTORY_OWNER', 'MANAGER');
  return (
    <>
      <PageHeader title={tr("Sozlamalar")} subtitle={tr("Profilingiz, zavod ma'lumotlari va hisob-kitob sozlamalari")} />
      <Box sx={{ display: 'grid', gap: 2.5, maxWidth: 720 }}>
        <ProfileCard />
        <FactoryNameCard />
        {canTelegram && <TelegramCard />}
        {canFinance && <FinanceSettingsCard />}
      </Box>
    </>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h6">{title}</Typography>
      <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>{subtitle}</Typography>
    </Box>
  );
}

function ProfileCard() {
  const { user } = useAuth();
  const { mode, toggle } = useColorMode();
  const [passwordOpen, setPasswordOpen] = useState(false);
  if (!user) return null;
  const rows: [string, string][] = [
    [tr("Ism"), user.full_name],
    [tr("Email"), user.email],
    [tr("Rol"), ROLE_LABELS[user.role]],
    ...(user.factory ? ([[tr("Zavod"), user.factory.name]] as [string, string][]) : []),
  ];
  return (
    <Card>
      <CardContent>
        <SectionTitle title={tr("Profil")} subtitle={tr("Hisobingiz va shaxsiy sozlamalar")} />
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>
              {value}
            </Typography>
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
          <Button variant="outlined" startIcon={<LockResetRoundedIcon />} onClick={() => setPasswordOpen(true)}>
            {tr("Parolni o'zgartirish")}
          </Button>
          <Button variant="outlined" color="inherit" startIcon={mode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />} onClick={toggle}>
            {mode === 'dark' ? tr("Yorug' rejim") : tr("Qorong'i rejim")}
          </Button>
          <LanguageSwitcher sx={{ border: 1, borderColor: 'divider', px: 1.5 }} />
        </Box>
      </CardContent>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Card>
  );
}

/** Zavod nomi — sidebar'dagi logo tagida shu nom chiqadi. O'zgartirish: zavod egasi va super admin */
function FactoryNameCard() {
  const { user, refreshUser } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const canEdit = isSuper || user?.role === 'FACTORY_OWNER';
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<number | ''>(user?.factory?.id ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!isSuper) return;
    factoriesApi
      .list()
      .then((f) => {
        setFactories(f);
        setFactoryId((cur) => (cur === '' ? f[0]?.id ?? '' : cur));
      })
      .catch(() => undefined);
  }, [isSuper]);

  const current = isSuper ? factories.find((f) => f.id === factoryId)?.name : user?.factory?.name;
  useEffect(() => setName(current ?? ''), [current]);

  if (!canEdit || (!isSuper && !user?.factory)) return null;
  const trimmed = name.trim();
  const valid = factoryId !== '' && trimmed.length >= 2 && trimmed !== current;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      const saved = await save.run(() => factoriesApi.update(Number(factoryId), { name: trimmed }));
      setFactories((list) => list.map((f) => (f.id === saved.id ? saved : f)));
      await refreshUser();
      toast.success(tr("Zavod nomi yangilandi"));
      save.reset();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent component="form" onSubmit={submit} noValidate>
        <SectionTitle title={tr("Zavod")} subtitle={tr("Bu nom menyuda dastur nomi tagida va mijozlar katalogida ko'rinadi")} />
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          {isSuper && (
            <TextField select label={tr("Qaysi zavod")} value={factoryId} onChange={(e) => setFactoryId(Number(e.target.value))}>
              {factories.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label={tr("Zavod nomi")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("Masalan: Zara Textile Fabrikasi")}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          <Box>
            <SaveButton status={save.status} disabled={!valid} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Telegram: zavod chatini botga ulash — yangi buyurtma, material tugashi, buzilish, javob so'rovi xabarlari */
function TelegramCard() {
  const { user } = useAuth();
  const toast = useToast();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<number | ''>(user?.factory?.id ?? '');
  const [st, setSt] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState<'' | 'check' | 'test' | 'unlink'>('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSuper) return;
    factoriesApi
      .list()
      .then((f) => {
        setFactories(f);
        setFactoryId((cur) => (cur === '' ? f[0]?.id ?? '' : cur));
      })
      .catch(() => undefined);
  }, [isSuper]);

  useEffect(() => {
    if (factoryId === '') return;
    setSt(null);
    setError('');
    telegramApi.status(factoryId).then(setSt).catch((e) => setError(getErrorMessage(e)));
  }, [factoryId]);

  const run = async (kind: 'check' | 'test' | 'unlink') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'check') {
        setSt(await telegramApi.check(factoryId));
        toast.success(tr('Telegram ulandi'));
      } else if (kind === 'test') {
        await telegramApi.test(factoryId);
        toast.success(tr('Sinov xabari yuborildi'));
      } else {
        setSt(await telegramApi.unlink(factoryId));
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <Card>
      <CardContent>
        <SectionTitle title={tr('Telegram bildirishnomalar')} subtitle={tr("Yangi buyurtma, material tugashi, mashina buzilishi va javob so'rovlari — zavod chatiga")} />
        <Stack spacing={2}>
          {isSuper && (
            <TextField select label={tr('Qaysi zavod')} value={factoryId} onChange={(e) => setFactoryId(Number(e.target.value))}>
              {factories.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {!st ? (
            <Skeleton variant="rounded" height={56} />
          ) : !st.enabled ? (
            <Alert severity="info">{tr('Telegram bot hali sozlanmagan — administrator TELEGRAM_BOT_TOKEN ni kiritishi kerak.')}</Alert>
          ) : st.linked ? (
            <>
              <Alert severity="success">{tr('Ulangan: xabarlar @{0} orqali zavod chatiga keladi.', st.bot_username)}</Alert>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="outlined" onClick={() => run('test')} disabled={!!busy}>
                  {tr('Sinov xabari')}
                </Button>
                <Button color="error" onClick={() => run('unlink')} disabled={!!busy}>
                  {tr('Uzish')}
                </Button>
              </Box>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                {tr("1) «Botni ochish» ni bosing va Telegram'da Start tugmasini bosing. 2) Shu yerga qaytib «Tekshirish» ni bosing. Guruhga ulash uchun botni guruhga qo'shib, havoladagi /start buyrug'ini guruhda yuboring.")}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" component="a" href={st.link_url ?? '#'} target="_blank" rel="noopener" disabled={!st.link_url}>
                  {tr('Botni ochish')}
                </Button>
                <Button variant="outlined" onClick={() => run('check')} disabled={!!busy}>
                  {busy === 'check' ? tr('Tekshirilmoqda...') : tr('Tekshirish')}
                </Button>
              </Box>
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Moliya: tannarx va ogohlantirish chegaralari (kodga emas, bazaga yoziladi) */
function FinanceSettingsCard() {
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (isSuper) factoriesApi.list().then((f) => {
      setFactories(f);
      setFactoryId(f[0]?.id ?? '');
    }).catch(() => undefined);
  }, [isSuper]);

  useEffect(() => {
    if (isSuper && factoryId === '') return;
    setForm(null);
    analyticsApi
      .settings(factoryId)
      .then((s) => setForm(Object.fromEntries(FIELDS.map((f) => [f.key, String(s[f.key])])) as Form))
      .catch((e) => setError(getErrorMessage(e)));
  }, [isSuper, factoryId]);

  const value = (k: keyof Form) => Number((form?.[k] ?? '').replace(',', '.'));
  const invalid = (f: (typeof FIELDS)[number]) => form !== null && (form[f.key].trim() === '' || Number.isNaN(value(f.key)) || value(f.key) < f.min || value(f.key) > f.max);
  const valid = form !== null && !FIELDS.some(invalid);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      await save.run(() => analyticsApi.updateSettings(Object.fromEntries(FIELDS.map((f) => [f.key, value(f.key)])), factoryId));
      toast.success(tr("Sozlamalar saqlandi"));
      save.reset();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent component="form" onSubmit={submit} noValidate>
        <SectionTitle title={tr("Hisob-kitob")} subtitle={tr("Tannarx hisobi va ogohlantirish chegaralari — fabrikangizga moslang")} />
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}
          {isSuper && (
            <TextField select label={tr("Fabrika")} value={factoryId} onChange={(e) => setFactoryId(Number(e.target.value))}>
              {factories.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {!form
            ? FIELDS.map((f) => <Skeleton key={f.key} variant="rounded" height={56} />)
            : FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  inputMode="decimal"
                  error={invalid(f)}
                  helperText={invalid(f) ? `${f.min} – ${f.max}` : f.hint}
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">{f.unit}</InputAdornment> } }}
                />
              ))}
          <Typography variant="body2" color="text.secondary">
            {tr("Tannarx har safar mavjud yozuvlardan qayta hisoblanadi: o'zgartirish barcha buyurtmalar hisobida darhol aks etadi.")}
          </Typography>
          <Box>
            <SaveButton status={save.status} disabled={!valid} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

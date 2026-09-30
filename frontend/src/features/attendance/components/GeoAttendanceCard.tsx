import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, FormControlLabel, InputAdornment, Link, MenuItem, Skeleton, Stack, Switch, TextField, Typography } from '@mui/material';
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import type { Factory } from '@/shared/types';
import { attendanceApi } from '../api';
import { tr } from '@/i18n';

interface Form {
  enabled: boolean;
  lat: string;
  lng: string;
  radius: string;
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.trim().replace(',', '.')));

/** Sozlamalar: Telegram bot orqali davomat — zavod nuqtasi va ruxsat etilgan radius. */
export default function GeoAttendanceCard() {
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (isSuper)
      factoriesApi
        .list()
        .then((f) => {
          setFactories(f);
          setFactoryId(f[0]?.id ?? '');
        })
        .catch(() => undefined);
  }, [isSuper]);

  useEffect(() => {
    if (isSuper && factoryId === '') return;
    setForm(null);
    attendanceApi
      .geoSettings(factoryId)
      .then((g) => setForm({ enabled: g.enabled, lat: g.lat?.toString() ?? '', lng: g.lng?.toString() ?? '', radius: String(g.radius_m) }))
      .catch((e) => setError(getErrorMessage(e)));
  }, [isSuper, factoryId]);

  const lat = form ? num(form.lat) : null;
  const lng = form ? num(form.lng) : null;
  const radius = form ? num(form.radius) : null;
  const latError = lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90);
  const lngError = lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180);
  const radiusError = radius === null || Number.isNaN(radius) || radius < 30 || radius > 5000;
  const needsPoint = !!form?.enabled && (lat === null || lng === null);
  const valid = form !== null && !latError && !lngError && !radiusError && !needsPoint;

  const locate = () => {
    if (!navigator.geolocation) {
      setError(tr("Brauzeringiz joylashuvni aniqlay olmaydi — koordinatalarni qo'lda kiriting"));
      return;
    }
    setLocating(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setForm((f) => (f ? { ...f, lat: pos.coords.latitude.toFixed(6), lng: pos.coords.longitude.toFixed(6) } : f));
      },
      () => {
        setLocating(false);
        setError(tr("Joylashuvni olib bo'lmadi — brauzerda ruxsat bering yoki koordinatalarni qo'lda kiriting"));
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !valid) return;
    setError('');
    try {
      await save.run(() => attendanceApi.updateGeoSettings({ enabled: form.enabled, lat, lng, radius_m: Math.round(radius ?? 200) }, factoryId));
      toast.success(tr("Sozlamalar saqlandi"));
      save.reset();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent component="form" onSubmit={submit} noValidate>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h6">{tr("Botdan davomat (joylashuv)")}</Typography>
          <Typography sx={{ fontSize: 13.5, color: 'text.secondary', fontWeight: 500 }}>
            {tr("Xodim Telegram botda «📍 Keldim / Ketdim» tugmasini bosib joylashuvini yuboradi — zavod radiusi ichida bo'lsa vaqti belgilanadi")}
          </Typography>
        </Box>
        <Stack spacing={2}>
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
          {!form ? (
            <Skeleton variant="rounded" height={180} />
          ) : (
            <>
              <FormControlLabel
                control={<Switch checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />}
                label={tr("Bot orqali davomat yoqilgan")}
              />
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                <TextField label={tr("Kenglik (lat)")} value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} inputMode="decimal" error={latError || (needsPoint && lat === null)} placeholder="41.311081" />
                <TextField label={tr("Uzunlik (lng)")} value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} inputMode="decimal" error={lngError || (needsPoint && lng === null)} placeholder="69.240562" />
              </Box>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="outlined" startIcon={<MyLocationRoundedIcon />} onClick={locate} disabled={locating}>
                  {locating ? tr("Aniqlanmoqda...") : tr("Joriy joylashuvimni olish")}
                </Button>
                {lat !== null && lng !== null && !latError && !lngError && (
                  <Link href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener" underline="hover" sx={{ fontSize: 14 }}>
                    {tr("Xaritada ko'rish")}
                  </Link>
                )}
              </Box>
              <TextField
                label={tr("Ruxsat etilgan radius")}
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: e.target.value })}
                inputMode="numeric"
                error={radiusError}
                helperText={radiusError ? '30 – 5000' : tr("Zavod nuqtasidan shu masofagacha «keldi» deb qabul qilinadi (GPS xatoligi uchun 150–300 m tavsiya etiladi)")}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">m</InputAdornment> } }}
              />
              <Typography variant="body2" color="text.secondary">
                {tr("Maslahat: bu sahifani zavod ichida telefondan ochib «Joriy joylashuvimni olish» tugmasini bosing.")}
              </Typography>
            </>
          )}
          <Box>
            <SaveButton status={save.status} disabled={!valid} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

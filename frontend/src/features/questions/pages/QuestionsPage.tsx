import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, MenuItem, Pagination, Skeleton, Stack, TextField, Typography } from '@mui/material';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import CheckIcon from '@mui/icons-material/Check';
import ReplayIcon from '@mui/icons-material/Replay';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { useCanManageOrders } from '@/features/orders/permissions';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import type { Factory } from '@/shared/types';
import { formatDateTime } from '@/shared/utils/dates';
import { questionsApi, type QuestionPage, type QuestionStatus, type StoreQuestion } from '../api';
import { tr } from '@/i18n';

const PAGE = 20;

function QuestionCard({ q, canEdit, onChange }: { q: StoreQuestion; canEdit: boolean; onChange: (q: StoreQuestion) => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      onChange(await questionsApi.setStatus(q.id, q.status === 'NEW' ? 'ANSWERED' : 'NEW'));
    } finally {
      setBusy(false);
    }
  };
  const phone = q.customer_phone.replace(/[^\d+]/g, '');
  return (
    <Card variant="outlined" sx={{ opacity: q.status === 'ANSWERED' ? 0.75 : 1 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography sx={{ fontWeight: 600 }}>{q.customer_name}</Typography>
          <Chip size="small" label={q.status === 'NEW' ? tr('Yangi') : tr('Javob berilgan')} color={q.status === 'NEW' ? 'warning' : 'success'} />
          {q.product_name && <Chip size="small" variant="outlined" label={q.product_name} />}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(q.created_at)} · {q.factory_name}
          </Typography>
        </Box>
        <Typography sx={{ whiteSpace: 'pre-wrap', mb: 1.5 }}>{q.question}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" variant="contained" startIcon={<PhoneOutlinedIcon />} component="a" href={`tel:${phone}`}>
            {q.customer_phone}
          </Button>
          {canEdit && (
            <Button size="small" variant="outlined" disabled={busy} onClick={toggle} startIcon={q.status === 'NEW' ? <CheckIcon /> : <ReplayIcon />}>
              {q.status === 'NEW' ? tr('Javob berildi deb belgilash') : tr('Yangi deb qaytarish')}
            </Button>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

export default function QuestionsPage() {
  const { user } = useAuth();
  const canEdit = useCanManageOrders();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [status, setStatus] = useState<QuestionStatus | ''>('');
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [factories, setFactories] = useState<Factory[]>([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<QuestionPage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSuper) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [isSuper]);

  const load = useCallback(() => {
    setError('');
    questionsApi
      .list({ status, factory_id: factoryId, offset: (page - 1) * PAGE, limit: PAGE })
      .then(setData)
      .catch((e) => setError(getErrorMessage(e)));
  }, [status, factoryId, page]);

  useEffect(load, [load]);

  const replace = (q: StoreQuestion) => {
    setData((d) => d && { ...d, items: d.items.map((x) => (x.id === q.id ? q : x)), new_count: d.new_count + (q.status === 'NEW' ? 1 : -1) });
  };

  return (
    <>
      <PageHeader
        title={tr('Mijoz savollari')}
        subtitle={data ? tr('{0} ta javob kutmoqda', data.new_count) : tr("Katalogdagi «Savol berish» orqali kelgan savollar")}
      />
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <TextField select size="small" label={tr('Holati')} value={status} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(e) => { setStatus(e.target.value as QuestionStatus | ''); setPage(1); }} sx={{ minWidth: 180 }}>
          <MenuItem value="">{tr('Barchasi')}</MenuItem>
          <MenuItem value="NEW">{tr('Yangi')}</MenuItem>
          <MenuItem value="ANSWERED">{tr('Javob berilgan')}</MenuItem>
        </TextField>
        {isSuper && (
          <TextField select size="small" label={tr('Zavod')} value={factoryId} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(e) => { setFactoryId(e.target.value === '' ? '' : Number(e.target.value)); setPage(1); }} sx={{ minWidth: 200 }}>
            <MenuItem value="">{tr('Barchasi')}</MenuItem>
            {factories.map((f) => (
              <MenuItem key={f.id} value={f.id}>
                {f.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Stack spacing={1.5}>
        {data === null
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} variant="rounded" height={130} />)
          : data.items.map((q) => <QuestionCard key={q.id} q={q} canEdit={canEdit} onChange={replace} />)}
      </Stack>
      {data?.items.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <QuestionAnswerOutlinedIcon sx={{ fontSize: 56, opacity: 0.4 }} />
          <Typography sx={{ mt: 1 }}>{tr("Hozircha savollar yo'q")}</Typography>
        </Box>
      )}
      {data && data.total > PAGE && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination count={Math.ceil(data.total / PAGE)} page={page} onChange={(_, p) => setPage(p)} />
        </Box>
      )}
    </>
  );
}

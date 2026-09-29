import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  MenuItem,
  Skeleton,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import SouthWestIcon from '@mui/icons-material/SouthWest';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import HistoryToggleOffIcon from '@mui/icons-material/HistoryToggleOff';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { MATERIAL_TYPE_LABELS, MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import type { MaterialType } from '@/features/products/types';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import StatCard from '@/shared/components/StatCard';
import type { Factory } from '@/shared/types';
import { downloadCsv } from '@/shared/utils/csv';
import { formatDate } from '@/shared/utils/dates';
import { formatMoney } from '@/shared/utils/money';
import { inventoryApi, type TurnoverReport, type TurnoverRow } from '../api';
import { intlLocale, tr } from '@/i18n';

type Preset = 'month' | 'prev' | 'quarter' | 'year' | 'custom';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(p: Preset): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === 'prev') return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (p === 'quarter') return [iso(new Date(y, m - 2, 1)), iso(now)];
  if (p === 'year') return [iso(new Date(y, 0, 1)), iso(now)];
  return [iso(new Date(y, m, 1)), iso(now)];
}

const num = (v: number) => v.toLocaleString(intlLocale(), { maximumFractionDigits: 3 });
const unit = (r: TurnoverRow) => MATERIAL_UNIT_LABELS[r.unit] ?? r.unit;
const daysSince = (at: string | null) => (at ? Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000) : null);

function Qty({ value, sign }: { value: number; sign?: '+' | '-' }) {
  if (!value) return <Typography variant="body2" color="text.disabled">—</Typography>;
  const color = sign === '+' ? 'success.main' : sign === '-' ? 'error.main' : 'text.primary';
  return (
    <Typography variant="body2" sx={{ color, whiteSpace: 'nowrap' }}>
      {sign === '+' ? '+' : sign === '-' ? '−' : value > 0 ? '+' : ''}
      {num(Math.abs(value))}
    </Typography>
  );
}

export default function WarehouseReportsPage() {
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState(0);
  const [preset, setPreset] = useState<Preset>('month');
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange('month'));
  const [type, setType] = useState<MaterialType | ''>('');
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [factories, setFactories] = useState<Factory[]>([]);
  const [idleDays, setIdleDays] = useState(60);
  const [data, setData] = useState<TurnoverReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isSuper) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [isSuper]);

  const load = useCallback(() => {
    if (!from || !to) return;
    setData(null);
    setError('');
    inventoryApi
      .turnover({ date_from: from, date_to: to, material_type: type, factory_id: factoryId })
      .then(setData)
      .catch((e) => setError(getErrorMessage(e)));
  }, [from, to, type, factoryId]);

  useEffect(load, [load]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'custom') setRange(presetRange(p));
  };

  const moving = useMemo(
    () => data?.rows.filter((r) => r.opening || r.receipts || r.issues || r.write_offs || r.adjustments || r.closing) ?? [],
    [data],
  );
  const idle = useMemo(
    () =>
      (data?.rows ?? [])
        .filter((r) => r.closing > 0 && (daysSince(r.last_movement_at) ?? Infinity) >= idleDays)
        .sort((a, b) => (b.closing_value ?? 0) - (a.closing_value ?? 0)),
    [data, idleDays],
  );
  const idleValue = idle.reduce((s, r) => s + (r.closing_value ?? 0), 0);
  const totalValue = data?.totals.closing_value ?? 0;

  const exportTurnover = () =>
    downloadCsv(
      `ombor-aylanma-${from}_${to}`,
      [tr('Kod'), tr('Material'), tr('Turi'), tr("O'lchov"), tr("Boshlang'ich"), tr('Kirim'), tr('Chiqim'), tr('Hisobdan chiqarildi'), tr('Tuzatish'), tr('Oxirgi qoldiq'), tr('Narxi'), tr('Qiymati')],
      moving.map((r) => [r.code, r.name, MATERIAL_TYPE_LABELS[r.material_type], unit(r), r.opening, r.receipts, r.issues, r.write_offs, r.adjustments, r.closing, r.unit_cost, r.closing_value]),
      ['', tr('Jami'), '', '', '', '', '', '', '', '', '', data?.totals.closing_value],
    );
  const exportIdle = () =>
    downloadCsv(
      `ombor-harakatsiz-${idleDays}kun`,
      [tr('Kod'), tr('Material'), tr('Turi'), tr('Qoldiq'), tr("O'lchov"), tr('Qiymati'), tr('Oxirgi harakat'), tr('Kun')],
      idle.map((r) => [r.code, r.name, MATERIAL_TYPE_LABELS[r.material_type], r.closing, unit(r), r.closing_value, r.last_movement_at ? formatDate(r.last_movement_at) : '', daysSince(r.last_movement_at)]),
    );

  return (
    <>
      <PageHeader
        title={tr('Ombor hisobotlari')}
        subtitle={tr('Materiallar aylanmasi, ombor qiymati va harakatsiz qoldiqlar')}
        action={
          <Button variant="outlined" color="inherit" startIcon={<FileDownloadOutlinedIcon />} disabled={!data} onClick={tab === 2 ? exportIdle : exportTurnover}>
            {tr('Excel')}
          </Button>
        }
      />

      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField select size="small" fullWidth={false} label={tr('Davr')} value={preset} onChange={(e) => choosePreset(e.target.value as Preset)} sx={{ minWidth: 170 }}>
            <MenuItem value="month">{tr('Shu oy')}</MenuItem>
            <MenuItem value="prev">{tr("O'tgan oy")}</MenuItem>
            <MenuItem value="quarter">{tr('Oxirgi 3 oy')}</MenuItem>
            <MenuItem value="year">{tr('Yil boshidan')}</MenuItem>
            <MenuItem value="custom">{tr('Boshqa davr')}</MenuItem>
          </TextField>
          <TextField size="small" fullWidth={false} type="date" label={tr('Dan')} value={from} onChange={(e) => { setPreset('custom'); setRange([e.target.value, to]); }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField size="small" fullWidth={false} type="date" label={tr('Gacha')} value={to} onChange={(e) => { setPreset('custom'); setRange([from, e.target.value]); }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select size="small" fullWidth={false} label={tr('Material turi')} value={type} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(e) => setType(e.target.value as MaterialType | '')} sx={{ minWidth: 170 }}>
            <MenuItem value="">{tr('Barchasi')}</MenuItem>
            {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((k) => (
              <MenuItem key={k} value={k}>
                {MATERIAL_TYPE_LABELS[k]}
              </MenuItem>
            ))}
          </TextField>
          {isSuper && (
            <TextField select size="small" fullWidth={false} label={tr('Zavod')} value={factoryId} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ minWidth: 190 }}>
              <MenuItem value="">{tr('Barchasi')}</MenuItem>
              {factories.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </CardContent>
      </Card>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2 }}>
        <StatCard label={tr("Davr boshidagi qiymat")} value={data ? formatMoney(data.totals.opening_value) : '…'} icon={<Inventory2OutlinedIcon />} />
        <StatCard label={tr('Kirim')} value={data ? formatMoney(data.totals.receipts_value) : '…'} icon={<SouthWestIcon />} color="success.main" />
        <StatCard label={tr('Chiqim (ishlab chiqarishga)')} value={data ? formatMoney(data.totals.issues_value) : '…'} icon={<NorthEastIcon />} color="warning.main" />
        <StatCard label={tr('Davr oxiridagi qiymat')} value={data ? formatMoney(data.totals.closing_value) : '…'} icon={<Inventory2OutlinedIcon />} color="info.main"
          hint={data?.totals.without_cost ? tr('{0} ta materialning narxi kiritilmagan', data.totals.without_cost) : undefined} />
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} variant="scrollable" allowScrollButtonsMobile>
        <Tab label={tr('Aylanma')} />
        <Tab label={tr("Qiymat bo'yicha")} />
        <Tab label={tr('Harakatsiz qoldiqlar')} />
      </Tabs>

      {!data ? (
        <Skeleton variant="rounded" height={320} />
      ) : tab === 0 ? (
        <Card>
          <TableContainer>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr('Material')}</TableCell>
                  <TableCell align="right">{tr("Boshlang'ich")}</TableCell>
                  <TableCell align="right">{tr('Kirim')}</TableCell>
                  <TableCell align="right">{tr('Chiqim')}</TableCell>
                  <TableCell align="right">{tr('Hisobdan chiqarildi')}</TableCell>
                  <TableCell align="right">{tr('Tuzatish')}</TableCell>
                  <TableCell align="right">{tr('Oxirgi qoldiq')}</TableCell>
                  <TableCell align="right">{tr('Qiymati')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {moving.map((r) => (
                  <TableRow key={r.material_id} hover>
                    <TableCell>
                      <Typography component={RouterLink} to={`/inventory/materials/${r.material_id}`} variant="body2" sx={{ fontWeight: 600, color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                        {r.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {r.code} · {MATERIAL_TYPE_LABELS[r.material_type]} · {unit(r)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{num(r.opening)}</TableCell>
                    <TableCell align="right"><Qty value={r.receipts} sign="+" /></TableCell>
                    <TableCell align="right"><Qty value={r.issues} sign="-" /></TableCell>
                    <TableCell align="right"><Qty value={r.write_offs} sign="-" /></TableCell>
                    <TableCell align="right"><Qty value={r.adjustments} /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{num(r.closing)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{r.closing_value != null ? formatMoney(r.closing_value) : <Chip size="small" label={tr('narx yo\'q')} />}</TableCell>
                  </TableRow>
                ))}
                {moving.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Bu davrda ombor harakati yo'q")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      ) : tab === 1 ? (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
              {tr('Ombor qiymati material turlari bo\'yicha')} · {formatMoney(totalValue)}
            </Typography>
            {data.by_type.length === 0 && <Typography color="text.secondary">{tr("Omborda qoldiq yo'q")}</Typography>}
            {data.by_type.map((t) => {
              const share = totalValue ? (t.value / totalValue) * 100 : 0;
              return (
                <Box key={t.material_type} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, gap: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {MATERIAL_TYPE_LABELS[t.material_type]} <Typography component="span" variant="caption" color="text.secondary">· {tr('{0} ta material', t.materials)}</Typography>
                    </Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(t.value)} · {share.toFixed(1)}%
                    </Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={share} sx={{ height: 8, borderRadius: 4 }} />
                </Box>
              );
            })}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', pb: 1 }}>
            <HistoryToggleOffIcon color="warning" />
            <Typography variant="body2" sx={{ flex: 1, minWidth: 220 }}>
              {tr('{0} kundan beri ishlatilmagan materiallar: {1} ta, qiymati {2}', idleDays, idle.length, formatMoney(idleValue))}
            </Typography>
            <TextField select size="small" fullWidth={false} label={tr('Harakatsiz')} value={idleDays} onChange={(e) => setIdleDays(Number(e.target.value))} sx={{ minWidth: 150 }}>
              {[30, 60, 90, 180, 365].map((d) => (
                <MenuItem key={d} value={d}>
                  {tr('{0} kundan ko\'p', d)}
                </MenuItem>
              ))}
            </TextField>
          </CardContent>
          <TableContainer>
            <Table size="small" sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr('Material')}</TableCell>
                  <TableCell align="right">{tr('Qoldiq')}</TableCell>
                  <TableCell align="right">{tr('Qiymati')}</TableCell>
                  <TableCell>{tr('Oxirgi harakat')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {idle.map((r) => {
                  const days = daysSince(r.last_movement_at);
                  return (
                    <TableRow key={r.material_id} hover>
                      <TableCell>
                        <Typography component={RouterLink} to={`/inventory/materials/${r.material_id}`} variant="body2" sx={{ fontWeight: 600, color: 'inherit', textDecoration: 'none' }}>
                          {r.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {r.code} · {MATERIAL_TYPE_LABELS[r.material_type]}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{num(r.closing)} {unit(r)}</TableCell>
                      <TableCell align="right">{r.closing_value != null ? formatMoney(r.closing_value) : '—'}</TableCell>
                      <TableCell>
                        {r.last_movement_at ? `${formatDate(r.last_movement_at)} · ${tr('{0} kun oldin', days)}` : tr("Harakat yo'q")}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {idle.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Harakatsiz yotgan material yo'q")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </>
  );
}

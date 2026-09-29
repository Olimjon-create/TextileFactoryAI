import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import { formatMoney } from '@/shared/utils/money';
import { analyticsApi } from '../api';
import type { ReportColumn, ReportInfo, ReportKind, ReportTable } from '../types';
import { formatDate } from '@/shared/utils/dates';
import { downloadCsv, type CsvValue } from '@/shared/utils/csv';
import { tr } from '@/i18n';

const localIso = (d: Date) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
const num = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

function display(col: ReportColumn, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'number') return col.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? formatDate(String(value)) : String(value);
  if (col.type === 'money') return formatMoney(value);
  if (col.type === 'percent') return `${value}%`;
  return num.format(value);
}

function exportReport(t: ReportTable) {
  const cell = (v: unknown) => (v === null || v === undefined || typeof v === 'number' ? v : String(v)) as CsvValue;
  downloadCsv(
    `${t.kind}${t.date_from ? `_${t.date_from}_${t.date_to}` : ''}`,
    t.columns.map((c) => tr(c.label)),
    t.rows.map((r) => t.columns.map((c) => cell(r[c.key]))),
    t.totals ? t.columns.map((c) => cell(t.totals?.[c.key])) : undefined,
  );
}

export default function ReportsPage() {
  const [list, setList] = useState<ReportInfo[]>([]);
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [from, setFrom] = useState(localIso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(localIso(new Date()));
  const [table, setTable] = useState<ReportTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    analyticsApi
      .reports()
      .then((r) => {
        setList(r);
        setKind((k) => k ?? r[0]?.kind ?? null);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  const info = list.find((r) => r.kind === kind);
  const load = useCallback(async () => {
    if (!kind) return;
    setLoading(true);
    try {
      setTable(await analyticsApi.report(kind, info?.uses_dates ? from : undefined, info?.uses_dates ? to : undefined));
      setError('');
    } catch (e) {
      setTable(null);
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [kind, from, to, info?.uses_dates]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const align = (c: ReportColumn) => (c.type === 'text' || c.type === 'date' ? 'left' : 'right');

  return (
    <>
      <PageHeader title={tr("Hisobotlar")} subtitle={tr("Ishlab chiqarish, sifat, xodimlar, savdo, tannarx, ombor va yetkazib beruvchilar — Excel'ga yuklab olish mumkin")} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {list.length === 0 && !error && <Alert severity="info">{tr("Sizning rolingiz uchun hisobotlar yo'q")}</Alert>}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        {list.map((r) => (
          <Chip key={r.kind} label={tr(r.title)} color={kind === r.kind ? 'primary' : 'default'} variant={kind === r.kind ? 'filled' : 'outlined'} onClick={() => setKind(r.kind)} />
        ))}
      </Box>

      {info && (
        <Card>
          <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="h6">{tr(table?.title ?? info.title)}</Typography>
              <Typography variant="body2" color="text.secondary">
                {tr(info.description)}
              </Typography>
            </Box>
            {info.uses_dates && (
              <>
                <TextField type="date" size="small" label={tr("Dan")} value={from} onChange={(e) => setFrom(e.target.value)} sx={{ width: 170 }} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField type="date" size="small" label={tr("Gacha")} value={to} onChange={(e) => setTo(e.target.value)} sx={{ width: 170 }} slotProps={{ inputLabel: { shrink: true } }} />
              </>
            )}
            <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} disabled={!table || !table.rows.length} onClick={() => table && exportReport(table)}>
              {tr("Excel (CSV)")}
            </Button>
          </CardContent>
          {loading && <LinearProgress />}
          {table && (
            <TableContainer sx={{ maxHeight: '65vh' }}>
              <Table size="small" stickyHeader sx={{ minWidth: Math.max(600, table.columns.length * 110) }}>
                <TableHead>
                  <TableRow>
                    {table.columns.map((c) => (
                      <TableCell key={c.key} align={align(c)} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                        {tr(c.label)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {table.rows.map((r, i) => (
                    <TableRow key={i} hover>
                      {table.columns.map((c) => (
                        <TableCell key={c.key} align={align(c)} sx={{ whiteSpace: c.type === 'text' ? undefined : 'nowrap' }}>
                          {display(c, r[c.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {table.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={table.columns.length} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                        {tr("Bu davrda ma'lumot yo'q")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {table.totals && table.rows.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      {table.columns.map((c) => (
                        <TableCell key={c.key} align={align(c)} sx={{ fontWeight: 700, color: 'text.primary', whiteSpace: 'nowrap' }}>
                          {table.totals?.[c.key] === undefined ? '' : display(c, table.totals[c.key])}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </TableContainer>
          )}
        </Card>
      )}
    </>
  );
}

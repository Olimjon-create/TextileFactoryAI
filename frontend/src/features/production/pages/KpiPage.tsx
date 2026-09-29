import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  Chip,
  LinearProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { DEPARTMENT_LABELS } from '@/features/resources/constants';
import { resourcesApi } from '@/features/resources/api';
import type { ProductionLine } from '@/features/resources/types';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { productionApi } from '../api';
import type { EmployeeKpi } from '../types';
import { tr } from '@/i18n';

const iso = (d: Date) => d.toISOString().slice(0, 10);

function Efficiency({ k }: { k: EmployeeKpi }) {
  if (k.efficiency_pct === null) {
    return (
      <Typography variant="body2" color="text.secondary">
        {tr("Me'yor yo'q")}
      </Typography>
    );
  }
  const v = k.efficiency_pct;
  const color = v >= 100 ? 'success' : v >= 80 ? 'warning' : 'error';
  return (
    <Box sx={{ minWidth: 140 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }} color={`${color}.main`}>
          {v}%
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {k.good} / {k.norm_total}
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={Math.min(v, 100)} color={color} sx={{ height: 6, borderRadius: 3 }} />
    </Box>
  );
}

/** Xodimlar KPI: ishlab chiqarish yozuvlaridan — yaroqli dona, me'yor bajarilishi, brak ulushi, soatbay unumdorlik */
export default function KpiPage() {
  const isMobile = useIsMobile();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 86400000)));
  const [to, setTo] = useState(iso(new Date()));
  const [lineId, setLineId] = useState<number | ''>('');
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [rows, setRows] = useState<EmployeeKpi[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await productionApi.kpi({ date_from: from, date_to: to, line_id: lineId }));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [from, to, lineId]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    resourcesApi.lines().then(setLines).catch(() => undefined);
  }, []);

  return (
    <>
      <PageHeader title={tr("Xodimlar KPI")} subtitle={tr("Ishlab chiqarish yozuvlaridan: me'yor bajarilishi, brak ulushi, unumdorlik")} />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Card>
        <FilterBar>
          <TextField type="date" label={tr("Dan")} value={from} onChange={(e) => setFrom(e.target.value)} sx={{ width: 170 }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField type="date" label={tr("Gacha")} value={to} onChange={(e) => setTo(e.target.value)} sx={{ width: 170 }} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField select label={tr("Liniya")} value={lineId} onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))} sx={{ width: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {lines.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.code} — {l.name}
              </MenuItem>
            ))}
          </TextField>
        </FilterBar>
        {rows === null && <LinearProgress />}
        {isMobile ? (
          <Box>
            {rows?.map((k) => (
              <MobileListItem
                key={k.employee.id}
                overline={`${k.employee.code} · ${DEPARTMENT_LABELS[k.department]}`}
                title={k.employee.name}
                subtitle={tr("{0} kun · {1} yaroqli{2}", k.days_worked, k.good, k.defect ? tr(" · {0} brak ({1}%)", k.defect, k.defect_rate) : '')}
                meta={<Box sx={{ width: '100%' }}><Efficiency k={k} /></Box>}
              />
            ))}
            {rows?.length === 0 && <MobileListEmpty>{tr("Bu davrda xodimlar bo'yicha yozuv yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Xodim")}</TableCell>
                  <TableCell>{tr("Bo'lim / liniya")}</TableCell>
                  <TableCell align="center">{tr("Kun")}</TableCell>
                  <TableCell align="right">{tr("Yaroqli")}</TableCell>
                  <TableCell>{tr("Me'yor bajarilishi")}</TableCell>
                  <TableCell align="right">{tr("Brak")}</TableCell>
                  <TableCell align="right">{tr("Dona / soat")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows?.map((k) => (
                  <TableRow key={k.employee.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{k.employee.name}</Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {k.employee.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {DEPARTMENT_LABELS[k.department]}
                      <Typography variant="body2" color="text.secondary">
                        {k.line?.code ?? ''}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">{k.days_worked}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {k.good}
                    </TableCell>
                    <TableCell>
                      <Efficiency k={k} />
                    </TableCell>
                    <TableCell align="right">
                      {k.defect ? <Chip size="small" color={(k.defect_rate ?? 0) > 5 ? 'error' : 'warning'} variant="outlined" label={`${k.defect} · ${k.defect_rate}%`} /> : '—'}
                    </TableCell>
                    <TableCell align="right">{k.per_hour ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {rows?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Bu davrda xodimlar bo'yicha yozuv yo'q. Ish buyurtmasiga ish qayd etilganda xodimni tanlang.")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </>
  );
}

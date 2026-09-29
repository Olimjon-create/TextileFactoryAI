import { useRef, useState, type FormEvent } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, InputAdornment, LinearProgress, TextField, Typography } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { Link as RouterLink } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import PageHeader from '@/shared/components/PageHeader';
import { productionApi } from '../api';
import StagePipeline from '../components/StagePipeline';
import { WorkOrderStatusChip } from '../components/WorkOrderChips';
import { SOURCE_LABELS, STAGE_ROUTE, STAGE_SHORT } from '../constants';
import type { TraceResult } from '../types';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

const KIND_LABELS: Record<TraceResult['kind'], string> = {
  BUNDLE: tr("Partiya"),
  BOX: tr("Quti"),
  WORK_ORDER: tr("Ish buyurtmasi"),
  ORDER: tr("Buyurtma"),
  MATERIAL: tr("Material"),
  MACHINE: tr("Mashina"),
  SHIPMENT: tr("Jo'natma"),
  PURCHASE_ORDER: tr("Xarid buyurtmasi"),
};

/**
 * QR / shtrix-kod skaneri: USB/Bluetooth skaner klaviatura kabi ishlaydi — kodni maydonga "yozadi" va Enter bosadi.
 * Partiya, quti, ish buyurtmasi, buyurtma, material yoki mashina kodi tanib olinadi.
 */
export default function ScanPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<TraceResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setLoading(true);
    setError('');
    try {
      setResult(await productionApi.trace(value));
    } catch (err) {
      setResult(null);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setCode('');
      inputRef.current?.focus();
    }
  };

  const unitStages = result?.unit?.stages_done ?? [];

  return (
    <>
      <PageHeader title={tr("Skaner")} subtitle={tr("QR yoki shtrix-kodni o'qing: mahsulot qaysi bosqichlardan o'tganini ko'ring")} />
      <Card sx={{ mb: 2 }}>
        <CardContent component="form" onSubmit={submit} sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            inputRef={inputRef}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={tr("WO-000001-P01, B-000012, SH-000003, PO-000005, MAT-001...")}
            sx={{ flex: '1 1 320px' }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><QrCodeScannerIcon /></InputAdornment> } }}
          />
          <Button type="submit" variant="contained" size="large" disabled={!code.trim() || loading}>
            {tr("Topish")}
          </Button>
        </CardContent>
        {loading && <LinearProgress />}
      </Card>

      {error && <Alert severity="warning">{error}</Alert>}

      {result && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Chip size="small" label={KIND_LABELS[result.kind]} sx={{ mb: 1 }} />
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                  {result.title}
                </Typography>
                {result.subtitle && <Typography color="text.secondary">{result.subtitle}</Typography>}
              </Box>
              <Button variant="outlined" endIcon={<OpenInNewIcon />} component={RouterLink} to={result.path}>
                {tr("Ochish")}
              </Button>
            </Box>

            {result.unit && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {tr("Bu")}{' '}{result.kind === 'BUNDLE' ? 'partiya' : 'quti'} {tr("o'tgan bosqichlar")}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {STAGE_ROUTE.map((s) => (
                    <Chip key={s} label={STAGE_SHORT[s]} color={unitStages.includes(s) ? 'success' : 'default'} variant={unitStages.includes(s) ? 'filled' : 'outlined'} />
                  ))}
                </Box>
              </Box>
            )}

            {result.work_order && (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2">
                    {tr("Ish buyurtmasi")}{' '}{result.work_order.number}: {result.work_order.finished} / {result.work_order.quantity} {tr("tayyor")}
                  </Typography>
                  <WorkOrderStatusChip wo={result.work_order} />
                </Box>
                <StagePipeline wo={result.work_order} />
              </Box>
            )}

            {result.logs.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {tr("Tarix")}
                </Typography>
                {result.logs.map((l) => (
                  <Box key={l.id} sx={{ display: 'flex', gap: 2, py: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
                    <Typography sx={{ minWidth: 110 }}>{formatDate(l.work_date)}</Typography>
                    <Chip size="small" label={STAGE_SHORT[l.stage]} />
                    <Typography sx={{ flex: 1 }}>
                      {l.quantity_good} {tr("yaroqli")}{l.quantity_defect ? tr(", {0} brak", l.quantity_defect) : ''} · {l.employee?.name ?? '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {SOURCE_LABELS[l.source]}
                    </Typography>
                  </Box>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

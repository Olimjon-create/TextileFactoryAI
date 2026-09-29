import { useCallback, useEffect, useState } from 'react';
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
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import { useNavigate } from 'react-router-dom';
import { resourcesApi } from '@/features/resources/api';
import type { ProductionLine } from '@/features/resources/types';
import { getErrorMessage } from '@/shared/api/client';
import SaveButton from '@/shared/components/SaveButton';
import { useToast } from '@/shared/components/Toast';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import { productionApi } from '../api';
import { useProductionPermissions } from '../permissions';
import type { WorkOrder } from '../types';
import StagePipeline from './StagePipeline';
import { WorkOrderStatusChip } from './WorkOrderChips';
import { tr } from '@/i18n';

interface OrderLike {
  id: number;
  status: string;
  due_date: string | null;
  total_quantity: number;
}

/** Buyurtma sahifasida: ishlab chiqarishga berish va ish buyurtmalari holati */
export default function OrderProductionCard({ order, onChanged }: { order: OrderLike; onChanged?: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { canEdit } = useProductionPermissions();
  const [items, setItems] = useState<WorkOrder[] | null>(null);
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [lineId, setLineId] = useState<number | ''>('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [overcut, setOvercut] = useState('0');
  const [error, setError] = useState('');
  const save = useSaveAction();

  const load = useCallback(() => {
    productionApi.list({ order_id: order.id, limit: 100 }).then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [order.id]);
  useEffect(() => {
    load();
  }, [load, order.status]);

  const openDialog = () => {
    save.reset();
    setError('');
    setLineId('');
    setStart('');
    setEnd(order.due_date ?? '');
    setOvercut('0');
    resourcesApi.lines().then(setLines).catch(() => undefined);
    setOpen(true);
  };

  const planned = (items ?? []).filter((w) => w.status !== 'CANCELLED').reduce((s, w) => s + w.quantity, 0);
  const closed = ['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.status);
  const canSend = canEdit && !closed && planned < order.total_quantity;
  const oc = Number(overcut.replace(',', '.'));

  const submit = async () => {
    setError('');
    try {
      const created = await save.run(() =>
        productionApi.fromOrder(order.id, { line_id: lineId === '' ? null : lineId, planned_start: start || null, planned_end: end || null, overcut_pct: oc }),
      );
      toast.success(tr("{0} ta ish buyurtmasi ochildi", created.length));
      setOpen(false);
      load();
      onChanged?.();
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  if (items === null || (items.length === 0 && !canSend)) return null;

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: items.length ? 1.5 : 0 }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="h6">{tr("Ishlab chiqarish")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("Rejalashtirilgan:")}{' '}{planned} / {order.total_quantity} {tr("dona")}
            </Typography>
          </Box>
          {canSend && (
            <Button variant="contained" startIcon={<PrecisionManufacturingOutlinedIcon />} onClick={openDialog}>
              {tr("Ishlab chiqarishga berish")}
            </Button>
          )}
        </Box>
        {items.map((w) => (
          <Box
            key={w.id}
            onClick={() => navigate(`/production/${w.id}`)}
            sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1.2fr 2fr auto' }, alignItems: 'center', py: 1.25, borderTop: 1, borderColor: 'divider', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Box>
              <Typography sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{w.number}</Typography>
              <Typography variant="body2" color="text.secondary">
                {[w.product_code, w.size, w.color].filter(Boolean).join(' · ')} · {w.finished} / {w.quantity} {tr("tayyor")}
              </Typography>
            </Box>
            <StagePipeline wo={w} compact />
            <Box>
              <WorkOrderStatusChip wo={w} />
            </Box>
          </Box>
        ))}
      </CardContent>
      <Dialog open={open} onClose={save.busy ? undefined : () => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{tr("Ishlab chiqarishga berish")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              {tr("Har bir buyurtma qatori (mahsulot + o'lcham/rang) uchun hali rejalashtirilmagan miqdorga ish buyurtmasi ochiladi.")}
            </Typography>
            <TextField select label={tr("Liniya")} value={lineId} onChange={(e) => setLineId(e.target.value === '' ? '' : Number(e.target.value))}>
              <MenuItem value="">—</MenuItem>
              {lines.map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </MenuItem>
              ))}
            </TextField>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr' }}>
              <TextField type="date" label={tr("Boshlanishi")} value={start} onChange={(e) => setStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField type="date" label={tr("Tugashi")} value={end} onChange={(e) => setEnd(e.target.value)} helperText={tr("Buyurtma muddati")} slotProps={{ inputLabel: { shrink: true } }} />
            </Box>
            <TextField label={tr("Ortiqcha kesish")} value={overcut} onChange={(e) => setOvercut(e.target.value)} inputMode="decimal" helperText={tr("Brak zaxirasi (0–50%)")} slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} type="button" onClick={submit} disabled={!(oc >= 0 && oc <= 50) || (!!start && !!end && end < start)}>
            {tr("Berish")}
          </SaveButton>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

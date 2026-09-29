import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Link,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import OutboxOutlinedIcon from '@mui/icons-material/OutboxOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { formatQty } from '@/features/inventory/constants';
import { useCanEditInventory } from '@/features/inventory/permissions';
import { useCanEditProcurement } from '@/features/procurement/permissions';
import type { PurchasePrefill } from '@/features/procurement/types';
import { MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import { MobileListItem } from '@/shared/components/MobileList';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { ordersApi } from '../api';
import type { MaterialRequirement, Order, OrderMaterials, RequirementStatus } from '../types';
import IssueMaterialsDialog from './IssueMaterialsDialog';
import { tr } from '@/i18n';

const STATUS: Record<RequirementStatus, { label: string; color: 'error' | 'warning' | 'success' | 'info' | 'default' }> = {
  SHORTAGE: { label: tr("Yetishmaydi"), color: 'error' },
  OVERUSED: { label: tr("Ortiqcha sarf"), color: 'warning' },
  NOT_LINKED: { label: tr("Katalogga bog'lanmagan"), color: 'default' },
  ENOUGH: { label: tr("Omborda bor"), color: 'info' },
  ISSUED: { label: tr("Chiqarilgan"), color: 'success' },
};

function StatusChip({ line }: { line: MaterialRequirement }) {
  const s = STATUS[line.status];
  const unit = MATERIAL_UNIT_LABELS[line.unit];
  const label =
    line.status === 'SHORTAGE'
      ? `${s.label}: ${formatQty(line.shortage)} ${unit}`
      : line.status === 'OVERUSED'
        ? `${s.label}: +${formatQty(line.variance)} ${unit}${line.variance_pct !== null ? ` (${line.variance_pct}%)` : ''}`
        : s.label;
  return <Chip size="small" color={s.color} variant={line.status === 'NOT_LINKED' ? 'outlined' : 'filled'} label={label} />;
}

function MaterialName({ line }: { line: MaterialRequirement }) {
  return (
    <>
      {line.material_id ? (
        <Link component={RouterLink} to={`/inventory/materials/${line.material_id}`} sx={{ fontWeight: 600, fontSize: 14 }}>
          {line.material_code} — {line.material_name}
        </Link>
      ) : (
        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{line.material_name}</Typography>
      )}
      <Typography variant="caption" color="text.secondary" display="block">
        {line.products.join(', ')}
      </Typography>
    </>
  );
}

export default function OrderMaterialsCard({ order }: { order: Order }) {
  const isMobile = useIsMobile();
  const canIssue = useCanEditInventory();
  const canBuy = useCanEditProcurement();
  const navigate = useNavigate();
  const [data, setData] = useState<OrderMaterials | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'ISSUE' | 'RETURN' | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await ordersApi.materials(order.id));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [order.id]);

  useEffect(() => {
    load();
  }, [load, order.status]);

  const closed = ['SHIPPED', 'COMPLETED', 'CANCELLED'].includes(order.status);
  const anyIssued = data?.lines.some((l) => l.issued > 0);
  const toBuy = (data?.lines ?? []).filter((l) => l.material_id && l.shortage - l.on_order > 0);
  const buy = () => {
    const prefill: PurchasePrefill = {
      order_id: order.id,
      order_number: order.order_number,
      lines: toBuy.map((l) => ({ material_id: l.material_id!, quantity: l.shortage - l.on_order })),
    };
    navigate('/purchases', { state: { prefill } });
  };

  return (
    <Card sx={{ mt: 2 }}>
      <CardContent sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 240 }}>
            <Typography variant="h6">{tr("Material ehtiyoji")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("BOM × buyurtma miqdori (isrof bilan) — ombordagi qoldiq va buyurtmaga chiqarilgan material bilan solishtirilgan")}
            </Typography>
          </Box>
          {(canIssue || canBuy) && data && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {canBuy && toBuy.length > 0 && !closed && (
                <Button variant="outlined" color="error" startIcon={<ShoppingCartOutlinedIcon />} onClick={buy}>
                  {tr("Xarid qilish")}
                </Button>
              )}
              {canIssue && (
                <>
                  <Button variant="contained" startIcon={<OutboxOutlinedIcon />} onClick={() => setDialog('ISSUE')} disabled={closed}>
                    {tr("Omborga chiqarish")}
                  </Button>
                  <Button variant="outlined" startIcon={<UndoOutlinedIcon />} onClick={() => setDialog('RETURN')} disabled={!anyIssued}>
                    {tr("Qaytarish")}
                  </Button>
                </>
              )}
            </Box>
          )}
        </Box>
        {data && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
            {data.shortage_count > 0 && <Chip size="small" color="error" label={tr("{0} ta material yetishmaydi", data.shortage_count)} />}
            {data.overused_count > 0 && <Chip size="small" color="warning" label={tr("{0} ta ortiqcha sarf", data.overused_count)} />}
            {data.not_linked_count > 0 && <Chip size="small" variant="outlined" label={tr("{0} ta katalogga bog'lanmagan", data.not_linked_count)} />}
            <Chip size="small" variant="outlined" label={tr("Rejadagi material qiymati: {0}", formatMoney(data.planned_cost))} />
            <Chip size="small" variant="outlined" label={tr("Chiqarilgan: {0}", formatMoney(data.issued_cost))} />
          </Box>
        )}
      </CardContent>
      {!data && !error && <LinearProgress />}
      {error && (
        <Alert severity="error" sx={{ mx: 2, mb: 2 }}>
          {error}
        </Alert>
      )}
      {data && data.products_without_bom.length > 0 && (
        <Alert severity="warning" sx={{ mx: 2, mb: 1 }}>
          {tr("BOM to'ldirilmagan:")}{' '}{data.products_without_bom.join(', ')} {tr("— bu mahsulotlar uchun material hisoblanmadi.")}
        </Alert>
      )}
      {data && data.lines.length === 0 && data.products_without_bom.length === 0 && (
        <Typography color="text.secondary" sx={{ px: 2, pb: 2 }}>
          {tr("Material ehtiyoji yo'q.")}
        </Typography>
      )}
      {data && data.lines.length > 0 &&
        (isMobile ? (
          <Box>
            {data.lines.map((l) => {
              const unit = MATERIAL_UNIT_LABELS[l.unit];
              return (
                <MobileListItem
                  key={l.material_id ?? l.material_name}
                  title={l.material_code ? `${l.material_code} — ${l.material_name}` : l.material_name}
                  subtitle={tr("Reja {0} · chiqarilgan {1} · omborda {2} {3}{4}", formatQty(l.planned), formatQty(l.issued), formatQty(l.available), unit, l.on_order ? tr(" · yo'lda {0}", formatQty(l.on_order)) : '')}
                  meta={<StatusChip line={l} />}
                />
              );
            })}
          </Box>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Material")}</TableCell>
                  <TableCell align="right">{tr("Reja")}</TableCell>
                  <TableCell align="right">{tr("Chiqarilgan")}</TableCell>
                  <TableCell align="right">{tr("Qolgan")}</TableCell>
                  <TableCell align="right">{tr("Omborda")}</TableCell>
                  <TableCell align="right">{tr("Qiymati (reja)")}</TableCell>
                  <TableCell>{tr("Holat")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.lines.map((l) => {
                  const unit = MATERIAL_UNIT_LABELS[l.unit];
                  return (
                    <TableRow key={l.material_id ?? l.material_name} hover>
                      <TableCell>
                        <MaterialName line={l} />
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {formatQty(l.planned)} {unit}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {l.material_id ? `${formatQty(l.issued)} ${unit}` : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {l.material_id ? `${formatQty(l.remaining)} ${unit}` : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: l.status === 'SHORTAGE' ? 'error.main' : undefined }}>
                        {l.material_id ? `${formatQty(l.available)} ${unit}` : '—'}
                        {l.on_order > 0 && (
                          <Typography variant="caption" color="info.main" display="block">
                            {tr("yo'lda")}{' '}{formatQty(l.on_order)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {l.planned_cost !== null ? formatMoney(l.planned_cost) : '—'}
                      </TableCell>
                      <TableCell>
                        {l.status === 'NOT_LINKED' ? (
                          <Tooltip title={tr("Mahsulot BOM'ida bu materialni ombor katalogidan tanlang — shunda qoldiq va chiqarish hisoblanadi")}>
                            <span>
                              <StatusChip line={l} />
                            </span>
                          </Tooltip>
                        ) : (
                          <StatusChip line={l} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ))}
      {data && dialog && (
        <IssueMaterialsDialog
          open
          mode={dialog}
          order={order}
          materials={data}
          onClose={() => setDialog(null)}
          onDone={(m) => {
            setData(m);
            setDialog(null);
          }}
        />
      )}
    </Card>
  );
}

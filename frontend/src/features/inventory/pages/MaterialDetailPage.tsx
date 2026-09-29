import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Skeleton,
  TablePagination,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { MATERIAL_TYPE_LABELS, MATERIAL_UNIT_LABELS } from '@/features/products/constants';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { useToast } from '@/shared/components/Toast';
import { formatMoney } from '@/shared/utils/money';
import { inventoryApi } from '../api';
import MaterialFormDialog from '../components/MaterialFormDialog';
import MovementFormDialog from '../components/MovementFormDialog';
import MovementsTable from '../components/MovementsTable';
import { formatQty } from '../constants';
import { useCanEditInventory } from '../permissions';
import type { MaterialDetail, Movement, MovementInput } from '../types';
import { tr } from '@/i18n';

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'error' | 'warning' }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 700, color: tone ? `${tone}.main` : undefined, whiteSpace: 'nowrap' }}>{value}</Typography>
    </Box>
  );
}

export default function MaterialDetailPage() {
  const { id } = useParams();
  const materialId = Number(id);
  const navigate = useNavigate();
  const canEdit = useCanEditInventory();
  const toast = useToast();

  const [material, setMaterial] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState('');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [loadingMoves, setLoadingMoves] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [movementType, setMovementType] = useState<MovementInput | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadMaterial = useCallback(async () => {
    try {
      setMaterial(await inventoryApi.material(materialId));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [materialId]);

  const loadMovements = useCallback(async () => {
    setLoadingMoves(true);
    try {
      const res = await inventoryApi.movements({ material_id: materialId, offset: page * rowsPerPage, limit: rowsPerPage });
      setMovements(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingMoves(false);
    }
  }, [materialId, page, rowsPerPage]);

  useEffect(() => {
    loadMaterial();
  }, [loadMaterial]);
  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await inventoryApi.removeMaterial(materialId);
      toast.success(tr("Material o'chirildi"));
      navigate('/inventory/materials');
    } catch (e) {
      setError(getErrorMessage(e));
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!material) {
    return error ? (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6">{error}</Typography>
        <Button component={RouterLink} to="/inventory/materials" startIcon={<ArrowBackIcon />} sx={{ mt: 2 }}>
          {tr("Materiallar")}
        </Button>
      </Box>
    ) : (
      <>
        <Skeleton width={160} />
        <Skeleton variant="rounded" height={180} sx={{ my: 2 }} />
        <Skeleton variant="rounded" height={320} />
      </>
    );
  }

  const unit = MATERIAL_UNIT_LABELS[material.unit];
  const stockTone = material.stock <= 0 ? 'error' : material.is_low ? 'warning' : undefined;

  return (
    <>
      <Button component={RouterLink} to="/inventory/materials" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Materiallar")}
      </Button>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap', mb: 2 }}>
            <Box sx={{ flex: 1, minWidth: 240 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                {material.code}
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {material.name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                <Chip size="small" label={MATERIAL_TYPE_LABELS[material.material_type]} />
                {material.color && <Chip size="small" variant="outlined" label={material.color} />}
                {!material.is_active && <Chip size="small" label={tr("Nofaol")} />}
                {material.stock <= 0 ? (
                  <Chip size="small" color="error" label={tr("Tugagan")} />
                ) : material.is_low ? (
                  <Chip size="small" color="warning" label={tr("Kam qolgan — to'ldirish kerak")} />
                ) : null}
                {material.bom_usage_count > 0 && (
                  <Chip size="small" color="info" variant="outlined" label={tr("{0} ta mahsulot BOM'ida", material.bom_usage_count)} />
                )}
              </Box>
            </Box>
            {canEdit && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button variant="contained" color="success" startIcon={<AddCircleOutlineIcon />} onClick={() => setMovementType('RECEIPT')} disabled={!material.is_active}>
                  {tr("Kirim")}
                </Button>
                <Button variant="outlined" startIcon={<RemoveCircleOutlineIcon />} onClick={() => setMovementType('ISSUE')} disabled={material.stock <= 0}>
                  {tr("Chiqim")}
                </Button>
                <Button variant="outlined" startIcon={<FactCheckOutlinedIcon />} onClick={() => setMovementType('ADJUSTMENT')}>
                  {tr("Inventarizatsiya")}
                </Button>
                <Button color="inherit" startIcon={<EditOutlinedIcon />} onClick={() => setEditOpen(true)}>
                  {tr("Tahrirlash")}
                </Button>
                <Button color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteOpen(true)}>
                  {tr("O'chirish")}
                </Button>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            <Stat label={tr("Qoldiq")} value={`${formatQty(material.stock)} ${unit}`} tone={stockTone} />
            <Stat label={tr("Minimal qoldiq")} value={material.min_stock ? `${formatQty(material.min_stock)} ${unit}` : '—'} />
            <Stat label={tr("Tannarx (1 birlik)")} value={material.unit_cost !== null ? formatMoney(material.unit_cost) : '—'} />
            <Stat label={tr("Ombordagi qiymati")} value={material.stock_value !== null ? formatMoney(material.stock_value) : '—'} />
          </Box>
          {material.notes && (
            <Typography color="text.secondary" sx={{ mt: 2 }}>
              {material.notes}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: '320px 1fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1.5 }}>
              {tr("Joylar bo'yicha qoldiq")}
            </Typography>
            {material.locations.length === 0 ? (
              <Typography color="text.secondary">{tr("Omborda qoldiq yo'q")}</Typography>
            ) : (
              material.locations.map((l) => (
                <Box key={l.location_id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{l.location_code}</Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {l.location_name}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatQty(l.quantity)} {unit}
                  </Typography>
                </Box>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ pb: 0 }}>
            <Typography variant="h6">{tr("Harakatlar tarixi")}</Typography>
            <Typography variant="body2" color="text.secondary">
              {tr("Har bir kirim va chiqim o'zgarmas yozuv sifatida saqlanadi")}
            </Typography>
          </CardContent>
          {loadingMoves && <LinearProgress sx={{ mt: 1 }} />}
          <MovementsTable movements={movements} loading={loadingMoves} showMaterial={false} emptyText={tr("Hali harakat yo'q. Birinchi kirimni kiriting.")} />
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
            labelRowsPerPage={tr("Sahifada:")}
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
          />
        </Card>
      </Box>

      <MaterialFormDialog
        open={editOpen}
        material={material}
        onClose={() => setEditOpen(false)}
        onSaved={(m) => {
          setEditOpen(false);
          setMaterial(m);
        }}
      />
      <MovementFormDialog
        open={movementType !== null}
        material={material}
        initialType={movementType ?? 'RECEIPT'}
        onClose={() => setMovementType(null)}
        onSaved={() => {
          setMovementType(null);
          loadMaterial();
          setPage(0);
          loadMovements();
        }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={tr("Materialni o'chirish")}
        message={tr("\"{0}\" katalogdan o'chiriladi. Ombor tarixi bor materialni o'chirib bo'lmaydi — uni nofaol qiling.", material.name)}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}

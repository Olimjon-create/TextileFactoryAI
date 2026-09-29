import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { MobileListEmpty, MobileListItem } from '@/shared/components/MobileList';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { CardSkeleton, TableRowsSkeleton } from '@/shared/components/skeletons';
import { bomApi, productsApi } from '../api';
import BomItemDialog from '../components/BomItemDialog';
import ProductFormDialog from '../components/ProductFormDialog';
import ProductStatusChip from '../components/ProductStatusChip';
import VariantChips from '../components/VariantChips';
import { formatQuantity, MATERIAL_TYPE_LABELS, MATERIAL_UNIT_LABELS, PRODUCTION_UNIT_LABELS } from '../constants';
import { useCanEditProducts } from '../permissions';
import type { BOMItem, Product } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

type DeleteTarget = { kind: 'product' } | { kind: 'bom'; item: BOMItem };

export default function ProductDetailPage() {
  const { id } = useParams();
  const productId = Number(id);
  const navigate = useNavigate();
  const canEdit = useCanEditProducts();
  const isMobile = useIsMobile();

  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [bomDialogOpen, setBomDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BOMItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setProduct(await productsApi.get(productId));
      setError('');
    } catch (e) {
      const msg = getErrorMessage(e);
      if (msg === 'Mahsulot topilmadi') setNotFound(true);
      else setError(msg);
    }
  }, [productId]);

  useEffect(() => {
    if (Number.isInteger(productId)) load();
    else setNotFound(true);
  }, [load, productId]);

  // Material turlari bo'yicha qisqacha xulosa
  const summary = useMemo(() => {
    const map = new Map<string, number>();
    product?.bom_items.forEach((i) => map.set(i.material_type, (map.get(i.material_type) ?? 0) + 1));
    return Array.from(map.entries());
  }, [product]);

  const handleDelete = async () => {
    if (!deleteTarget || !product) return;
    setDeleteLoading(true);
    try {
      if (deleteTarget.kind === 'product') {
        await productsApi.remove(product.id);
        navigate('/products', { replace: true });
        return;
      }
      await bomApi.remove(product.id, deleteTarget.item.id);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setDeleteLoading(false);
    }
  };

  // BOM qatori tugmalari — jadvalda ham, telefon kartalarida ham bir xil
  const bomActions = (item: BOMItem) => (
    <>
      <Tooltip title={tr("Tahrirlash")}>
        <IconButton size="small" onClick={() => { setEditingItem(item); setBomDialogOpen(true); }}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={tr("O'chirish")}>
        <IconButton size="small" color="error" onClick={() => setDeleteTarget({ kind: 'bom', item })}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );

  if (notFound) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography variant="h6">{tr("Mahsulot topilmadi")}</Typography>
        <Button component={RouterLink} to="/products" sx={{ mt: 2 }} startIcon={<ArrowBackIcon />}>
          {tr("Mahsulotlar ro'yxatiga")}
        </Button>
      </Box>
    );
  }

  if (!product) {
    return (
      <>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Skeleton width={120} sx={{ mb: 1 }} />
        <Skeleton width={280} height={40} />
        <Skeleton width={120} sx={{ mb: 3 }} />
        {/* Ma'lumotlar kartasi + BOM jadvali kartasi */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 2fr' }, alignItems: 'start' }}>
          <CardSkeleton lines={6} />
          <Card>
            <CardContent>
              <Skeleton width="45%" height={32} />
              <Skeleton width="35%" sx={{ mb: 1 }} />
            </CardContent>
            <Table>
              <TableBody>
                <TableRowsSkeleton cols={5} rows={4} />
              </TableBody>
            </Table>
          </Card>
        </Box>
      </>
    );
  }

  return (
    <>
      <Button component={RouterLink} to="/products" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Mahsulotlar")}
      </Button>

      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h5">{product.name}</Typography>
            <ProductStatusChip status={product.status} />
          </Box>
          <Typography color="text.secondary" sx={{ mt: 0.5, fontFamily: 'monospace' }}>
            {product.code}
          </Typography>
        </Box>
        {canEdit && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setProductFormOpen(true)}>
              {tr("Tahrirlash")}
            </Button>
            <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteTarget({ kind: 'product' })}>
              {tr("O'chirish")}
            </Button>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 2fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {tr("Ma'lumotlar")}
            </Typography>
            <InfoRow label={tr("Kategoriya")}>{product.category}</InfoRow>
            <InfoRow label={tr("Ishlab chiqarish birligi")}>{PRODUCTION_UNIT_LABELS[product.unit]}</InfoRow>
            {product.factory && <InfoRow label={tr("Fabrika")}>{product.factory.name}</InfoRow>}
            <InfoRow label={tr("O'lchamlar")}><VariantChips values={product.sizes} max={20} /></InfoRow>
            <InfoRow label={tr("Ranglar")}><VariantChips values={product.colors} max={20} /></InfoRow>
            <InfoRow label={tr("Yangilangan")}>{formatDateTime(product.updated_at)}</InfoRow>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 0.5 }}>
              {tr("Tavsif")}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
              {product.description || '—'}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent sx={{ pb: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1 }}>
              {/* Tor ekranda tugma sarlavhani siqmasdan keyingi qatorga o'tadi */}
              <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
                <Typography variant="h6">{tr("BOM — material tarkibi")}</Typography>
                <Typography variant="body2" color="text.secondary">
                  1 {PRODUCTION_UNIT_LABELS[product.unit].toLowerCase()} {tr("mahsulot uchun sarf me'yorlari")}
                </Typography>
              </Box>
              {canEdit && (
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => { setEditingItem(null); setBomDialogOpen(true); }}
                  sx={{ width: { xs: '100%', sm: 'auto' } }}
                >
                  {tr("Material qo'shish")}
                </Button>
              )}
            </Box>
            {summary.length > 0 && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                {summary.map(([type, count]) => (
                  <Chip key={type} size="small" variant="outlined" label={`${MATERIAL_TYPE_LABELS[type as BOMItem['material_type']]}: ${count}`} />
                ))}
              </Box>
            )}
          </CardContent>
          {isMobile ? (
            <Box>
              <Divider />
              {product.bom_items.map((item) => {
                const unit = MATERIAL_UNIT_LABELS[item.unit];
                const total = item.quantity * (1 + item.waste_percent / 100);
                return (
                  <MobileListItem
                    key={item.id}
                    overline={`${MATERIAL_TYPE_LABELS[item.material_type]}${item.material_code ? ` · ${item.material_code}` : ''}`}
                    title={item.material_name}
                    subtitle={item.notes ?? undefined}
                    trailing={
                      <>
                        <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {formatQuantity(total)} {unit}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {formatQuantity(item.quantity)} + {formatQuantity(item.waste_percent)}%
                        </Typography>
                      </>
                    }
                    actions={canEdit && bomActions(item)}
                  />
                );
              })}
              {product.bom_items.length === 0 && (
                <MobileListEmpty>
                  {tr("BOM hali to'ldirilmagan")}{canEdit && tr(" — mato, ip, tugma va boshqa materiallarni qo'shing")}
                </MobileListEmpty>
              )}
            </Box>
          ) : (
          <TableContainer>
            <Table sx={{ minWidth: 600 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Turi")}</TableCell>
                  <TableCell>{tr("Material")}</TableCell>
                  <TableCell align="right">{tr("Miqdor")}</TableCell>
                  <TableCell align="right">{tr("Isrof")}</TableCell>
                  <TableCell align="right">{tr("Jami sarf")}</TableCell>
                  {canEdit && <TableCell align="right">{tr("Amallar")}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {product.bom_items.map((item) => {
                  const unit = MATERIAL_UNIT_LABELS[item.unit];
                  const total = item.quantity * (1 + item.waste_percent / 100);
                  return (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Chip size="small" label={MATERIAL_TYPE_LABELS[item.material_type]} />
                      </TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: 14, fontWeight: 500 }}>{item.material_name}</Typography>
                        {item.material_id && (
                          <Typography
                            component={RouterLink}
                            to={`/inventory/materials/${item.material_id}`}
                            variant="caption"
                            sx={{ color: 'primary.main', textDecoration: 'none', fontFamily: 'monospace', '&:hover': { textDecoration: 'underline' } }}
                          >
                            {tr("Katalog:")}{' '}{item.material_code}
                          </Typography>
                        )}
                        {item.notes && (
                          <Typography variant="body2" color="text.secondary">
                            {item.notes}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{formatQuantity(item.quantity)} {unit}</TableCell>
                      <TableCell align="right">{formatQuantity(item.waste_percent)}%</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {formatQuantity(total)} {unit}
                      </TableCell>
                      {canEdit && (
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {bomActions(item)}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {product.bom_items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("BOM hali to'ldirilmagan")}
                      {canEdit && tr(" — mato, ip, tugma, fermuar va boshqa materiallarni qo'shing")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          )}
        </Card>
      </Box>

      <ProductFormDialog
        open={productFormOpen}
        product={product}
        onClose={() => setProductFormOpen(false)}
        onSaved={(saved) => { setProductFormOpen(false); setProduct(saved); }}
      />
      <BomItemDialog
        open={bomDialogOpen}
        product={product}
        item={editingItem}
        onClose={() => setBomDialogOpen(false)}
        onSaved={() => { setBomDialogOpen(false); load(); }}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        title={deleteTarget?.kind === 'product' ? tr("Mahsulotni o'chirish") : tr("Materialni o'chirish")}
        message={
          deleteTarget?.kind === 'product'
            ? tr("\"{0}\" va uning butun BOM tarkibi o'chiriladi. Davom etasizmi?", product.name)
            : tr("\"{0}\" BOM'dan o'chiriladi.", deleteTarget?.kind === 'bom' ? deleteTarget.item.material_name : '')
        }
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 1, borderBottom: 1, borderColor: 'divider' }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right', fontSize: 14, fontWeight: 500, display: 'flex', justifyContent: 'flex-end' }}>{children}</Box>
    </Box>
  );
}

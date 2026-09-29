import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import type { Factory } from '@/shared/types';
import { formatMoney } from '@/shared/utils/money';
import { productsApi } from '../api';
import ProductFormDialog from '../components/ProductFormDialog';
import ProductStatusChip from '../components/ProductStatusChip';
import VariantChips from '../components/VariantChips';
import { keysOf, PRODUCT_STATUS_LABELS, PRODUCTION_UNIT_LABELS } from '../constants';
import { useCanEditProducts } from '../permissions';
import type { Product, ProductListItem, ProductStatus } from '../types';
import { tr } from '@/i18n';

export default function ProductsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canEdit = useCanEditProducts();
  const isMobile = useIsMobile();

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<ProductListItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await productsApi.list({ search, category, status, factory_id: factoryId }));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, category, status, factoryId]);

  const loadCategories = useCallback(() => {
    productsApi.categories().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    loadCategories();
    if (isSuperAdmin) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [loadCategories, isSuperAdmin]);

  const counts = useMemo(() => {
    const c: Record<ProductStatus, number> = { DRAFT: 0, ACTIVE: 0, ARCHIVED: 0 };
    products.forEach((p) => (c[p.status] += 1));
    return c;
  }, [products]);

  const hasFilters = !!(search || category || status || factoryId);
  const resetFilters = () => {
    setSearch('');
    setCategory('');
    setStatus('');
    setFactoryId('');
  };

  const openEdit = async (id: number) => {
    try {
      setEditing(await productsApi.get(id));
      setFormOpen(true);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await productsApi.remove(deleting.id);
      setDeleting(null);
      load();
      loadCategories();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setDeleteLoading(false);
    }
  };

  const colSpan = 8 + (isSuperAdmin ? 1 : 0);

  const rowActions = (p: ProductListItem) => (
    <>
      <Tooltip title={tr("Tahrirlash")}>
        <IconButton size="small" onClick={() => openEdit(p.id)}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={tr("O'chirish")}>
        <IconButton size="small" color="error" onClick={() => setDeleting(p)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );

  return (
    <>
      <PageHeader
        title={tr("Mahsulotlar")}
        subtitle={tr("Ishlab chiqariladigan kiyim mahsulotlari va ularning tarkibi (BOM)")}
        action={
          canEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              {tr("Yangi mahsulot")}
            </Button>
          )
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Nomi yoki kodi...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ maxWidth: 280 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Kategoriya")} value={category} onChange={(e) => setCategory(e.target.value)} sx={{ maxWidth: 200 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {categories.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label={tr("Status")} value={status} onChange={(e) => setStatus(e.target.value as ProductStatus | '')} sx={{ maxWidth: 180 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {keysOf(PRODUCT_STATUS_LABELS).map((s) => (
              <MenuItem key={s} value={s}>
                {PRODUCT_STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
          {isSuperAdmin && (
            <TextField
              select
              label={tr("Fabrika")}
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ maxWidth: 220 }}
            >
              <MenuItem value="">{tr("Barchasi")}</MenuItem>
              {factories.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          {hasFilters && (
            <Button color="inherit" startIcon={<FilterAltOffOutlinedIcon />} onClick={resetFilters}>
              {tr("Tozalash")}
            </Button>
          )}
        </FilterBar>
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 1.5, mt: -0.5 }}>
          {tr("Jami:")}{' '}<b>{products.length}</b> {tr("· Faol:")}{' '}{counts.ACTIVE} {tr("· Qoralama:")}{' '}{counts.DRAFT} {tr("· Arxiv:")}{' '}{counts.ARCHIVED}
        </Typography>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && products.length === 0 && <MobileListSkeleton />}
            {products.map((p) => (
              <MobileListItem
                key={p.id}
                onClick={() => navigate(`/products/${p.id}`)}
                overline={p.code}
                title={p.name}
                subtitle={[p.category, isSuperAdmin ? p.factory?.name : null, tr("BOM: {0}", p.bom_items_count)].filter(Boolean).join(' · ')}
                trailing={
                  <>
                    <ProductStatusChip status={p.status} />
                    <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.75, whiteSpace: 'nowrap' }}>
                      {p.price !== null ? formatMoney(p.price) : '—'}
                    </Typography>
                  </>
                }
                meta={
                  (p.sizes.length > 0 || p.colors.length > 0) && (
                    <>
                      <VariantChips values={p.sizes} max={5} />
                      <VariantChips values={p.colors} max={3} />
                    </>
                  )
                }
                actions={canEdit && rowActions(p)}
              />
            ))}
            {!loading && products.length === 0 && (
              <MobileListEmpty>{hasFilters ? tr("Filtrlarga mos mahsulot topilmadi") : tr("Hali mahsulotlar qo'shilmagan")}</MobileListEmpty>
            )}
          </Box>
        ) : (
        <TableContainer>
          <Table sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Mahsulot")}</TableCell>
                {isSuperAdmin && <TableCell>{tr("Fabrika")}</TableCell>}
                <TableCell>{tr("Kategoriya")}</TableCell>
                <TableCell>{tr("O'lchamlar")}</TableCell>
                <TableCell>{tr("Ranglar")}</TableCell>
                <TableCell align="right">{tr("Narx")}</TableCell>
                <TableCell align="center">{tr("BOM")}</TableCell>
                <TableCell>{tr("Status")}</TableCell>
                <TableCell align="right">{canEdit ? tr("Amallar") : ''}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && products.length === 0 && <TableRowsSkeleton cols={colSpan} />}
              {products.map((p) => (
                <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/products/${p.id}`)}>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.code}</Typography>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{p.name}</Typography>
                    {p.description && (
                      <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: 220 }}>
                        {p.description}
                      </Typography>
                    )}
                  </TableCell>
                  {isSuperAdmin && <TableCell>{p.factory?.name ?? '—'}</TableCell>}
                  <TableCell>{p.category}</TableCell>
                  <TableCell><VariantChips values={p.sizes} compact /></TableCell>
                  <TableCell><VariantChips values={p.colors} compact range={false} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {p.price !== null ? formatMoney(p.price) : <Typography variant="body2" color="text.secondary">—</Typography>}
                    <Typography variant="caption" color="text.secondary" component="div">{PRODUCTION_UNIT_LABELS[p.unit]}</Typography>
                  </TableCell>
                  <TableCell align="center">{p.bom_items_count}</TableCell>
                  <TableCell><ProductStatusChip status={p.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {canEdit && rowActions(p)}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {hasFilters ? tr("Filtrlarga mos mahsulot topilmadi") : tr("Hali mahsulotlar qo'shilmagan")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        )}
      </Card>

      <ProductFormDialog
        open={formOpen}
        product={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setFormOpen(false);
          loadCategories();
          if (!editing) navigate(`/products/${saved.id}`);
          else load();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={tr("Mahsulotni o'chirish")}
        message={tr("\"{0}\" ({1}) va uning BOM tarkibi o'chiriladi. Davom etasizmi?", deleting?.name, deleting?.code)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

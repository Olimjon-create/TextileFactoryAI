import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Box,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '@/features/auth/AuthContext';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import type { Factory } from '@/shared/types';
import { factoriesApi } from '../api';
import FactoryFormDialog from '../components/FactoryFormDialog';
import { formatDate } from '@/shared/utils/dates';
import { tr } from '@/i18n';

export default function FactoriesPage() {
  const { hasRole } = useAuth();
  const isSuperAdmin = hasRole('SUPER_ADMIN');
  const canEdit = hasRole('SUPER_ADMIN', 'FACTORY_OWNER');
  const isMobile = useIsMobile();

  const [factories, setFactories] = useState<Factory[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Factory | null>(null);
  const [deleting, setDeleting] = useState<Factory | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFactories(await factoriesApi.list(search));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await factoriesApi.remove(deleting.id);
      setDeleting(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setDeleteLoading(false);
    }
  };

  // Tahrirlash (egasi va admin) / o'chirish (faqat admin) — jadvalda ham, telefon kartalarida ham
  const rowActions = (f: Factory) => (
    <>
      <Tooltip title={tr("Tahrirlash")}>
        <IconButton size="small" onClick={() => { setEditing(f); setFormOpen(true); }}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {isSuperAdmin && (
        <Tooltip title={tr("O'chirish")}>
          <IconButton size="small" color="error" onClick={() => setDeleting(f)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        title={isSuperAdmin ? tr("Fabrikalar") : tr("Mening fabrikam")}
        subtitle={isSuperAdmin ? tr("Platformadagi barcha fabrikalarni boshqarish") : tr("Fabrika ma'lumotlari")}
        action={
          isSuperAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
              {tr("Yangi fabrika")}
            </Button>
          )
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        {isSuperAdmin && (
          <Box sx={{ p: 2 }}>
            <TextField
              placeholder={tr("Nomi bo'yicha qidirish...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ maxWidth: 360 }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
            />
          </Box>
        )}
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && factories.length === 0 && <MobileListSkeleton rows={2} />}
            {factories.map((f) => (
              <MobileListItem
                key={f.id}
                title={f.name}
                subtitle={[f.city, f.address, f.phone].filter(Boolean).join(' · ') || undefined}
                trailing={<Chip size="small" label={f.is_active ? tr("Faol") : tr("Nofaol")} color={f.is_active ? 'success' : 'default'} />}
                meta={
                  <Typography variant="caption" color="text.secondary">
                    {f.users_count} {tr("xodim ·")}{' '}{formatDate(f.created_at)}
                  </Typography>
                }
                actions={canEdit && rowActions(f)}
              />
            ))}
            {!loading && factories.length === 0 && <MobileListEmpty>{tr("Fabrikalar topilmadi")}</MobileListEmpty>}
          </Box>
        ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Nomi")}</TableCell>
                <TableCell>{tr("Manzil")}</TableCell>
                <TableCell>{tr("Telefon")}</TableCell>
                <TableCell align="center">{tr("Xodimlar")}</TableCell>
                <TableCell>{tr("Holati")}</TableCell>
                <TableCell>{tr("Yaratilgan")}</TableCell>
                {canEdit && <TableCell align="right">{tr("Amallar")}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Birinchi yuklanishda — jadval qatorlari shaklidagi skeleton */}
              {loading && factories.length === 0 && <TableRowsSkeleton cols={canEdit ? 7 : 6} />}
              {factories.map((f) => (
                <TableRow key={f.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{f.name}</TableCell>
                  <TableCell>{f.address || '—'}</TableCell>
                  <TableCell>{f.phone || '—'}</TableCell>
                  <TableCell align="center">{f.users_count}</TableCell>
                  <TableCell>
                    <Chip size="small" label={f.is_active ? tr("Faol") : tr("Nofaol")} color={f.is_active ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell>{formatDate(f.created_at)}</TableCell>
                  {canEdit && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {rowActions(f)}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && factories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {tr("Fabrikalar topilmadi")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        )}
      </Card>

      <FactoryFormDialog
        open={formOpen}
        factory={editing}
        canToggleActive={isSuperAdmin}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={tr("Fabrikani o'chirish")}
        message={tr("\"{0}\" fabrikasi va uning barcha foydalanuvchilari o'chiriladi. Davom etasizmi?", deleting?.name)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

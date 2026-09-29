import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { procurementApi } from '../api';
import SupplierFormDialog from '../components/SupplierFormDialog';
import { useCanEditProcurement } from '../permissions';
import type { Supplier } from '../types';
import { tr } from '@/i18n';

export default function SuppliersPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const canEdit = useCanEditProcurement();
  const [items, setItems] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<'true' | 'false'>('true');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await procurementApi.suppliers({
        search: search.trim(),
        is_active: active === 'true',
        offset: page * rowsPerPage,
        limit: rowsPerPage,
      });
      setItems(res.items);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, active, page, rowsPerPage]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => setPage(0), [search, active, rowsPerPage]);

  const terms = (s: Supplier) =>
    [s.lead_time_days != null ? tr("yetkazish {0} kun", s.lead_time_days) : null, s.payment_terms_days != null ? tr("to'lov {0} kun", s.payment_terms_days) : null].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        title={tr("Yetkazib beruvchilar")}
        subtitle={tr("Mato, ip, furnitura va qadoq yetkazib beruvchilar: shartlar va yetkazish ko'rsatkichlari")}
        action={
          canEdit && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
              {tr("Yetkazib beruvchi")}
            </Button>
          )
        }
      />
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Nomi, kod, telefon, mas'ul shaxs...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 260px', maxWidth: 380 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Holati")} value={active} onChange={(e) => setActive(e.target.value as 'true' | 'false')} sx={{ width: 160 }}>
            <MenuItem value="true">{tr("Faol")}</MenuItem>
            <MenuItem value="false">{tr("Nofaol")}</MenuItem>
          </TextField>
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && items.length === 0 && <MobileListSkeleton />}
            {items.map((s) => (
              <MobileListItem
                key={s.id}
                onClick={() => navigate(`/suppliers/${s.id}`)}
                overline={s.code}
                title={s.name}
                subtitle={[s.contact_person, s.phone, terms(s)].filter(Boolean).join(' · ') || undefined}
                trailing={s.open_orders > 0 ? <Chip size="small" color="info" label={tr("{0} kutilmoqda", s.open_orders)} /> : !s.is_active ? <Chip size="small" label={tr("Nofaol")} /> : undefined}
              />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Yetkazib beruvchilar yo'q")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Kod")}</TableCell>
                  <TableCell>{tr("Nomi")}</TableCell>
                  <TableCell>{tr("Aloqa")}</TableCell>
                  <TableCell>{tr("Shartlar")}</TableCell>
                  <TableCell align="center">{tr("Kutilmoqda")}</TableCell>
                  <TableCell align="right">{tr("Qabul qilingan tovar")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={6} />}
                {items.map((s) => (
                  <TableRow key={s.id} hover onClick={() => navigate(`/suppliers/${s.id}`)} sx={{ cursor: 'pointer', opacity: s.is_active ? 1 : 0.6 }}>
                    <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{s.code}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{s.name}</Typography>
                      {!s.is_active && <Chip size="small" label={tr("Nofaol")} sx={{ mt: 0.5 }} />}
                    </TableCell>
                    <TableCell>
                      {s.contact_person ?? '—'}
                      <Typography variant="body2" color="text.secondary">
                        {s.phone ?? ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{terms(s) || '—'}</Typography>
                    </TableCell>
                    <TableCell align="center">{s.open_orders ? <Chip size="small" color="info" label={s.open_orders} /> : '—'}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {formatMoney(s.received_value)}
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Yetkazib beruvchilar yo'q")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => setRowsPerPage(Number(e.target.value))}
          rowsPerPageOptions={[10, 25, 50, 100]}
          labelRowsPerPage={tr("Sahifada:")}
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
        />
      </Card>
      <SupplierFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={(s) => {
          setFormOpen(false);
          navigate(`/suppliers/${s.id}`);
        }}
      />
    </>
  );
}

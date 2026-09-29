import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import CountrySelect from '@/shared/components/CountrySelect';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import type { Factory } from '@/shared/types';
import { countryName } from '@/shared/utils/countries';
import ExportButton from '@/shared/components/ExportButton';
import { fetchAll } from '@/shared/utils/csv';
import { formatDate } from '@/shared/utils/dates';
import { customersApi } from '../api';
import CustomerFormDialog from '../components/CustomerFormDialog';
import CustomerStatusChip from '../components/CustomerStatusChip';
import { CUSTOMER_STATUS_LABELS, CUSTOMER_STATUSES, CUSTOMER_TYPE_LABELS, CUSTOMER_TYPES } from '../constants';
import { useCanManageCustomers } from '../permissions';
import type { Customer, CustomerStats, CustomerStatus, CustomerType } from '../types';
import { tr } from '@/i18n';

const STAT_CARDS: { key: CustomerStatus | ''; label: string; color: string }[] = [
  { key: '', label: tr("Jami mijozlar"), color: 'primary.main' },
  { key: 'ACTIVE', label: CUSTOMER_STATUS_LABELS.ACTIVE, color: 'success.main' },
  { key: 'LEAD', label: CUSTOMER_STATUS_LABELS.LEAD, color: 'info.main' },
  { key: 'INACTIVE', label: CUSTOMER_STATUS_LABELS.INACTIVE, color: 'text.secondary' },
];

export default function CustomersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canManage = useCanManageCustomers();
  const isMobile = useIsMobile();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | ''>('');
  const [type, setType] = useState<CustomerType | ''>('');
  const [country, setCountry] = useState<string | null>(null);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customersApi.list({
        search: search.trim(),
        status,
        customer_type: type,
        country: country ?? undefined,
        factory_id: factoryId,
        offset: page * rowsPerPage,
        limit: rowsPerPage,
      });
      setCustomers(res.items);
      setTotal(res.total);
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, status, type, country, factoryId, page, rowsPerPage]);

  const loadMeta = useCallback(() => {
    customersApi.stats().then(setStats).catch(() => undefined);
    customersApi.countries().then(setCountries).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    loadMeta();
    if (isSuperAdmin) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [loadMeta, isSuperAdmin]);

  // Filtr o'zgarsa birinchi sahifaga qaytamiz
  useEffect(() => setPage(0), [search, status, type, country, factoryId, rowsPerPage]);

  const hasFilters = !!(search || status || type || country || factoryId);
  const resetFilters = () => {
    setSearch('');
    setStatus('');
    setType('');
    setCountry(null);
    setFactoryId('');
  };

  const refresh = () => {
    load();
    loadMeta();
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await customersApi.remove(deleting.id);
      setDeleting(null);
      refresh();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setDeleteLoading(false);
    }
  };

  const colSpan = 8 + (isSuperAdmin ? 1 : 0);

  // Tahrirlash/o'chirish — jadvalda ham, telefon kartalarida ham bir xil
  const rowActions = (c: Customer) => (
    <>
      <Tooltip title={tr("Tahrirlash")}>
        <IconButton size="small" onClick={() => { setEditing(c); setFormOpen(true); }}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={tr("O'chirish")}>
        <IconButton size="small" color="error" onClick={() => setDeleting(c)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );

  const exportRows = async () =>
    (
      await fetchAll((offset, limit) =>
        customersApi.list({ search: search.trim(), status, customer_type: type, country: country ?? undefined, factory_id: factoryId, offset, limit }),
      )
    ).map((c) => [
      c.customer_code,
      c.name,
      CUSTOMER_TYPE_LABELS[c.customer_type],
      CUSTOMER_STATUS_LABELS[c.status],
      c.contact_person,
      c.phone,
      c.email,
      c.country ? countryName(c.country) : null,
      c.address,
      c.factory?.name,
      formatDate(c.created_at),
      c.notes,
    ]);

  return (
    <>
      <PageHeader
        title={tr("Mijozlar")}
        subtitle={tr("Fabrika mijozlari bazasi (CRM)")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <ExportButton
              name="mijozlar"
              headers={['Kod', 'Nomi', 'Turi', 'Holat', "Mas'ul shaxs", 'Telefon', 'Email', 'Mamlakat', 'Manzil', 'Fabrika', "Qo'shilgan", 'Izoh']}
              load={exportRows}
            />
            {canManage && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
                {tr("Yangi mijoz")}
              </Button>
            )}
          </Box>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Status bo'yicha statistika — bosilganda filtr qo'llanadi */}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, mb: 2 }}>
        {STAT_CARDS.map((card) => {
          const value = card.key ? stats?.by_status[card.key] : stats?.total;
          const active = status === card.key;
          return (
            <Card key={card.label} sx={{ borderColor: active ? card.color : undefined, borderWidth: active ? 2 : 1 }}>
              <CardActionArea onClick={() => setStatus(card.key)}>
                <CardContent sx={{ py: 1.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    {card.label}
                  </Typography>
                  {stats ? (
                    <Typography variant="h5" sx={{ color: card.color }}>
                      {value ?? 0}
                    </Typography>
                  ) : (
                    <Skeleton width="35%" height={32} />
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Nomi, kodi, kontakt, telefon, email...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: '1 1 260px', maxWidth: 340 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Status")} value={status} onChange={(e) => setStatus(e.target.value as CustomerStatus | '')} sx={{ width: 160 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {CUSTOMER_STATUSES.map((s) => (
              <MenuItem key={s} value={s}>
                {CUSTOMER_STATUS_LABELS[s]}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label={tr("Turi")} value={type} onChange={(e) => setType(e.target.value as CustomerType | '')} sx={{ width: 170 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {CUSTOMER_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {CUSTOMER_TYPE_LABELS[t]}
              </MenuItem>
            ))}
          </TextField>
          <CountrySelect value={country} onChange={setCountry} onlyCodes={countries} sx={{ width: 200 }} />
          {isSuperAdmin && (
            <TextField
              select
              label={tr("Fabrika")}
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ width: 200 }}
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
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && customers.length === 0 && <MobileListSkeleton />}
            {customers.map((c) => (
              <MobileListItem
                key={c.id}
                onClick={() => navigate(`/customers/${c.id}`)}
                overline={c.customer_code}
                title={c.name}
                subtitle={[CUSTOMER_TYPE_LABELS[c.customer_type], c.contact_person, isSuperAdmin ? c.factory?.name : null]
                  .filter(Boolean)
                  .join(' · ')}
                trailing={<CustomerStatusChip status={c.status} />}
                meta={
                  <>
                    {c.phone && <Chip size="small" variant="outlined" label={c.phone} />}
                    {c.country && <Chip size="small" variant="outlined" label={countryName(c.country)} />}
                  </>
                }
                actions={canManage && rowActions(c)}
              />
            ))}
            {!loading && customers.length === 0 && (
              <MobileListEmpty>{hasFilters ? tr("Filtrlarga mos mijoz topilmadi") : tr("Hali mijozlar qo'shilmagan")}</MobileListEmpty>
            )}
          </Box>
        ) : (
        <TableContainer>
          <Table sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Kod")}</TableCell>
                <TableCell>{tr("Mijoz")}</TableCell>
                {isSuperAdmin && <TableCell>{tr("Fabrika")}</TableCell>}
                <TableCell>{tr("Kontakt shaxs")}</TableCell>
                <TableCell>{tr("Telefon")}</TableCell>
                <TableCell>{tr("Email")}</TableCell>
                <TableCell>{tr("Davlat")}</TableCell>
                <TableCell>{tr("Status")}</TableCell>
                <TableCell align="right">{canManage ? tr("Amallar") : ''}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Birinchi yuklanishda — jadval qatorlari shaklidagi skeleton */}
              {loading && customers.length === 0 && <TableRowsSkeleton cols={colSpan} />}
              {customers.map((c) => (
                <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/customers/${c.id}`)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.customer_code}</TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {CUSTOMER_TYPE_LABELS[c.customer_type]}
                    </Typography>
                  </TableCell>
                  {isSuperAdmin && <TableCell>{c.factory?.name ?? '—'}</TableCell>}
                  <TableCell>{c.contact_person || '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.phone || '—'}</TableCell>
                  <TableCell>{c.email || '—'}</TableCell>
                  <TableCell>{c.country ? countryName(c.country) : '—'}</TableCell>
                  <TableCell><CustomerStatusChip status={c.status} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                    {canManage && rowActions(c)}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {hasFilters ? tr("Filtrlarga mos mijoz topilmadi") : tr("Hali mijozlar qo'shilmagan")}
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

      <CustomerFormDialog
        open={formOpen}
        customer={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setFormOpen(false);
          if (!editing) navigate(`/customers/${saved.id}`);
          else refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={tr("Mijozni o'chirish")}
        message={tr("\"{0}\" ({1}) butunlay o'chiriladi. Davom etasizmi?", deleting?.name, deleting?.customer_code)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

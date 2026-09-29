import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchIcon from '@mui/icons-material/Search';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import FilterBar from '@/shared/components/FilterBar';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import RoleChip from '@/shared/components/RoleChip';
import { canManage, ROLE_LABELS, ROLES } from '@/shared/constants/roles';
import type { Factory, Role, User } from '@/shared/types';
import { usersApi } from '../api';
import UserFormDialog from '../components/UserFormDialog';
import { tr } from '@/i18n';

export default function UsersPage() {
  const { user: actor } = useAuth();
  const isSuperAdmin = actor?.role === 'SUPER_ADMIN';
  const isMobile = useIsMobile();

  const [users, setUsers] = useState<User[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await usersApi.list({ search, role, factory_id: factoryId }));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [search, role, factoryId]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (isSuperAdmin) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [isSuperAdmin]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await usersApi.remove(deleting.id);
      setDeleting(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!actor) return null;
  const editable = (u: User) => u.id !== actor.id && canManage(actor.role, u.role);

  const rowActions = (u: User) => (
    <>
      <Tooltip title={tr("Tahrirlash")}>
        <IconButton size="small" onClick={() => { setEditing(u); setFormOpen(true); }}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={tr("O'chirish")}>
        <IconButton size="small" color="error" onClick={() => setDeleting(u)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );

  return (
    <>
      <PageHeader
        title={tr("Foydalanuvchilar")}
        subtitle={isSuperAdmin ? tr("Barcha fabrikalar xodimlari") : tr("{0} xodimlari", actor.factory?.name ?? '')}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            {tr("Yangi foydalanuvchi")}
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <FilterBar>
          <TextField
            placeholder={tr("Ism yoki email...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ maxWidth: 300 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
          />
          <TextField select label={tr("Rol")} value={role} onChange={(e) => setRole(e.target.value as Role | '')} sx={{ maxWidth: 240 }}>
            <MenuItem value="">{tr("Barchasi")}</MenuItem>
            {ROLES.filter((r) => isSuperAdmin || r !== 'SUPER_ADMIN').map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </MenuItem>
            ))}
          </TextField>
          {isSuperAdmin && (
            <TextField
              select
              label={tr("Fabrika")}
              value={factoryId}
              onChange={(e) => setFactoryId(e.target.value === '' ? '' : Number(e.target.value))}
              sx={{ maxWidth: 240 }}
            >
              <MenuItem value="">{tr("Barchasi")}</MenuItem>
              {factories.map((f) => (
                <MenuItem key={f.id} value={f.id}>
                  {f.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </FilterBar>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && users.length === 0 && <MobileListSkeleton />}
            {users.map((u) => (
              <MobileListItem
                key={u.id}
                title={
                  <>
                    {u.full_name} {u.id === actor.id && <Chip label={tr("Siz")} size="small" sx={{ ml: 0.5, height: 20 }} />}
                  </>
                }
                subtitle={[u.email, u.phone, isSuperAdmin ? u.factory?.name : null].filter(Boolean).join(' · ')}
                trailing={<Chip size="small" label={u.is_active ? tr("Faol") : tr("Bloklangan")} color={u.is_active ? 'success' : 'default'} />}
                meta={<RoleChip role={u.role} />}
                actions={editable(u) && rowActions(u)}
              />
            ))}
            {!loading && users.length === 0 && <MobileListEmpty>{tr("Foydalanuvchilar topilmadi")}</MobileListEmpty>}
          </Box>
        ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{tr("Foydalanuvchi")}</TableCell>
                <TableCell>{tr("Rol")}</TableCell>
                {isSuperAdmin && <TableCell>{tr("Fabrika")}</TableCell>}
                <TableCell>{tr("Telefon")}</TableCell>
                <TableCell>{tr("Holati")}</TableCell>
                <TableCell align="right">{tr("Amallar")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && users.length === 0 && <TableRowsSkeleton cols={isSuperAdmin ? 6 : 5} />}
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                      {u.full_name} {u.id === actor.id && <Chip label={tr("Siz")} size="small" sx={{ ml: 0.5 }} />}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {u.email}
                    </Typography>
                  </TableCell>
                  <TableCell><RoleChip role={u.role} /></TableCell>
                  {isSuperAdmin && <TableCell>{u.factory?.name ?? '—'}</TableCell>}
                  <TableCell>{u.phone || '—'}</TableCell>
                  <TableCell>
                    <Chip size="small" label={u.is_active ? tr("Faol") : tr("Bloklangan")} color={u.is_active ? 'success' : 'default'} />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {editable(u) && rowActions(u)}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    {tr("Foydalanuvchilar topilmadi")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        )}
      </Card>

      <UserFormDialog
        open={formOpen}
        user={editing}
        factories={factories}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); load(); }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={tr("Foydalanuvchini o'chirish")}
        message={tr("{0} ({1}) o'chiriladi. Davom etasizmi?", deleting?.full_name, deleting?.email)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

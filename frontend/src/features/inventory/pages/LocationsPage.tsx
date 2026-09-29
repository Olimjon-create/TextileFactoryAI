import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import QrLabelsDialog from '../components/QrLabelsDialog';
import { useAuth } from '@/features/auth/AuthContext';
import { factoriesApi } from '@/features/factories/api';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { MobileListEmpty, MobileListItem, MobileListSkeleton } from '@/shared/components/MobileList';
import PageHeader from '@/shared/components/PageHeader';
import SaveButton from '@/shared/components/SaveButton';
import { TableRowsSkeleton } from '@/shared/components/skeletons';
import { useToast } from '@/shared/components/Toast';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { useSaveAction } from '@/shared/hooks/useSaveAction';
import type { Factory } from '@/shared/types';
import { inventoryApi } from '../api';
import { useCanEditInventory } from '../permissions';
import type { WarehouseLocation } from '../types';
import { tr } from '@/i18n';

function LocationDialog({
  open,
  location,
  onClose,
  onSaved,
}: {
  open: boolean;
  location: WarehouseLocation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const needsFactory = user?.role === 'SUPER_ADMIN' && !location;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const [factoryId, setFactoryId] = useState<number | ''>('');
  const [factories, setFactories] = useState<Factory[]>([]);
  const [error, setError] = useState('');
  const save = useSaveAction();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    save.reset();
    setError('');
    setCode(location?.code ?? '');
    setName(location?.name ?? '');
    setActive(location?.is_active ?? true);
    setFactoryId('');
    if (needsFactory) factoriesApi.list().then(setFactories).catch(() => undefined);
  }, [open, location, needsFactory, save.reset]);

  const codeValid = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/.test(code.trim());
  const valid = codeValid && name.trim().length >= 2 && (!needsFactory || factoryId !== '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setError('');
    try {
      await save.run(() =>
        location
          ? inventoryApi.updateLocation(location.id, { code: code.trim().toUpperCase(), name: name.trim(), is_active: active })
          : inventoryApi.createLocation({ code: code.trim().toUpperCase(), name: name.trim(), ...(needsFactory ? { factory_id: Number(factoryId) } : {}) }),
      );
      toast.success(location ? tr("O'zgarishlar saqlandi") : tr("Ombor joyi qo'shildi"));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={save.busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <form onSubmit={submit} noValidate>
        <DialogTitle>{location ? tr("Ombor joyini tahrirlash") : tr("Yangi ombor joyi")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {needsFactory && (
              <TextField select label={tr("Fabrika")} required value={factoryId} onChange={(e) => setFactoryId(Number(e.target.value))}>
                {factories.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label={tr("Kod")}
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A-1"
              error={code !== '' && !codeValid}
              helperText={tr("Javon/bo'lim belgisi, masalan A-1, MATO-2")}
            />
            <TextField label={tr("Nomi")} required value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Mato ombori, 1-javon")} />
            {location && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label={tr("Faol")} />}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} color="inherit" disabled={save.busy}>
            {tr("Bekor qilish")}
          </Button>
          <SaveButton status={save.status} disabled={!valid} />
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default function LocationsPage() {
  const canEdit = useCanEditInventory();
  const isMobile = useIsMobile();
  const toast = useToast();
  const [items, setItems] = useState<WarehouseLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ open: boolean; location: WarehouseLocation | null }>({ open: false, location: null });
  const [deleting, setDeleting] = useState<WarehouseLocation | null>(null);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const locationLabels = useMemo(
    () => items.filter((l) => l.is_active).map((l) => ({ key: String(l.id), qr: `TCL:${l.id}`, title: l.code, subtitle: l.name })),
    [items],
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await inventoryApi.locations(true));
      setError('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await inventoryApi.removeLocation(deleting.id);
      toast.success(tr("Ombor joyi o'chirildi"));
      setDeleting(null);
      load();
    } catch (e) {
      setError(getErrorMessage(e));
      setDeleting(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const actions = (l: WarehouseLocation) => (
    <>
      <Tooltip title={tr("Tahrirlash")}>
        <IconButton size="small" onClick={() => setDialog({ open: true, location: l })}>
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={tr("O'chirish")}>
        <IconButton size="small" color="error" onClick={() => setDeleting(l)}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );
  const statusChip = (l: WarehouseLocation) => <Chip size="small" label={l.is_active ? tr("Faol") : tr("Nofaol")} color={l.is_active ? 'success' : 'default'} />;

  return (
    <>
      <PageHeader
        title={tr("Ombor joylari")}
        subtitle={tr("Bo'limlar, javonlar va sex yonidagi omborlar")}
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" color="inherit" startIcon={<QrCode2Icon />} onClick={() => setLabelsOpen(true)} disabled={!items.length}>
              {tr('QR yorliqlar')}
            </Button>
            {canEdit && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ open: true, location: null })}>
                {tr("Yangi joy")}
              </Button>
            )}
          </Box>
        }
      />
      <QrLabelsDialog
        open={labelsOpen}
        title={tr('Ombor joyi yorliqlari')}
        labels={locationLabels}
        onClose={() => setLabelsOpen(false)}
      />
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      <Card>
        {loading && <LinearProgress />}
        {isMobile ? (
          <Box>
            {loading && items.length === 0 && <MobileListSkeleton rows={3} />}
            {items.map((l) => (
              <MobileListItem key={l.id} overline={l.code} title={l.name} subtitle={tr("{0} xil material", l.materials_count)} trailing={statusChip(l)} actions={canEdit && actions(l)} />
            ))}
            {!loading && items.length === 0 && <MobileListEmpty>{tr("Ombor joylari yo'q. Kirim qilishdan oldin kamida bitta joy qo'shing.")}</MobileListEmpty>}
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{tr("Kod")}</TableCell>
                  <TableCell>{tr("Nomi")}</TableCell>
                  <TableCell align="center">{tr("Materiallar")}</TableCell>
                  <TableCell>{tr("Holati")}</TableCell>
                  {canEdit && <TableCell align="right">{tr("Amallar")}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && items.length === 0 && <TableRowsSkeleton cols={5} rows={3} />}
                {items.map((l) => (
                  <TableRow key={l.id} hover sx={{ opacity: l.is_active ? 1 : 0.6 }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{l.code}</TableCell>
                    <TableCell>{l.name}</TableCell>
                    <TableCell align="center">{l.materials_count} {tr("xil")}</TableCell>
                    <TableCell>{statusChip(l)}</TableCell>
                    {canEdit && <TableCell align="right">{actions(l)}</TableCell>}
                  </TableRow>
                ))}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      {tr("Ombor joylari yo'q. Kirim qilishdan oldin kamida bitta joy qo'shing (masalan, «A-1 Mato ombori»).")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
      <LocationDialog
        open={dialog.open}
        location={dialog.location}
        onClose={() => setDialog({ open: false, location: null })}
        onSaved={() => {
          setDialog({ open: false, location: null });
          load();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={tr("Ombor joyini o'chirish")}
        message={tr("\"{0}\" o'chiriladi. Harakatlar tarixi bor joyni o'chirib bo'lmaydi — uni nofaol qiling.", deleting?.name)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

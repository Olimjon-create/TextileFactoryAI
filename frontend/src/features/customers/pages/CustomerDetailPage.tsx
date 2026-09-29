import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Link, Skeleton, Typography } from '@mui/material';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ConfirmDialog';
import { CardSkeleton } from '@/shared/components/skeletons';
import { countryName } from '@/shared/utils/countries';
import { customersApi } from '../api';
import CustomerFormDialog from '../components/CustomerFormDialog';
import CustomerStatusChip from '../components/CustomerStatusChip';
import { CUSTOMER_TYPE_LABELS } from '../constants';
import { useCanManageCustomers } from '../permissions';
import type { Customer } from '../types';
import { formatDateTime } from '@/shared/utils/dates';
import { tr } from '@/i18n';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const customerId = Number(id);
  const navigate = useNavigate();
  const canManage = useCanManageCustomers();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setCustomer(await customersApi.get(customerId));
    } catch (e) {
      const msg = getErrorMessage(e);
      if (msg === 'Mijoz topilmadi') setNotFound(true);
      else setError(msg);
    }
  }, [customerId]);

  useEffect(() => {
    if (Number.isInteger(customerId)) load();
    else setNotFound(true);
  }, [load, customerId]);

  const handleDelete = async () => {
    if (!customer) return;
    setDeleteLoading(true);
    try {
      await customersApi.remove(customer.id);
      navigate('/customers', { replace: true });
    } catch (e) {
      setError(getErrorMessage(e));
      setDeleteLoading(false);
      setDeleteOpen(false);
    }
  };

  if (notFound) {
    return (
      <Box sx={{ textAlign: 'center', py: 10 }}>
        <Typography variant="h6">{tr("Mijoz topilmadi")}</Typography>
        <Button component={RouterLink} to="/customers" sx={{ mt: 2 }} startIcon={<ArrowBackIcon />}>
          {tr("Mijozlar ro'yxatiga")}
        </Button>
      </Box>
    );
  }

  if (!customer) {
    return (
      <>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Skeleton width={110} sx={{ mb: 1 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <Skeleton variant="rounded" width={56} height={56} />
          <Box sx={{ flex: 1 }}>
            <Skeleton width="35%" height={36} />
            <Skeleton width="20%" />
          </Box>
        </Box>
        {/* Aloqa, manzil va izoh kartalari */}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <CardSkeleton lines={3} />
          <CardSkeleton lines={2} />
          <Box sx={{ gridColumn: { md: '1 / -1' } }}>
            <CardSkeleton lines={2} />
          </Box>
        </Box>
      </>
    );
  }

  const isCompany = customer.customer_type === 'COMPANY';

  return (
    <>
      <Button component={RouterLink} to="/customers" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1 }}>
        {tr("Mijozlar")}
      </Button>

      <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 3 }}>
        <Avatar variant="rounded" sx={{ width: 56, height: 56, bgcolor: isCompany ? 'primary.main' : 'secondary.main' }}>
          {isCompany ? <ApartmentOutlinedIcon /> : <PersonOutlineIcon />}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h5">{customer.name}</Typography>
            <CustomerStatusChip status={customer.status} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5, flexWrap: 'wrap' }}>
            <Typography color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              {customer.customer_code}
            </Typography>
            <Chip size="small" variant="outlined" label={CUSTOMER_TYPE_LABELS[customer.customer_type]} />
          </Box>
        </Box>
        {canManage && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setFormOpen(true)}>
              {tr("Tahrirlash")}
            </Button>
            <Button variant="outlined" color="error" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteOpen(true)}>
              {tr("O'chirish")}
            </Button>
          </Box>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {tr("Aloqa ma'lumotlari")}
            </Typography>
            <ContactRow icon={<PersonOutlineIcon />} label={tr("Kontakt shaxs")} value={customer.contact_person} />
            <ContactRow
              icon={<PhoneOutlinedIcon />}
              label={tr("Telefon")}
              value={customer.phone && <Link href={`tel:${customer.phone.replace(/[^\d+]/g, '')}`}>{customer.phone}</Link>}
            />
            <ContactRow
              icon={<EmailOutlinedIcon />}
              label={tr("Email")}
              value={customer.email && <Link href={`mailto:${customer.email}`}>{customer.email}</Link>}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {tr("Manzil")}
            </Typography>
            <ContactRow
              icon={<PublicOutlinedIcon />}
              label={tr("Davlat")}
              value={customer.country && `${countryName(customer.country)} (${customer.country})`}
            />
            <ContactRow icon={<PlaceOutlinedIcon />} label={tr("Manzil")} value={customer.address} />
          </CardContent>
        </Card>

        <Card sx={{ gridColumn: { md: '1 / -1' } }}>
          <CardContent>
            <Typography variant="h6" sx={{ mb: 1 }}>
              {tr("Izoh")}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: customer.notes ? 'text.primary' : 'text.secondary' }}>
              {customer.notes || tr("Izoh qo'shilmagan")}
            </Typography>
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
              {customer.factory && <Meta label={tr("Fabrika")} value={customer.factory.name} />}
              <Meta label={tr("Qo'shilgan")} value={formatDateTime(customer.created_at)} />
              <Meta label={tr("Yangilangan")} value={formatDateTime(customer.updated_at)} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      <CustomerFormDialog
        open={formOpen}
        customer={customer}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => { setFormOpen(false); setCustomer(saved); }}
      />
      <ConfirmDialog
        open={deleteOpen}
        title={tr("Mijozni o'chirish")}
        message={tr("\"{0}\" ({1}) butunlay o'chiriladi. Davom etasizmi?", customer.name, customer.customer_code)}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onClose={() => setDeleteOpen(false)}
      />
    </>
  );
}

function ContactRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ color: 'text.secondary', display: 'flex' }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 500, wordBreak: 'break-word', color: value ? 'text.primary' : 'text.secondary' }}>
          {value || '—'}
        </Typography>
      </Box>
    </Box>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Box>
  );
}

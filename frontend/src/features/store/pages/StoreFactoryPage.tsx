import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { ProductRowSkeleton } from '@/shared/components/skeletons';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { storeApi } from '../api';
import { useCart, type Variant } from '../CartContext';
import AskQuestionDialog from '../components/AskQuestionDialog';
import ProductRow from '../components/ProductRow';
import StoreError from '../components/StoreError';
import StoreImage from '../components/StoreImage';
import type { StoreFactoryDetail, StoreProduct } from '../types';
import { tr } from '@/i18n';

function ExpandableText({ text }: { text: string }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  const clamp = isMobile && long && !open;
  return (
    <Box sx={{ maxWidth: 820, mb: 2 }}>
      <Typography
        sx={{
          whiteSpace: 'pre-wrap',
          ...(clamp && { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }),
        }}
      >
        {text}
      </Typography>
      {isMobile && long && (
        <Button size="small" onClick={() => setOpen((v) => !v)} sx={{ px: 0, mt: 0.5 }}>
          {open ? tr("Qisqartirish") : tr("Batafsil")}
        </Button>
      )}
    </Box>
  );
}

export default function StoreFactoryPage() {
  const { id } = useParams();
  const cart = useCart();
  const [factory, setFactory] = useState<StoreFactoryDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [pending, setPending] = useState<{ product: StoreProduct; variant: Variant; quantity: number } | null>(null);

  const load = useCallback(() => {
    setError(null);
    storeApi.factory(Number(id)).then(setFactory).catch(setError);
  }, [id]);

  useEffect(load, [load]);

  const [searchParams] = useSearchParams();
  const focusId = Number(searchParams.get('product')) || null;
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!factory || !focusId) return;
    const el = document.getElementById(`product-${focusId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(focusId);
    const t = setTimeout(() => setHighlighted(null), 3200);
    return () => clearTimeout(t);
  }, [factory, focusId]);

  const categories = useMemo(() => Array.from(new Set(factory?.products.map((p) => p.category) ?? [])), [factory]);
  const products = factory?.products.filter((p) => !category || p.category === category) ?? [];

  const changeQuantity = (product: StoreProduct, variant: Variant, quantity: number) => {
    if (!factory) return;
    const ok = cart.setQuantity({ id: factory.id, name: factory.name }, product, variant, quantity);
    if (!ok) setPending({ product, variant, quantity });
  };

  if (error) return <StoreError error={error} onRetry={load} showBack />;

  if (!factory) {
    return (
      <>
        <Skeleton width={140} sx={{ mb: 1.5 }} />
        <Card sx={{ mb: 4 }}>
          <Skeleton variant="rectangular" sx={{ height: { xs: 140, md: 220 } }} />
          <Box sx={{ px: { xs: 2, md: 3 }, pb: 3 }}>
            <Box sx={{ display: 'flex', gap: 2, mt: { xs: -5, md: -6 }, mb: 2 }}>
              <Skeleton variant="rounded" sx={{ width: { xs: 80, md: 104 }, height: { xs: 80, md: 104 }, border: '4px solid', borderColor: 'background.paper' }} />
              <Box sx={{ pt: { xs: 5.5, md: 6.5 }, flex: 1 }}>
                <Skeleton width="40%" height={40} />
                <Skeleton width="60%" />
              </Box>
            </Box>
            <Skeleton width="90%" />
            <Skeleton width="75%" />
          </Box>
        </Card>
        <Skeleton width={180} height={40} sx={{ mb: 2 }} />
        <Box sx={{ display: 'grid', gap: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <ProductRowSkeleton key={i} />
          ))}
        </Box>
      </>
    );
  }

  return (
    <>
      <Button component={RouterLink} to="/store" startIcon={<ArrowBackIcon />} color="inherit" sx={{ mb: 1.5 }}>
        {tr("Barcha zavodlar")}
      </Button>

      <Card sx={{ mb: 4, overflow: 'hidden' }}>
        <StoreImage
          src={factory.cover_url}
          seed={factory.name}
          alt={factory.name}
          sx={{ height: { xs: 140, md: 220 }, width: '100%' }}
          iconSize={80}
        />
        <Box sx={{ px: { xs: 2, md: 3 }, pb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mt: { xs: -5, md: -6 }, mb: 2, flexWrap: 'wrap' }}>
            <Avatar
              src={factory.logo_url ?? undefined}
              variant="rounded"
              sx={{ width: { xs: 80, md: 104 }, height: { xs: 80, md: 104 }, border: '4px solid', borderColor: 'background.paper', bgcolor: 'primary.main', fontSize: 36, fontWeight: 700, boxShadow: 2 }}
            >
              {factory.name[0]}
            </Avatar>
            <Box sx={{ pt: { xs: 5.5, md: 6.5 }, minWidth: 0 }}>
              <Typography variant="h4" sx={{ fontSize: { xs: 24, md: 32 } }}>
                {factory.name}
              </Typography>
              {factory.short_description && <Typography color="text.secondary">{factory.short_description}</Typography>}
            </Box>
          </Box>
          {factory.description && <ExpandableText text={factory.description} />}
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="contained" size="small" startIcon={<HelpOutlineIcon />} onClick={() => setAsking(true)}>
              {tr('Savol berish')}
            </Button>
            {(factory.city || factory.address) && (
              <Chip icon={<PlaceOutlinedIcon />} label={[factory.city, factory.address].filter(Boolean).join(', ')} variant="outlined" />
            )}
            {factory.phone && (
              <Chip
                icon={<PhoneOutlinedIcon />}
                label={factory.phone}
                variant="outlined"
                component="a"
                href={`tel:${factory.phone.replace(/[^\d+]/g, '')}`}
                clickable
              />
            )}
          </Box>
        </Box>
      </Card>

      <AskQuestionDialog
        open={asking}
        onClose={() => setAsking(false)}
        factoryId={factory.id}
        factoryName={factory.name}
        products={factory.products}
        productId={highlighted}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Typography variant="h5" sx={{ mr: 2 }}>
          {tr("Mahsulotlar")}
        </Typography>
        {categories.length > 1 && (
          <>
            <Chip label={tr("Barchasi")} color={category === null ? 'primary' : 'default'} onClick={() => setCategory(null)} />
            {categories.map((c) => (
              <Chip key={c} label={c} color={category === c ? 'primary' : 'default'} onClick={() => setCategory(c)} />
            ))}
          </>
        )}
      </Box>

      <Box sx={{ display: 'grid', gap: 2 }}>
        {products.map((p) => (
          <Box key={p.id} id={`product-${p.id}`} sx={{ scrollMarginTop: 96 }}>
            <ProductRow product={p} highlighted={highlighted === p.id} onChange={(variant, q) => changeQuantity(p, variant, q)} />
          </Box>
        ))}
      </Box>
      {factory.products.length === 0 && (
        <Card sx={{ textAlign: 'center', py: 6, px: 2, color: 'text.secondary' }}>
          <Inventory2OutlinedIcon sx={{ fontSize: 56, opacity: 0.4 }} />
          <Typography sx={{ mt: 1 }}>{tr("Bu zavod hali sotuvga mahsulot qo'ymagan")}</Typography>
          <Typography variant="body2">
            {factory.phone ? tr("Buyurtma bo'yicha zavodga qo'ng'iroq qilishingiz mumkin: {0}", factory.phone) : tr("Keyinroq qayta tashrif buyuring")}
          </Typography>
        </Card>
      )}

      <Dialog open={!!pending} onClose={() => setPending(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{tr("Savatni almashtirasizmi?")}</DialogTitle>
        <DialogContent>
          <Typography>
            {tr("Savatda")}{' '}<b>{cart.factoryName}</b> {tr("zavodining mahsulotlari bor. Bitta buyurtma faqat bitta zavoddan bo'lishi mumkin. Savatni tozalab, shu mahsulotni qo'shaymi?")}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setPending(null)}>
            {tr("Yo'q")}
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pending) cart.startNew({ id: factory.id, name: factory.name }, pending.product, pending.variant, pending.quantity);
              setPending(null);
            }}
          >
            {tr("Ha, almashtirish")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

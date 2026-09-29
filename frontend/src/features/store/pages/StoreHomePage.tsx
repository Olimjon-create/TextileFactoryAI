import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Button, Card, Chip, IconButton, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Link as RouterLink } from 'react-router-dom';
import { FactoryCardSkeleton } from '@/shared/components/skeletons';
import { formatMoney } from '@/shared/utils/money';
import { storeApi } from '../api';
import CatalogProductCard, { CatalogProductSkeleton } from '../components/CatalogProductCard';
import FactoryCard from '../components/FactoryCard';
import StoreError from '../components/StoreError';
import { glass, SERIF } from '../storeTheme';
import type { ProductSort, StoreCatalogProduct, StoreFactoryCard, StoreFeaturedProduct, StoreProductPage } from '../types';
import { tr } from '@/i18n';

const PAGE = 12;

const STEPS = [
  { icon: <StorefrontOutlinedIcon />, title: tr("Zavodni tanlang"), text: tr("Ishlab chiqaruvchilar, ularning mahsulotlari va narxlari bir joyda.") },
  { icon: <StraightenOutlinedIcon />, title: tr("O'lcham va rangni belgilang"), text: tr("Kerakli variant va miqdorni tanlab, savatga qo'shing.") },
  { icon: <LockOutlinedIcon />, title: tr("Karta orqali to'lang"), text: tr("To'lovdan so'ng buyurtma zavodga darhol yetib boradi.") },
];

const SORTS: { value: ProductSort; label: string }[] = [
  { value: 'new', label: tr('Avval yangilari') },
  { value: 'price_asc', label: tr('Avval arzonlari') },
  { value: 'price_desc', label: tr('Avval qimmatlari') },
];

const FALLBACK_PHOTOS = ['/brand/hero-coat.jpg', '/brand/hero-knit.jpg', '/brand/hero-dress.jpg'];

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

function HeroTile({ src, item, area }: { src: string; item?: StoreFeaturedProduct; area: string }) {
  const link = item
    ? { component: RouterLink, to: `/store/factories/${item.factory_id}?product=${item.product_id}`, 'aria-label': `${item.factory_name}: ${item.product_name}` }
    : { 'aria-hidden': true };
  return (
    <Box
      {...link}
      sx={{
        gridArea: area,
        position: 'relative',
        display: 'block',
        overflow: 'hidden',
        borderRadius: '14px',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '&:hover .hero-img': { transform: 'scale(1.05)' },
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3 },
      }}
    >
      <Box
        className="hero-img"
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${src})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 20%',
          transition: 'transform 0.6s ease',
        }}
      />
      {item && (
        <Box
          sx={(theme) => ({
            ...glass(theme, 0.86),
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 10,
            px: 1.5,
            py: 1,
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'text.primary',
          })}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontWeight: 600, fontSize: 14, lineHeight: 1.25 }}>
              {item.product_name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {item.factory_name}
            </Typography>
          </Box>
          <Typography sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: 14, color: 'primary.dark', whiteSpace: 'nowrap' }}>
            {formatMoney(item.price)}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function HeroGallery({ featured }: { featured: StoreFeaturedProduct[] | null }) {
  const areas = ['a', 'b', 'c'];
  return (
    <Box
      sx={{
        display: { xs: 'none', md: 'grid' },
        gridTemplateColumns: '1.15fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gridTemplateAreas: '"a b" "a c"',
        gap: 2,
        height: { md: 440, lg: 480 },
      }}
    >
      {FALLBACK_PHOTOS.map((fallback, i) => {
        const item = featured?.[i];
        return <HeroTile key={i} src={item ? item.image_url : fallback} item={item} area={areas[i]} />;
      })}
    </Box>
  );
}

function SectionHeader({ id, title, count, action }: { id: string; title: string; count?: number | null; action?: ReactNode }) {
  return (
    <Box id={id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, scrollMarginTop: 96, flexWrap: 'wrap' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
        <Typography variant="h4" sx={{ fontSize: { xs: 26, md: 32 } }}>
          {title}
        </Typography>
        {count != null && (
          <Typography variant="body2" color="text.secondary">
            {count} {tr("ta")}
          </Typography>
        )}
      </Box>
      {action}
    </Box>
  );
}

export default function StoreHomePage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<ProductSort>('new');
  const [featured, setFeatured] = useState<StoreFeaturedProduct[] | null>(null);
  const [factories, setFactories] = useState<StoreFactoryCard[] | null>(null);
  const [factoriesError, setFactoriesError] = useState<unknown>(null);
  const [page, setPage] = useState<StoreProductPage | null>(null);
  const [items, setItems] = useState<StoreCatalogProduct[] | null>(null);
  const [productsError, setProductsError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totals, setTotals] = useState<{ products: number; categories: number } | null>(null);

  useEffect(() => {
    storeApi.featured(3).then(setFeatured).catch(() => setFeatured([]));
    storeApi
      .products({ limit: 1 })
      .then((p) => setTotals({ products: p.total, categories: p.categories.length }))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = search.trim();
      setQuery((prev) => {
        if (prev !== next) setCategory(null);
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadFactories = useCallback(() => {
    setFactoriesError(null);
    storeApi.factories(query).then(setFactories).catch(setFactoriesError);
  }, [query]);

  const request = useRef(0);

  const loadProducts = useCallback(() => {
    const id = ++request.current;
    setProductsError(null);
    setItems(null);
    storeApi
      .products({ search: query, category, sort, limit: PAGE })
      .then((p) => {
        if (id !== request.current) return;
        setPage(p);
        setItems(p.items);
      })
      .catch(setProductsError);
  }, [query, category, sort]);

  useEffect(loadFactories, [loadFactories]);
  useEffect(loadProducts, [loadProducts]);

  const loadMore = () => {
    if (!items) return;
    const id = request.current;
    setLoadingMore(true);
    storeApi
      .products({ search: query, category, sort, limit: PAGE, offset: items.length })
      .then((p) => {
        if (id !== request.current) return;
        setPage(p);
        setItems((prev) => [...(prev ?? []), ...p.items]);
      })
      .catch(setProductsError)
      .finally(() => setLoadingMore(false));
  };

  const categories = page?.categories ?? [];
  const stats = useMemo(
    () => [
      { value: factories && !query ? factories.length : '—', label: tr('zavod') },
      { value: totals?.products ?? '—', label: tr('mahsulot') },
      { value: totals?.categories ?? '—', label: tr('kategoriya') },
    ],
    [factories, query, totals],
  );

  return (
    <>
      <Box
        component="section"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' },
          gap: { xs: 3, md: 6 },
          alignItems: 'center',
          pt: { xs: 2, md: 5 },
          pb: { xs: 4, md: 7 },
        }}
      >
        <Box>
          <Chip
            icon={<VerifiedOutlinedIcon />}
            label={tr("Zavoddan to'g'ridan-to'g'ri · vositachisiz")}
            sx={(theme) => ({ ...glass(theme, 0.6), mb: 2.5, fontWeight: 600, color: 'primary.dark', '& .MuiChip-icon': { color: 'primary.main' } })}
          />
          <Typography
            component="h1"
            sx={{ fontWeight: 800, fontSize: { xs: 34, sm: 44, md: 52 }, lineHeight: 1.1, letterSpacing: '-0.02em' }}
          >
            {tr("Sifatli kiyim —")}{' '}
            <Box component="span" sx={(t) => ({ color: t.palette.mode === 'dark' ? t.palette.primary.main : t.palette.primary.dark, })}>
              {tr("ishlab chiqaruvchidan")}
            </Box>
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 2, mb: 3.5, fontSize: { xs: 16, md: 18 }, maxWidth: 520 }}>
            {tr("To'qimachilik zavodlarining mahsulotlarini ko'ring, o'lcham va rangni tanlang hamda buyurtmani bir necha daqiqada rasmiylashtiring.")}
          </Typography>
          <TextField
            placeholder={tr("Mahsulot, kategoriya yoki zavod nomi...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scrollTo('products')}
            fullWidth
            sx={(theme) => ({
              maxWidth: 520,
              '& .MuiOutlinedInput-root': { ...glass(theme, 0.9), height: 56, pl: 1, borderRadius: '12px' },
            })}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="primary" />
                  </InputAdornment>
                ),
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" aria-label={tr("Tozalash")} onClick={() => setSearch('')}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
          />
          <Box sx={{ display: 'flex', gap: 1.5, mt: 2.5, flexWrap: 'wrap' }}>
            <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => scrollTo('products')} sx={{ px: 3 }}>
              {tr("Mahsulotlarni ko'rish")}
            </Button>
            <Button variant="outlined" size="large" onClick={() => scrollTo('factories')} sx={(t) => ({ ...glass(t, 0.9), px: 3 })}>
              {tr("Zavodlar")}
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: { xs: 3, sm: 5 }, mt: 4, flexWrap: 'wrap' }}>
            {stats.map((s) => (
              <Box key={s.label}>
                <Typography sx={{ fontFamily: SERIF, fontWeight: 600, fontSize: { xs: 26, md: 30 }, lineHeight: 1 }}>{s.value}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
        <HeroGallery featured={featured} />
      </Box>

      <Box component="section" sx={{ mb: { xs: 6, md: 8 } }}>
        <SectionHeader
          id="products"
          title={query ? tr("Qidiruv natijalari") : tr("Mahsulotlar")}
          count={page?.total ?? null}
          action={
            <TextField select size="small" fullWidth={false} value={sort} onChange={(e) => setSort(e.target.value as ProductSort)} sx={(t) => ({ width: 210, '& .MuiOutlinedInput-root': glass(t, 0.8) })}>
              {SORTS.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
          }
        />

        {categories.length > 1 && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              mb: 2.5,
              flexWrap: { xs: 'nowrap', md: 'wrap' },
              overflowX: { xs: 'auto', md: 'visible' },
              mx: { xs: -1.5, sm: 0 },
              px: { xs: 1.5, sm: 0 },
              pb: 0.5,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              '& .MuiChip-root': { flexShrink: 0 },
            }}
          >
            <Chip label={tr("Barchasi")} color={category === null ? 'primary' : 'default'} onClick={() => setCategory(null)} sx={(t) => (category === null ? {} : glass(t, 0.7))} />
            {categories.map((c) => (
              <Chip
                key={c.name}
                label={`${c.name} · ${c.count}`}
                color={category === c.name ? 'primary' : 'default'}
                onClick={() => setCategory(c.name)}
                sx={(t) => (category === c.name ? {} : glass(t, 0.7))}
              />
            ))}
          </Box>
        )}

        {productsError ? (
          <StoreError error={productsError} onRetry={loadProducts} />
        ) : items?.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
            <CheckroomOutlinedIcon sx={{ fontSize: 64, opacity: 0.4 }} />
            <Typography sx={{ mt: 1 }}>{query ? tr("Qidiruv bo'yicha mahsulot topilmadi") : tr("Hozircha katalogda mahsulotlar yo'q")}</Typography>
            {query && (
              <Button sx={{ mt: 1 }} onClick={() => setSearch('')}>
                {tr("Qidiruvni tozalash")}
              </Button>
            )}
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'grid', gap: { xs: 1.5, md: 2.5 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
              {items === null
                ? Array.from({ length: 8 }).map((_, i) => <CatalogProductSkeleton key={i} />)
                : items.map((p) => <CatalogProductCard key={p.id} product={p} />)}
            </Box>
            {items && page && items.length < page.total && (
              <Box sx={{ textAlign: 'center', mt: 3 }}>
                <Button variant="outlined" size="large" onClick={loadMore} disabled={loadingMore} sx={(t) => ({ ...glass(t, 0.9), px: 4 })}>
                  {loadingMore ? tr("Yuklanmoqda...") : tr("Yana ko'rsatish ({0})", page.total - items.length)}
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>

      <Box component="section">
        <SectionHeader id="factories" title={tr("Zavodlar")} count={factories?.length ?? null} />
        {factoriesError ? (
          <StoreError error={factoriesError} onRetry={loadFactories} />
        ) : factories?.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
            <StorefrontOutlinedIcon sx={{ fontSize: 64, opacity: 0.4 }} />
            <Typography sx={{ mt: 1 }}>{query ? tr("Qidiruv bo'yicha zavod topilmadi") : tr("Hozircha katalogda zavodlar yo'q")}</Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
            {factories === null
              ? Array.from({ length: 3 }).map((_, i) => <FactoryCardSkeleton key={i} />)
              : factories.map((f) => <FactoryCard key={f.id} factory={f} />)}
          </Box>
        )}
      </Box>

      <Box component="section" sx={{ mt: { xs: 6, md: 9 } }}>
        <Typography variant="h4" sx={{ fontSize: { xs: 26, md: 32 }, mb: 1 }}>
          {tr("Qanday ishlaydi")}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {tr("Ro'yxatdan o'tish shart emas — uch qadam va buyurtmangiz zavodda.")}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {STEPS.map((s, i) => (
            <Card key={s.title} sx={{ p: 3, position: 'relative', overflow: 'hidden' }}>
              <Typography
                aria-hidden
                sx={{ position: 'absolute', right: 16, top: -8, fontFamily: SERIF, fontSize: 96, fontWeight: 700, color: 'primary.main', opacity: 0.1, lineHeight: 1 }}
              >
                {i + 1}
              </Typography>
              <Box
                sx={(theme) => ({
                  width: 48,
                  height: 48,
                  borderRadius: 3,
                  display: 'grid',
                  placeItems: 'center',
                  mb: 2,
                  color: 'primary.main',
                  bgcolor: alpha(theme.palette.primary.main, 0.12),
                })}
              >
                {s.icon}
              </Box>
              <Typography variant="h6" sx={{ fontFamily: SERIF, mb: 0.5 }}>
                {s.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {s.text}
              </Typography>
            </Card>
          ))}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 3, color: 'text.secondary' }}>
          <LocalShippingOutlinedIcon fontSize="small" />
          <Typography variant="body2">{tr("Yetkazib berish shartlari va muddatlarini zavod siz bilan telefon orqali kelishadi.")}</Typography>
        </Box>
      </Box>
    </>
  );
}

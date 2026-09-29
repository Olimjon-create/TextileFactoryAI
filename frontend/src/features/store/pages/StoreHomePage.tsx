import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Card, Chip, InputAdornment, TextField, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { Link as RouterLink } from 'react-router-dom';
import { FactoryCardSkeleton } from '@/shared/components/skeletons';
import { storeApi } from '../api';
import FactoryCard from '../components/FactoryCard';
import StoreError from '../components/StoreError';
import { glass, SERIF } from '../storeTheme';
import type { StoreFactoryCard, StoreFeaturedProduct } from '../types';
import { tr } from '@/i18n';

const STEPS = [
  { icon: <StorefrontOutlinedIcon />, title: tr("Zavodni tanlang"), text: tr("Ishlab chiqaruvchilar, ularning mahsulotlari va narxlari bir joyda.") },
  { icon: <StraightenOutlinedIcon />, title: tr("O'lcham va rangni belgilang"), text: tr("Kerakli variant va miqdorni tanlab, savatga qo'shing.") },
  { icon: <LockOutlinedIcon />, title: tr("Karta orqali to'lang"), text: tr("To'lovdan so'ng buyurtma zavodga darhol yetib boradi.") },
];

/** Katalog bo'sh bo'lsa ishlatiladigan bezak suratlar (Pexels, bepul litsenziya — public/brand/CREDITS.txt) */
const FALLBACK_PHOTOS = ['/brand/hero-coat.jpg', '/brand/hero-knit.jpg', '/brand/hero-dress.jpg'];

type HeroSlot = { src: string; item?: StoreFeaturedProduct };

/** Kollaj uchun 3 ta joy: avval katalogdagi mahsulotlar, yetmasa — bezak suratlar */
function heroSlots(featured: StoreFeaturedProduct[] | null): HeroSlot[] {
  return FALLBACK_PHOTOS.map((src, i) => {
    const item = featured?.[i];
    return item ? { src: item.image_url, item } : { src };
  });
}

/**
 * Bitta surat. Mahsulotga bog'langan bo'lsa — havola: bosilganda ishlab chiqaruvchi
 * zavod sahifasi ochiladi va shu mahsulotga aylantiriladi.
 */
function HeroPhoto({ slot, radius, sx, compact = false }: { slot: HeroSlot; radius: string; sx: object; compact?: boolean }) {
  const { item } = slot;
  const link = item
    ? { component: RouterLink, to: `/store/factories/${item.factory_id}?product=${item.product_id}`, 'aria-label': `${item.factory_name}: ${item.product_name}` }
    : { 'aria-hidden': true };
  return (
    <Box
      {...link}
      sx={{
        display: 'block',
        overflow: 'hidden',
        borderRadius: radius,
        boxShadow: '0 24px 60px rgba(43,33,28,0.28)',
        transition: 'transform 0.35s ease, box-shadow 0.35s ease',
        ...(item && {
          cursor: 'pointer',
          '&:hover, &:focus-visible': {
            boxShadow: '0 30px 70px rgba(43,33,28,0.38)',
            zIndex: 2,
            '& .hero-img': { transform: 'scale(1.06)' },
            '& .hero-label': { opacity: 1, transform: 'translateY(0)' },
          },
          '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 3 },
        }),
        ...sx,
      }}
    >
      <Box
        className="hero-img"
        sx={{
          width: '100%',
          height: '100%',
          backgroundImage: `url(${slot.src})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          transition: 'transform 0.6s ease',
        }}
      />
      {item && (
        <Box
          className="hero-label"
          sx={(theme) => ({
            ...glass(theme, 0.85),
            position: 'absolute',
            left: compact ? 6 : 12,
            right: compact ? 6 : 12,
            bottom: compact ? 6 : 12,
            px: compact ? 1 : 1.5,
            py: compact ? 0.5 : 1,
            borderRadius: compact ? '12px' : '16px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'text.primary',
            // Kompyuterda yorliq sichqoncha borganda chiqadi, telefonda doim ko'rinadi
            opacity: compact ? 1 : 0,
            transform: compact ? 'none' : 'translateY(8px)',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          })}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontFamily: SERIF, fontWeight: 600, fontSize: compact ? 12 : 16, lineHeight: 1.2 }}>
              {item.factory_name}
            </Typography>
            {!compact && (
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {item.product_name}
              </Typography>
            )}
          </Box>
          {!compact && <ArrowForwardIcon fontSize="small" color="primary" />}
        </Box>
      )}
    </Box>
  );
}

/** Hero'dagi fotosuratlar kollaji */
function HeroCollage({ featured }: { featured: StoreFeaturedProduct[] | null }) {
  const [a, b, c] = heroSlots(featured);
  const frame = { position: 'absolute', border: '6px solid', borderColor: 'background.paper' };
  return (
    <Box sx={{ position: 'relative', height: { md: 440, lg: 480 }, display: { xs: 'none', md: 'block' } }}>
      <HeroPhoto slot={a} radius="28px" sx={{ ...frame, width: '52%', height: '78%', left: '4%', top: '6%', transform: 'rotate(-3deg)' }} />
      <HeroPhoto slot={b} radius="28px" sx={{ ...frame, width: '44%', height: '46%', right: '2%', top: 0, transform: 'rotate(3deg)' }} />
      <HeroPhoto slot={c} radius="28px" sx={{ ...frame, width: '40%', height: '50%', right: '8%', bottom: 0, transform: 'rotate(-1.5deg)' }} />
      {/* Suzuvchi "yorliq" — bosilganda zavodlar ro'yxatiga tushadi */}
      <Box
        component="button"
        type="button"
        onClick={() => document.getElementById('factories')?.scrollIntoView({ behavior: 'smooth' })}
        sx={(theme) => ({
          ...glass(theme, 0.85),
          position: 'absolute',
          left: '30%',
          bottom: '4%',
          zIndex: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 2,
          py: 1.25,
          borderRadius: 999,
          boxShadow: '0 12px 30px rgba(43,33,28,0.2)',
          cursor: 'pointer',
          font: 'inherit',
          color: 'text.primary',
          transition: 'transform 0.25s ease',
          '&:hover': { transform: 'translateY(-2px)' },
        })}
      >
        <AutoAwesomeOutlinedIcon color="primary" fontSize="small" />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {tr("Yangi mavsum kolleksiyalari")}
        </Typography>
      </Box>
    </Box>
  );
}

/** Telefon uchun ixcham variant: bir qatorda 3 ta surat */
function MobileHeroStrip({ featured }: { featured: StoreFeaturedProduct[] | null }) {
  return (
    <Box sx={{ display: { xs: 'grid', md: 'none' }, gridTemplateColumns: '1.2fr 1fr 1fr', gap: 1, mb: 2.5, height: 150 }}>
      {heroSlots(featured).map((slot, i) => (
        <HeroPhoto
          key={i}
          slot={slot}
          radius="20px"
          compact
          sx={{ position: 'relative', boxShadow: '0 12px 28px rgba(43,33,28,0.2)', mt: i === 1 ? 2 : 0, mb: i === 1 ? 0 : 2 }}
        />
      ))}
    </Box>
  );
}

export default function StoreHomePage() {
  const [factories, setFactories] = useState<StoreFactoryCard[] | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Kollaj suratlari — katalogdagi haqiqiy mahsulotlar (xato bo'lsa bezak suratlar qoladi)
  const [featured, setFeatured] = useState<StoreFeaturedProduct[] | null>(null);

  useEffect(() => {
    storeApi.featured(3).then(setFeatured).catch(() => setFeatured([]));
  }, []);

  const load = useCallback(() => {
    storeApi
      .factories(search.trim())
      .then((data) => {
        setFactories(data);
        setError(null);
      })
      .catch(setError);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  // Eng ko'p uchraydigan mahsulot turlari — tezkor filtr uchun
  const categories = useMemo(() => {
    const count = new Map<string, number>();
    factories?.forEach((f) => f.categories.forEach((c) => count.set(c, (count.get(c) ?? 0) + 1)));
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  }, [factories]);

  const visible = factories?.filter((f) => !category || f.categories.includes(category)) ?? null;
  const totalProducts = factories?.reduce((s, f) => s + f.product_count, 0) ?? 0;

  return (
    <>
      {/* ---------- Hero ---------- */}
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
          <MobileHeroStrip featured={featured} />
          <Chip
            icon={<VerifiedOutlinedIcon />}
            label={tr("Zavoddan to'g'ridan-to'g'ri · vositachisiz")}
            sx={(theme) => ({ ...glass(theme, 0.6), mb: 2.5, fontWeight: 600, color: 'primary.dark', '& .MuiChip-icon': { color: 'primary.main' } })}
          />
          <Typography
            component="h1"
            sx={{
              fontFamily: SERIF,
              fontWeight: 600,
              fontSize: { xs: 36, sm: 46, md: 56 },
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            {tr("Sifatli kiyim —")}{' '}
            {/* Light rejimda to'qroq mokko — blur fon ustida ham yaxshi o'qilsin */}
            <Box component="span" sx={(t) => ({ color: t.palette.mode === 'dark' ? t.palette.primary.main : t.palette.primary.dark, fontStyle: 'italic' })}>
              {tr("ishlab chiqaruvchidan")}
            </Box>
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 2, mb: 3.5, fontSize: { xs: 16, md: 18 }, maxWidth: 520 }}>
            {tr("To'qimachilik zavodlarining mahsulotlarini ko'ring, o'lcham va rangni tanlang hamda buyurtmani bir necha daqiqada rasmiylashtiring.")}
          </Typography>
          <TextField
            placeholder={tr("Zavod nomi yoki mahsulot turi...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            size="medium"
            sx={(theme) => ({
              maxWidth: 520,
              '& .MuiOutlinedInput-root': { ...glass(theme, 0.85), height: 56, pl: 1, boxShadow: `0 10px 30px ${alpha('#2b211c', 0.08)}` },
            })}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="primary" />
                  </InputAdornment>
                ),
              },
            }}
          />
          {/* Ishonch belgilari */}
          <Box sx={{ display: 'flex', gap: { xs: 2.5, sm: 4 }, mt: 3.5, flexWrap: 'wrap' }}>
            {[
              { value: factories?.length ?? '—', label: tr('zavod') },
              { value: totalProducts || '—', label: tr('mahsulot') },
              { value: '100%', label: tr("xavfsiz to'lov") },
            ].map((s) => (
              <Box key={s.label}>
                <Typography sx={{ fontFamily: SERIF, fontWeight: 600, fontSize: { xs: 26, md: 30 }, lineHeight: 1 }}>{s.value}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
        <HeroCollage featured={featured} />
      </Box>

      {/* ---------- Kategoriyalar ---------- */}
      {categories.length > 1 && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            mb: 3,
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
            <Chip key={c} label={c} color={category === c ? 'primary' : 'default'} onClick={() => setCategory(c)} sx={(t) => (category === c ? {} : glass(t, 0.7))} />
          ))}
        </Box>
      )}

      {/* ---------- Zavodlar ---------- */}
      <Box id="factories" sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2, scrollMarginTop: 96 }}>
        <Typography variant="h4" sx={{ fontSize: { xs: 26, md: 32 } }}>
          {tr("Zavodlar")}
        </Typography>
        {visible && (
          <Typography variant="body2" color="text.secondary">
            {visible.length} {tr("ta")}
          </Typography>
        )}
      </Box>

      {error ? (
        <StoreError error={error} onRetry={load} />
      ) : (
        <Box sx={{ display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
          {visible === null
            ? Array.from({ length: 6 }).map((_, i) => <FactoryCardSkeleton key={i} />)
            : visible.map((f) => <FactoryCard key={f.id} factory={f} />)}
        </Box>
      )}

      {!error && visible?.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <StorefrontOutlinedIcon sx={{ fontSize: 64, opacity: 0.4 }} />
          <Typography sx={{ mt: 1 }}>
            {search || category ? tr("Qidiruv bo'yicha zavod topilmadi") : tr("Hozircha katalogda zavodlar yo'q")}
          </Typography>
        </Box>
      )}

      {/* ---------- Qanday ishlaydi ---------- */}
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

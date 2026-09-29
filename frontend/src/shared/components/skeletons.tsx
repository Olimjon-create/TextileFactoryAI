/**
 * Yuklanish paytidagi skeletonlar — haqiqiy kartalar va jadvallar shaklida,
 * shunda ma'lumot kelganda sahifa "sakramaydi".
 */
import { Box, Card, CardContent, Skeleton, TableCell, TableRow } from '@mui/material';
import { tr } from '@/i18n';

/** Dashboard/statistika kartasi: ikonka + sarlavha + son */
export function StatCardSkeleton() {
  return (
    <Card>
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 }, p: { xs: 1.5, sm: 2 } }}>
        <Skeleton variant="rounded" sx={{ width: { xs: 38, sm: 48 }, height: { xs: 38, sm: 48 }, flexShrink: 0 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="55%" />
          <Skeleton width="35%" height={34} />
        </Box>
      </CardContent>
    </Card>
  );
}

/** Kichik raqamli karta (masalan, mijozlar statistikasi) */
export function MiniStatSkeleton() {
  return (
    <Card>
      <CardContent sx={{ py: 1.5 }}>
        <Skeleton width="60%" />
        <Skeleton width="30%" height={34} />
      </CardContent>
    </Card>
  );
}

/** Umumiy karta: sarlavha + bir necha qator matn */
export function CardSkeleton({ lines = 4, title = true, height }: { lines?: number; title?: boolean; height?: number }) {
  return (
    <Card>
      <CardContent>
        {title && <Skeleton width="40%" height={32} sx={{ mb: 1 }} />}
        {height ? (
          <Skeleton variant="rounded" height={height} />
        ) : (
          Array.from({ length: lines }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.75 }}>
              <Skeleton width={`${30 + ((i * 17) % 25)}%`} />
              <Skeleton width={`${20 + ((i * 11) % 20)}%`} />
            </Box>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/** Jadval qatorlari (birinchi yuklanishda bo'sh jadval o'rniga) */
export function TableRowsSkeleton({ cols, rows = 6 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <TableCell key={c}>
              <Skeleton width={c === 0 ? '70%' : `${45 + ((r + c) * 13) % 45}%`} />
              {c === 1 && <Skeleton width="45%" height={16} />}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Butun sahifa: sarlavha + statistika kartalari + jadval kartasi (sahifa kodi yuklanayotganda) */
export function PageSkeleton() {
  return (
    <Box aria-busy="true" aria-label={tr("Yuklanmoqda")}>
      <Skeleton width={260} height={40} sx={{ maxWidth: '70%' }} />
      <Skeleton width={360} sx={{ mb: 3, maxWidth: '90%' }} />
      <Box sx={{ display: 'grid', gap: { xs: 1.5, sm: 2 }, gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, mb: 3 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </Box>
      <CardSkeleton lines={7} />
    </Box>
  );
}

/** Katalog sahifasi: sarlavha + kartalar to'ri */
export function CatalogSkeleton() {
  return (
    <Box aria-busy="true" aria-label={tr("Yuklanmoqda")}>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: { xs: 3, md: 5 } }}>
        <Skeleton width={320} height={48} sx={{ maxWidth: '80%' }} />
        <Skeleton width={480} sx={{ maxWidth: '90%', mb: 2 }} />
        <Skeleton variant="rounded" width={480} height={48} sx={{ maxWidth: '90%' }} />
      </Box>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <FactoryCardSkeleton key={i} />
        ))}
      </Box>
    </Box>
  );
}

/** Katalogdagi zavod kartasi shaklida */
export function FactoryCardSkeleton() {
  return (
    <Card>
      <Skeleton variant="rectangular" sx={{ aspectRatio: '4 / 3', height: 'auto' }} />
      <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center' }}>
        <Skeleton variant="rounded" width={64} height={24} />
        <Skeleton variant="rounded" width={56} height={24} />
        <Box sx={{ flex: 1 }} />
        <Skeleton width={110} />
      </Box>
    </Card>
  );
}

/** Katalogdagi mahsulot qatori shaklida (rasmlar + matn + narx) */
export function ProductRowSkeleton() {
  return (
    <Card sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
      <Skeleton variant="rectangular" sx={{ width: { xs: '100%', sm: 320 }, height: { xs: 220, sm: 190 }, flexShrink: 0 }} />
      <Box sx={{ flex: 1, p: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton width="30%" />
          <Skeleton width="55%" height={30} />
          <Skeleton width="80%" />
          <Box sx={{ display: 'flex', gap: 0.75, mt: 1 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rounded" width={36} height={24} />
            ))}
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Skeleton width={120} height={32} />
          <Skeleton variant="rounded" width={110} height={36} sx={{ ml: 'auto' }} />
        </Box>
      </Box>
    </Card>
  );
}

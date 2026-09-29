import { Box, Card, CardActionArea, Skeleton, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { formatMoney } from '@/shared/utils/money';
import { SERIF } from '../storeTheme';
import type { StoreCatalogProduct } from '../types';
import StoreImage from './StoreImage';
import { tr } from '@/i18n';

export default function CatalogProductCard({ product }: { product: StoreCatalogProduct }) {
  const variants = [
    product.sizes.length ? tr('{0} o\'lcham', product.sizes.length) : null,
    product.colors.length ? tr('{0} rang', product.colors.length) : null,
  ].filter(Boolean);
  return (
    <Card sx={{ overflow: 'hidden', height: '100%', '&:hover .product-img': { transform: 'scale(1.05)' } }}>
      <CardActionArea
        component={RouterLink}
        to={`/store/factories/${product.factory_id}?product=${product.id}`}
        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
      >
        <Box sx={{ position: 'relative', overflow: 'hidden' }}>
          <Box className="product-img" sx={{ transition: 'transform .6s ease' }}>
            <StoreImage
              src={product.model_image_url ?? product.image_url}
              seed={product.name}
              alt={product.name}
              sx={{ aspectRatio: '4 / 5', width: '100%' }}
              iconSize={56}
            />
          </Box>
          <Typography
            variant="caption"
            sx={{
              position: 'absolute',
              left: 10,
              top: 10,
              px: 1,
              py: 0.25,
              borderRadius: 999,
              fontWeight: 600,
              bgcolor: 'rgba(28,21,18,0.62)',
              color: '#fff',
              backdropFilter: 'blur(6px)',
            }}
          >
            {product.category}
          </Typography>
        </Box>
        <Box sx={{ p: 1.75, display: 'flex', flexDirection: 'column', gap: 0.25, flex: 1 }}>
          <Typography sx={{ fontWeight: 600, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {product.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {product.factory_name}
          </Typography>
          <Box sx={{ mt: 'auto', pt: 1, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: { xs: 15, sm: 18 }, color: 'primary.dark', whiteSpace: 'nowrap' }}>{formatMoney(product.price)}</Typography>
            {variants.length > 0 && (
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>
                {variants.join(' · ')}
              </Typography>
            )}
          </Box>
        </Box>
      </CardActionArea>
    </Card>
  );
}

export function CatalogProductSkeleton() {
  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Skeleton variant="rectangular" sx={{ aspectRatio: '4 / 5', height: 'auto' }} />
      <Box sx={{ p: 1.75 }}>
        <Skeleton width="80%" />
        <Skeleton width="50%" />
        <Skeleton width="40%" height={28} />
      </Box>
    </Card>
  );
}

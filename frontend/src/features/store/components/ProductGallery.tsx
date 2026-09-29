import { useState } from 'react';
import { Box, Dialog, DialogContent, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import { translucentPaper } from '@/app/theme';
import { formatMoney } from '@/shared/utils/money';
import type { StoreProduct } from '../types';
import StoreImage from './StoreImage';
import { tr } from '@/i18n';

function Caption({ children }: { children: string }) {
  return (
    <Typography
      variant="caption"
      sx={{ position: 'absolute', left: 6, bottom: 6, px: 0.75, py: 0.25, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11 }}
    >
      {children}
    </Typography>
  );
}

/**
 * Mahsulot rasmlari: kiyimning o'zi va (bo'lsa) odam ustida turishi — yonma-yon.
 * Bosilganda ikkalasi katta ko'rinishda ochiladi.
 */
export default function ProductGallery({ product }: { product: StoreProduct }) {
  const [open, setOpen] = useState(false);
  const images = [
    { src: product.image_url, label: tr("Mahsulot"), ratio: '1 / 1' },
    ...(product.model_image_url ? [{ src: product.model_image_url, label: tr("Odam ustida"), ratio: '3 / 4' }] : []),
  ];

  return (
    <>
      <Box
        onClick={() => setOpen(true)}
        role="button"
        aria-label={tr("Rasmlarni kattalashtirish")}
        sx={{
          display: 'flex',
          gap: '2px',
          flexShrink: 0,
          cursor: 'zoom-in',
          position: 'relative',
          width: { xs: '100%', sm: images.length > 1 ? 320 : 180 },
          height: { xs: 220, sm: 'auto' },
          minHeight: { sm: 190 },
          '&:hover .zoom': { opacity: 1 },
        }}
      >
        {images.map((img) => (
          <Box key={img.label} className="pg-photo" sx={{ position: 'relative', overflow: 'hidden', flex: img.label === 'Mahsulot' ? 1.15 : 1 }}>
            <StoreImage src={img.src} seed={product.name} alt={`${product.name} — ${img.label}`} sx={{ position: 'absolute', inset: 0 }} />
            {images.length > 1 && <Caption>{img.label}</Caption>}
          </Box>
        ))}
        <ZoomInIcon
          className="zoom"
          sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', bgcolor: 'rgba(0,0,0,0.45)', borderRadius: '50%', p: 0.5, opacity: 0, transition: 'opacity .15s' }}
        />
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <IconButton onClick={() => setOpen(false)} aria-label={tr("Yopish")} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, bgcolor: translucentPaper, '&:hover': { bgcolor: 'background.paper' } }}>
          <CloseIcon />
        </IconButton>
        <DialogContent sx={{ p: { xs: 1.5, sm: 2.5 } }}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: images.length > 1 ? '1.15fr 1fr' : '1fr' }, alignItems: 'start' }}>
            {images.map((img) => (
              <Box key={img.label}>
                <StoreImage
                  src={img.src}
                  seed={product.name}
                  alt={`${product.name} — ${img.label}`}
                  iconSize={96}
                  sx={{ width: '100%', aspectRatio: img.ratio, borderRadius: 2, bgcolor: 'action.hover', backgroundSize: 'contain', backgroundRepeat: 'no-repeat' }}
                />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, textAlign: 'center' }}>
                  {img.label}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2, mt: 1.5, flexWrap: 'wrap' }}>
            <Typography variant="h6">{product.name}</Typography>
            <Typography variant="h6" color="primary.main">
              {formatMoney(product.price)}
            </Typography>
          </Box>
          {product.description && (
            <Typography variant="body2" color="text.secondary">
              {product.description}
            </Typography>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

import { Box, Typography } from '@mui/material';
import { tr } from '@/i18n';

export default function StockBadge({ inStock, compact = false }: { inStock: number; compact?: boolean }) {
  const ready = inStock > 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: compact ? 0.25 : 0.5 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: ready ? 'success.main' : 'warning.main' }} />
      <Typography variant="caption" color={ready ? 'success.main' : 'text.secondary'} noWrap sx={{ fontWeight: ready ? 600 : 400 }}>
        {ready ? tr('Omborda: {0} dona', inStock) : compact ? tr('Buyurtma asosida') : tr('Buyurtma asosida tikiladi')}
      </Typography>
    </Box>
  );
}

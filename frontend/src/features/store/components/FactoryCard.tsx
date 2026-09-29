import { Avatar, Box, Card, CardActionArea, Chip, Typography } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { formatMoney } from '@/shared/utils/money';
import { SERIF } from '../storeTheme';
import type { StoreFactoryCard } from '../types';
import StoreImage from './StoreImage';
import { tr } from '@/i18n';

export default function FactoryCard({ factory }: { factory: StoreFactoryCard }) {
  return (
    <Card
      sx={{
        overflow: 'hidden',
        '&:hover .cover': { transform: 'scale(1.05)' },
        '&:hover .go': { opacity: 1, transform: 'translateX(0)' },
      }}
    >
      <CardActionArea component={RouterLink} to={`/store/factories/${factory.id}`}>
        <Box sx={{ position: 'relative', overflow: 'hidden' }}>
          <Box className="cover" sx={{ transition: 'transform .6s ease' }}>
            <StoreImage
              src={factory.cover_url ?? factory.logo_url}
              seed={factory.name}
              alt={factory.name}
              sx={{ aspectRatio: '4 / 3', width: '100%' }}
              iconSize={72}
            />
          </Box>
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              p: 2.25,
              color: '#fff',
              background: 'linear-gradient(180deg, rgba(28,21,18,0) 30%, rgba(28,21,18,0.82) 100%)',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 0.75 }}>
              {factory.logo_url && factory.cover_url && (
                <Avatar src={factory.logo_url} alt="" variant="rounded" sx={{ width: 36, height: 36, borderRadius: 2, border: '2px solid rgba(255,255,255,0.9)' }} />
              )}
              <Typography sx={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, lineHeight: 1.15, textShadow: '0 1px 3px rgba(0,0,0,.35)' }}>
                {factory.name}
              </Typography>
            </Box>
            {factory.short_description && (
              <Typography
                variant="body2"
                sx={{ opacity: 0.9, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {factory.short_description}
              </Typography>
            )}
            {factory.city && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75, opacity: 0.85 }}>
                <PlaceOutlinedIcon sx={{ fontSize: 16 }} />
                <Typography variant="caption">{factory.city}</Typography>
              </Box>
            )}
          </Box>
          <Box
            className="go"
            sx={{
              position: 'absolute',
              top: 14,
              right: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              borderRadius: 999,
              bgcolor: 'rgba(251,250,247,0.92)',
              color: '#2b211c',
              fontSize: 13,
              fontWeight: 600,
              opacity: 0,
              transform: 'translateX(8px)',
              transition: 'all .25s ease',
            }}
          >
            {tr("Ko'rish")}{' '}<ArrowForwardIcon sx={{ fontSize: 16 }} />
          </Box>
        </Box>
        <Box sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          {factory.categories.slice(0, 3).map((c) => (
            <Chip key={c} label={c} size="small" variant="outlined" />
          ))}
          <Box sx={{ flex: 1 }} />
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {factory.product_count} {tr("ta")}
            {factory.min_price !== null && (
              <>
                {' · '}
                <Box component="b" sx={{ color: 'text.primary' }}>
                  {formatMoney(factory.min_price)}
                </Box>{' '}
                {tr("dan")}
              </>
            )}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

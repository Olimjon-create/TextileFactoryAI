import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { tr } from '@/i18n';

export default function NotFoundPage() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', p: 3 }}>
      <Box>
        <Typography variant="h1" sx={{ fontWeight: 700, color: 'primary.main' }}>
          404
        </Typography>
        <Typography variant="h6" sx={{ mb: 3 }}>
          {tr("Sahifa topilmadi")}
        </Typography>
        <Button variant="contained" component={RouterLink} to="/">
          {tr("Bosh sahifaga qaytish")}
        </Button>
      </Box>
    </Box>
  );
}

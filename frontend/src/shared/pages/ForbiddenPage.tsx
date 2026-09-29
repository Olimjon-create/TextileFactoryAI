import { Box, Button, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { tr } from '@/i18n';

export default function ForbiddenPage() {
  return (
    <Box sx={{ textAlign: 'center', py: 10 }}>
      <LockOutlinedIcon sx={{ fontSize: 56, color: 'text.secondary' }} />
      <Typography variant="h5" sx={{ mt: 2 }}>
        {tr("Ruxsat yo'q")}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1, mb: 3 }}>
        {tr("Bu sahifani ko'rish uchun sizning rolingizda huquq mavjud emas.")}
      </Typography>
      <Button variant="contained" component={RouterLink} to="/">
        {tr("Bosh sahifaga qaytish")}
      </Button>
    </Box>
  );
}

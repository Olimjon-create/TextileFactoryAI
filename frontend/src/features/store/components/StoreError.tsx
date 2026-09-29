import { Box, Button, Typography } from '@mui/material';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link as RouterLink } from 'react-router-dom';
import { getErrorMessage, isServerUnavailable } from '@/shared/api/client';
import { tr } from '@/i18n';

interface Props {
  error: unknown;
  onRetry: () => void;
  showBack?: boolean;
}

/** Katalog mijozlar uchun — texnik tafsilotlarsiz, tushunarli xabar va "Qayta urinish" */
export default function StoreError({ error, onRetry, showBack }: Props) {
  const unavailable = isServerUnavailable(error);
  const Icon = unavailable ? CloudOffOutlinedIcon : SearchOffOutlinedIcon;

  return (
    <Box sx={{ textAlign: 'center', py: { xs: 6, md: 10 } }}>
      <Icon sx={{ fontSize: 64, color: 'text.secondary', opacity: 0.5 }} />
      <Typography variant="h6" sx={{ mt: 1 }}>
        {unavailable ? tr("Sayt vaqtincha javob bermayapti") : getErrorMessage(error)}
      </Typography>
      {unavailable && (
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          {tr("Birozdan so'ng qayta urinib ko'ring. Savatingiz saqlanib qoladi.")}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 3, flexWrap: 'wrap' }}>
        {unavailable && (
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={onRetry}>
            {tr("Qayta urinish")}
          </Button>
        )}
        {showBack && (
          <Button component={RouterLink} to="/store" startIcon={<ArrowBackIcon />}>
            {tr("Barcha zavodlar")}
          </Button>
        )}
      </Box>
    </Box>
  );
}

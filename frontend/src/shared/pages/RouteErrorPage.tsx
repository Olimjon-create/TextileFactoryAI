import { useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { tr } from '@/i18n';

const RELOAD_KEY = 'tfai_chunk_reload_at';

/** Sahifa kodi (lazy chunk) yuklanmadi: yangi versiya chiqqan yoki server qayta ishga tushgan */
function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(message);
}

/**
 * Router darajasidagi xato sahifasi (texnik "Unexpected Application Error" o'rniga).
 * Eski sahifa bo'lagi topilmasa — bir marta avtomatik yangilaydi (cheksiz aylanishsiz).
 */
export default function RouteErrorPage() {
  const error = useRouteError();
  const chunk = isChunkError(error);

  useEffect(() => {
    if (!chunk) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // sessionStorage yopiq — foydalanuvchi tugma orqali yangilaydi
    }
  }, [chunk]);

  const title = chunk
    ? tr("Dasturning yangi versiyasi yuklanmoqda")
    : isRouteErrorResponse(error) && error.status === 404
      ? tr("Sahifa topilmadi")
      : tr("Kutilmagan xatolik yuz berdi");
  const text = chunk
    ? tr("Sahifa kodini yuklab bo'lmadi — dastur yangilangan yoki server qayta ishga tushgan bo'lishi mumkin. Sahifani yangilang.")
    : tr("Sahifani yangilab ko'ring. Xato takrorlansa, administratorga murojaat qiling.");

  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center', p: 3, bgcolor: 'background.default' }}>
      <Box sx={{ textAlign: 'center', maxWidth: 460 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {text}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => window.location.reload()}>
            {tr("Sahifani yangilash")}
          </Button>
          <Button color="inherit" href="/">
            {tr("Bosh sahifa")}
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

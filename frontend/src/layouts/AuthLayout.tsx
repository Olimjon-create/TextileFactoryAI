import { Suspense } from 'react';
import { Box, Paper, Skeleton, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Outlet } from 'react-router-dom';
import LanguageSwitcher from '@/shared/components/LanguageSwitcher';
import ThemeToggle from '@/shared/components/ThemeToggle';
import BrandLogo from '@/shared/components/BrandLogo';
import BrandWordmark from '@/shared/components/BrandWordmark';
import { softShadow } from '@/app/theme';
import { tr } from '@/i18n';

const FEATURES = [
  tr("Fabrikalar va xodimlarni markazlashgan boshqarish"),
  tr("Rollar asosida xavfsiz kirish huquqlari"),
  tr("ERP, MES, ombor va AI modullari uchun tayyor platforma"),
];

export default function AuthLayout() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      <Box
        sx={{
          flex: 1,
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          px: 8,
          color: '#fff',
          m: 2,
          borderRadius: '28px',
          position: 'relative',
          overflow: 'hidden',
          background:
            'radial-gradient(circle at 85% 15%, rgba(208,100,58,0.45) 0, transparent 40%), linear-gradient(150deg, #0a4237 0%, #0f5c4d 55%, #1b7361 100%)',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 14px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 14px)',
            pointerEvents: 'none',
          },
          '& > *': { position: 'relative' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 5 }}>
          <BrandLogo size={42} color="rgba(255,255,255,0.16)" />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            <BrandWordmark accent="#f6ab89" />
          </Typography>
        </Box>
        <Typography variant="h4" sx={{ mb: 2, maxWidth: 520, fontSize: 40, lineHeight: 1.1 }}>
          {tr("Kiyim ishlab chiqarish fabrikalari uchun aqlli boshqaruv platformasi")}
        </Typography>
        <Box sx={{ mt: 2 }}>
          {FEATURES.map((f) => (
            <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, opacity: 0.9 }}>
              <CheckCircleOutlineIcon fontSize="small" />
              <Typography>{f}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, position: 'relative' }}>
        <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LanguageSwitcher />
            <ThemeToggle />
          </Box>
        <Paper sx={(t) => ({ width: '100%', maxWidth: 440, p: { xs: 3, sm: 4.5 }, borderRadius: '24px', boxShadow: softShadow(t) })} elevation={0}>
          <Suspense
            fallback={
              <Box aria-busy="true">
                <Skeleton width="50%" height={40} />
                <Skeleton width="70%" sx={{ mb: 3 }} />
                <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
                <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
                <Skeleton variant="rounded" height={44} />
              </Box>
            }
          >
            <Outlet />
          </Suspense>
        </Paper>
      </Box>
    </Box>
  );
}

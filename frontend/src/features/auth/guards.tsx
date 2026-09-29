import { Box, CircularProgress } from '@mui/material';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role } from '@/shared/types';
import ForbiddenPage from '@/shared/pages/ForbiddenPage';
import { useAuth } from './AuthContext';

function FullPageLoader() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress />
    </Box>
  );
}

/** Faqat tizimga kirgan foydalanuvchilar uchun */
export function ProtectedRoute() {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullPageLoader />;
  if (!user) {
    // Saytga birinchi kirgan mehmon (mijoz) — login emas, zavodlar katalogini ko'radi
    if (location.pathname === '/') return <Navigate to="/store" replace />;
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

/** Faqat tizimga kirmaganlar uchun (login/register) */
export function GuestRoute() {
  const { user, initializing } = useAuth();
  if (initializing) return <FullPageLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}

/** Ichki sahifalarni rol bo'yicha cheklaydi */
export function RoleGuard({ roles }: { roles: Role[] }) {
  const { hasRole } = useAuth();
  return hasRole(...roles) ? <Outlet /> : <ForbiddenPage />;
}

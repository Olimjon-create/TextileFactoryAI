import { Suspense, useState } from 'react';
import { PageSkeleton } from '@/shared/components/skeletons';
import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { NewOrdersProvider } from '@/features/orders/NewOrdersContext';
import { SHELL_GAP } from '@/app/theme';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function MainLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <NewOrdersProvider>
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <Box
          component="main"
          sx={{
            flex: 1,
            minWidth: 0,
            // Header balandligi + bo'shliq (desktopda header suzib turadi)
            pt: { xs: '76px', sm: '84px', lg: `${64 + SHELL_GAP + 28}px` },
            pb: { xs: 3, lg: 4 },
            px: { xs: 2, md: 3, lg: `${SHELL_GAP + 12}px` },
            pl: { lg: '12px' },
          }}
        >
          {/* Juda keng ekranlarda (4K, TV) ham kontent ekranni to'ldiradi, faqat haddan tashqari cho'zilmaydi */}
          <Box sx={{ maxWidth: 2400, mx: 'auto' }}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </Box>
        </Box>
      </Box>
    </NewOrdersProvider>
  );
}

import { Suspense, useMemo, type ReactNode } from 'react';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import {
  AppBar,
  Badge,
  Box,
  Button,
  Container,
  Fab,
  IconButton,
  Paper,
  Slide,
  Toolbar,
  Tooltip,
  Typography,
  Zoom,
} from '@mui/material';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import LoginIcon from '@mui/icons-material/Login';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Link as RouterLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { CatalogSkeleton } from '@/shared/components/skeletons';
import LanguageSwitcher from '@/shared/components/LanguageSwitcher';
import ThemeToggle from '@/shared/components/ThemeToggle';
import { useIsMobile } from '@/shared/hooks/useIsMobile';
import { formatMoney } from '@/shared/utils/money';
import { CartProvider, useCart } from '../CartContext';
import { MyOrdersProvider, useMyOrders } from '../MyOrdersContext';
import { createStoreTheme, glass, SERIF } from '../storeTheme';
import CartDrawer from './CartDrawer';
import StoreBackdrop from './StoreBackdrop';
import BrandLogo from '@/shared/components/BrandLogo';
import { BRAND_NAME } from '@/shared/constants/brand';
import { tr } from '@/i18n';

/** Kompyuter: o'ng pastdagi dumaloq savat tugmasi */
function CartFab() {
  const cart = useCart();
  return (
    <Zoom in={!cart.isOpen}>
      <Fab
        color="primary"
        aria-label={tr("Savat")}
        onClick={cart.open}
        sx={{ position: 'fixed', right: 32, bottom: 32, width: 64, height: 64, zIndex: (t) => t.zIndex.drawer - 1 }}
      >
        <Badge badgeContent={cart.lines.length} color="error" max={99}>
          <ShoppingCartOutlinedIcon sx={{ fontSize: 30 }} />
        </Badge>
      </Fab>
    </Zoom>
  );
}

/**
 * Telefon: pastdagi savat paneli — mahsulot tugmalarini yopmaydi,
 * savatdagi son va jami summa doim ko'rinib turadi.
 */
function CartBar() {
  const cart = useCart();
  const empty = cart.lines.length === 0;
  return (
    <Slide direction="up" in={!cart.isOpen}>
      <Paper
        elevation={8}
        sx={(theme) => ({
          ...glass(theme, 0.88),
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: theme.zIndex.drawer - 1,
          borderRadius: '20px 20px 0 0',
          px: 2,
          pt: 1.25,
          // iPhone'dagi pastki "home" chizig'i uchun joy
          pb: 'calc(10px + env(safe-area-inset-bottom))',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderTop: 1,
          borderColor: 'divider',
        })}
      >
        <Badge badgeContent={cart.lines.length} color="error" max={99}>
          <ShoppingCartOutlinedIcon color={empty ? 'disabled' : 'primary'} />
        </Badge>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap display="block">
            {empty ? tr("Savat bo'sh") : tr("{0} · {1} ta", cart.factoryName, cart.totalQuantity)}
          </Typography>
          <Typography sx={{ fontWeight: 700 }} noWrap>
            {empty ? tr("Mahsulot tanlang") : formatMoney(cart.totalAmount)}
          </Typography>
        </Box>
        <Button variant="contained" onClick={cart.open} disabled={empty} sx={{ flexShrink: 0 }}>
          {tr("Savatni ochish")}
        </Button>
      </Paper>
    </Slide>
  );
}

function MyOrdersButton() {
  const { tokens } = useMyOrders();
  const icon = (
    <Badge badgeContent={tokens.length} color="primary" max={99}>
      <ReceiptLongOutlinedIcon />
    </Badge>
  );
  return (
    <>
      <Tooltip title={tr("Buyurtmalarim")}>
        <IconButton component={RouterLink} to="/store/orders" aria-label={tr("Buyurtmalarim")} sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
          {icon}
        </IconButton>
      </Tooltip>
      <Button
        component={RouterLink}
        to="/store/orders"
        color="inherit"
        size="small"
        startIcon={icon}
        sx={{ color: 'text.primary', display: { xs: 'none', sm: 'inline-flex' } }}
      >
        {tr("Buyurtmalarim")}
      </Button>
    </>
  );
}

function StaffButton() {
  const { user } = useAuth();
  const to = user ? '/' : '/login';
  const label = user ? tr("Boshqaruv paneli") : tr("Xodimlar uchun");
  const icon = user ? <DashboardOutlinedIcon /> : <LoginIcon />;
  return (
    <>
      <Tooltip title={label}>
        <IconButton component={RouterLink} to={to} aria-label={label} sx={{ display: { xs: 'inline-flex', sm: 'none' } }}>
          {icon}
        </IconButton>
      </Tooltip>
      <Button
        component={RouterLink}
        to={to}
        variant={user ? 'outlined' : 'text'}
        color={user ? 'primary' : 'inherit'}
        size="small"
        startIcon={icon}
        sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: user ? undefined : 'text.secondary', whiteSpace: 'nowrap' }}
      >
        {label}
      </Button>
    </>
  );
}

/** Katalogga moda uslubidagi mavzuni qo'llaydi (Light/Dark tanlovi saqlanadi) */
function StoreThemeProvider({ children }: { children: ReactNode }) {
  const outer = useTheme();
  const theme = useMemo(() => createStoreTheme(outer), [outer]);
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

/** Mijozlar uchun ochiq katalog karkasi: sodda sarlavha, sahifa va savat */
export default function StoreLayout() {
  return (
    <StoreThemeProvider>
      <StoreShell />
    </StoreThemeProvider>
  );
}

function StoreShell() {
  const isMobile = useIsMobile();
  return (
    <MyOrdersProvider>
      <CartProvider>
        <Box sx={{ minHeight: '100vh', position: 'relative', isolation: 'isolate' }}>
          <StoreBackdrop />
          <AppBar
            position="sticky"
            color="inherit"
            elevation={0}
            sx={(theme) => ({ ...glass(theme, 0.6), borderBottom: 1, borderColor: 'divider', boxShadow: 'none' })}
          >
            <Container maxWidth="lg">
              <Toolbar disableGutters sx={{ gap: { xs: 0.5, sm: 1.5 }, minHeight: { xs: 56 } }}>
                <Box
                  component={RouterLink}
                  to="/store"
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color: 'inherit', textDecoration: 'none', minWidth: 0 }}
                >
                  <BrandLogo size={36} radius="10px" />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontFamily: SERIF, fontWeight: 700, fontSize: 18, lineHeight: 1.1 }} noWrap>
                      {BRAND_NAME}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: { xs: 'none', sm: 'block' } }}>
                      {tr("Zavodlar katalogi")}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ flex: 1 }} />
                <LanguageSwitcher />
                <ThemeToggle />
                <MyOrdersButton />
                <StaffButton />
              </Toolbar>
            </Container>
          </AppBar>
          {/* Pastki bo'shliq — savat paneli/tugmasi kontentni yopmasligi uchun */}
          <Container maxWidth="lg" sx={{ pt: { xs: 2, md: 4 }, pb: { xs: 13, md: 14 } }}>
            <Suspense fallback={<CatalogSkeleton />}>
              <Outlet />
            </Suspense>
          </Container>
          {isMobile ? <CartBar /> : <CartFab />}
          <CartDrawer />
        </Box>
      </CartProvider>
    </MyOrdersProvider>
  );
}

import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { factoriesApi } from '@/features/factories/api';
import { BOTTOM_NAVIGATION, NAVIGATION, type NavItem } from '@/app/navigation';
import { SHELL_GAP, SIDEBAR_BG, SIDEBAR_WIDTH, softShadow } from '@/app/theme';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FactoryOutlinedIcon from '@mui/icons-material/FactoryOutlined';
import { useAuth } from '@/features/auth/AuthContext';
import { useNewOrders } from '@/features/orders/NewOrdersContext';
import BrandLogo from '@/shared/components/BrandLogo';
import BrandWordmark from '@/shared/components/BrandWordmark';
import { tr } from '@/i18n';

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const theme = useTheme();
  const { user, hasRole } = useAuth();
  const { newCount } = useNewOrders();
  const { pathname } = useLocation();
  // Zavod xodimi — o'z zavodi; super admin — tizimda yagona zavod bo'lsa (dastur bitta zavodga o'rnatilgan)
  const [onlyFactory, setOnlyFactory] = useState<string | null>(null);
  const isSuper = user?.role === 'SUPER_ADMIN';
  useEffect(() => {
    if (!isSuper) return;
    factoriesApi
      .list()
      .then((list) => setOnlyFactory(list.length === 1 ? list[0].name : null))
      .catch(() => undefined);
  }, [isSuper]);
  const factoryName = user?.factory?.name ?? (isSuper ? onlyFactory : null);

  const matches = (path: string) => (path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`));
  // Bir nechta band mos kelsa (/production va /production/kpi) — faqat eng aniq (uzun) yo'l faol
  const activePath = [...NAVIGATION.flatMap((s) => s.items), ...BOTTOM_NAVIGATION]
    .filter((item) => !item.external && matches(item.path))
    .reduce<string | null>((best, item) => (best === null || item.path.length > best.length ? item.path : best), null);
  const isActive = (path: string) => path === activePath;

  const primary = theme.palette.primary.main;

  const renderItem = (item: NavItem) => {
    const active = !item.external && isActive(item.path);
    const badge = item.badge === 'newOrders' ? newCount : 0;
    const linkProps = item.external
      ? { component: 'a' as const, href: item.path, target: '_blank', rel: 'noopener' }
      : { component: NavLink, to: item.path };
    return (
      <ListItemButton
        key={item.path}
        {...linkProps}
        onClick={onNavigate}
        sx={{
          position: 'relative',
          borderRadius: 3,
          mb: 0.25,
          py: 0.9,
          pl: 1.5,
          color: active ? 'primary.main' : 'text.secondary',
          bgcolor: active ? alpha(primary, theme.palette.mode === 'light' ? 0.09 : 0.14) : 'transparent',
          transition: 'background-color .15s ease, color .15s ease',
          '&:hover': {
            bgcolor: active ? alpha(primary, 0.12) : alpha(theme.palette.text.primary, 0.04),
            color: active ? 'primary.main' : 'text.primary',
          },
          // Faol band chap tomonida ingichka "ip" chizig'i
          '&::before': {
            content: '""',
            position: 'absolute',
            left: -12,
            top: 8,
            bottom: 8,
            width: 4,
            borderRadius: '0 4px 4px 0',
            bgcolor: active ? 'primary.main' : 'transparent',
          },
        }}
      >
        <ListItemIcon sx={{ minWidth: 36, color: 'inherit', '& svg': { fontSize: 21 } }}>{item.icon}</ListItemIcon>
        <ListItemText
          primary={item.label}
          primaryTypographyProps={{ fontSize: 14, fontWeight: active ? 700 : 600, noWrap: true }}
        />
        {badge > 0 && (
          <Box
            sx={{
              minWidth: 22,
              height: 22,
              px: 0.75,
              borderRadius: 11,
              bgcolor: 'secondary.main',
              color: 'secondary.contrastText',
              fontSize: 12,
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {badge > 99 ? '99+' : badge}
          </Box>
        )}
        {item.external && <OpenInNewIcon sx={{ fontSize: 16, opacity: 0.6 }} />}
      </ListItemButton>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: SIDEBAR_BG[theme.palette.mode] }}>
      <Box sx={{ px: 2.5, pt: 2.75, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BrandLogo size={42} radius="32%" />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 19, lineHeight: 1.15, letterSpacing: '-0.02em' }}>
              <BrandWordmark />
            </Typography>
            {!factoryName && (
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
                {tr("Ishlab chiqarish boshqaruvi")}
              </Typography>
            )}
          </Box>
        </Box>
        {/* Qaysi zavod — nom tagida (zavod o'zgartirilsa Sozlamalar → Zavod) */}
        {factoryName && (
          <Box
            title={factoryName}
            sx={{
              mt: 1.5,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              maxWidth: '100%',
              px: 1.5,
              py: 0.6,
              borderRadius: 999,
              bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === 'light' ? 0.06 : 0.1),
              color: 'text.primary',
            }}
          >
            <FactoryOutlinedIcon sx={{ fontSize: 15, color: 'primary.main', flexShrink: 0 }} />
            <Typography
              noWrap
              sx={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.3 }}
            >
              {factoryName}
            </Typography>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 1.5,
          scrollbarWidth: 'thin',
          scrollbarColor: `${alpha(theme.palette.text.primary, 0.15)} transparent`,
        }}
      >
        {NAVIGATION.map((section) => {
          const items = section.items.filter((item) => !item.roles || hasRole(...item.roles));
          if (items.length === 0) return null;
          return (
            <List
              key={section.title}
              dense
              disablePadding
              sx={{ mb: 1 }}
              subheader={
                <ListSubheader
                  disableSticky
                  sx={{
                    bgcolor: 'transparent',
                    color: alpha(theme.palette.text.secondary, 0.8),
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    lineHeight: '34px',
                    pl: 1.5,
                  }}
                >
                  {section.title}
                </ListSubheader>
              }
            >
              {items.map(renderItem)}
            </List>
          );
        })}
      </Box>

      {BOTTOM_NAVIGATION.some((item) => !item.roles || hasRole(...item.roles)) && (
        <List dense sx={{ px: 1.5, pt: 1, pb: 0, borderTop: 1, borderColor: 'divider' }}>
          {BOTTOM_NAVIGATION.filter((item) => !item.roles || hasRole(...item.roles)).map(renderItem)}
        </List>
      )}

    </Box>
  );
}

interface Props {
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const theme = useTheme();
  const bg = SIDEBAR_BG[theme.palette.mode];
  return (
    <Box component="nav" sx={{ width: { lg: SIDEBAR_WIDTH + SHELL_GAP }, flexShrink: { lg: 0 } }}>
      {/* Mobil / planshet */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, border: 'none', bgcolor: bg, borderRadius: '0 24px 24px 0' },
        }}
      >
        <SidebarContent onNavigate={onMobileClose} />
      </Drawer>
      {/* Desktop — ekran chetidan ajralgan "suzuvchi" panel */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', lg: 'block' },
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            top: SHELL_GAP,
            left: SHELL_GAP,
            height: `calc(100% - ${SHELL_GAP * 2}px)`,
            border: 'none',
            borderRadius: '24px',
            bgcolor: bg,
            boxShadow: softShadow(theme),
            overflow: 'hidden',
          },
        }}
      >
        <SidebarContent />
      </Drawer>
    </Box>
  );
}

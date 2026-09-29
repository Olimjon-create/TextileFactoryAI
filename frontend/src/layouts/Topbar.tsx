import { useState } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { Link as RouterLink } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import ChangePasswordDialog from '@/features/auth/components/ChangePasswordDialog';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import { SHELL_GAP, SIDEBAR_WIDTH, softShadow, translucentPaper } from '@/app/theme';
import NotificationBell from '@/features/analytics/components/NotificationBell';
import LanguageSwitcher from '@/shared/components/LanguageSwitcher';
import ThemeToggle from '@/shared/components/ThemeToggle';
import { useAuth } from '@/features/auth/AuthContext';
import { ROLE_LABELS } from '@/shared/constants/roles';
import BrandLogo from '@/shared/components/BrandLogo';
import BrandWordmark from '@/shared/components/BrandWordmark';
import LiveClock from '@/shared/components/LiveClock';
import { tr } from '@/i18n';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);

  if (!user) return null;

  const leftOffset = SIDEBAR_WIDTH + SHELL_GAP * 2;

  return (
    <AppBar
      position="fixed"
      color="inherit"
      elevation={0}
      sx={(theme) => ({
        top: { xs: 0, lg: SHELL_GAP },
        left: { xs: 0, lg: leftOffset },
        right: { xs: 0, lg: SHELL_GAP },
        width: 'auto',
        borderRadius: { xs: 0, lg: '20px' },
        bgcolor: translucentPaper(theme),
        backdropFilter: 'saturate(160%) blur(12px)',
        boxShadow: softShadow(theme),
      })}
    >
      <Toolbar sx={{ minHeight: { xs: 60, sm: 64 }, px: { xs: 1.5, sm: 2.5 } }}>
        <IconButton edge="start" onClick={onMenuClick} aria-label={tr("Menyu")} sx={{ mr: 1, display: { lg: 'none' } }}>
          <MenuIcon />
        </IconButton>
        <Box
          component={RouterLink}
          to="/"
          sx={{ display: { xs: 'flex', lg: 'none' }, alignItems: 'center', gap: 1, color: 'inherit', textDecoration: 'none', minWidth: 0 }}
        >
          <BrandLogo size={30} />
          <Typography sx={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.02em' }} noWrap>
            <BrandWordmark />
          </Typography>
        </Box>

        <Box
          sx={{
            display: { xs: 'none', sm: 'flex' },
            alignItems: 'center',
            gap: 1.25,
            ml: { sm: 1.5, md: 0 },
            position: { sm: 'static', md: 'absolute' },
            left: '50%',
            top: '50%',
            transform: { md: 'translate(-50%, -50%)' },
          }}
        >
          <Box
            title={tr("Tizim ishlayapti")}
            sx={{ display: { xs: 'none', lg: 'block' }, width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', boxShadow: '0 0 0 4px rgba(47,143,91,0.15)' }}
          />
          <LiveClock />
        </Box>

        <Box sx={{ flex: 1 }} />
        <NotificationBell />
        <LanguageSwitcher />
        <ThemeToggle sx={{ mr: { xs: 0, sm: 1 } }} />
        <Box
          onClick={(e) => setAnchor(e.currentTarget)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            cursor: 'pointer',
            borderRadius: 999,
            pl: 0.5,
            pr: { xs: 0.5, sm: 1.25 },
            py: 0.5,
            border: 1,
            borderColor: 'divider',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Avatar sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText', width: 34, height: 34, fontSize: 13, fontWeight: 800 }}>
            {initials(user.full_name)}
          </Avatar>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2 }}>{user.full_name}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.2 }}>{ROLE_LABELS[user.role]}</Typography>
          </Box>
          <KeyboardArrowDownRoundedIcon sx={{ display: { xs: 'none', sm: 'block' }, color: 'text.secondary', fontSize: 20 }} />
        </Box>
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={() => setAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
        >
          <Box sx={{ px: 2, py: 1.25 }}>
            <Typography sx={{ fontWeight: 700 }}>{user.full_name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {user.email}
            </Typography>
          </Box>
          <Divider />
          <MenuItem
            onClick={() => {
              setAnchor(null);
              setPasswordOpen(true);
            }}
            sx={{ py: 1.25, fontWeight: 600 }}
          >
            <ListItemIcon>
              <LockResetRoundedIcon fontSize="small" />
            </ListItemIcon>
            {tr("Parolni o'zgartirish")}
          </MenuItem>
          <MenuItem onClick={logout} sx={{ py: 1.25, color: 'error.main', fontWeight: 600 }}>
            <ListItemIcon sx={{ color: 'inherit' }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            {tr("Chiqish")}
          </MenuItem>
        </Menu>
        <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      </Toolbar>
    </AppBar>
  );
}

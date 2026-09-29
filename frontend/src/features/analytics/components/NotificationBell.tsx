import { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Divider, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../api';
import type { AppNotification, NotificationList } from '../types';
import { tr } from '@/i18n';

const POLL_MS = 60_000;
const ICON = {
  error: <ErrorOutlineIcon color="error" fontSize="small" />,
  warning: <WarningAmberIcon color="warning" fontSize="small" />,
  info: <InfoOutlinedIcon color="info" fontSize="small" />,
};

/** Yuqori paneldagi qo'ng'iroqcha: kechikishlar, kam qolgan material, buzilgan mashina, yangi buyurtmalar */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState<NotificationList | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const load = useCallback(() => {
    analyticsApi.notifications().then(setData).catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const open = (n: AppNotification) => {
    setAnchor(null);
    if (!n.read) analyticsApi.markRead([n.key]).then(setData).catch(() => undefined);
    navigate(n.path);
  };

  const unread = data?.unread ?? 0;
  return (
    <>
      <Tooltip title={tr("Bildirishnomalar")}>
        <IconButton
          onClick={(e) => {
            setAnchor(e.currentTarget);
            load();
          }}
          aria-label={tr("Bildirishnomalar")}
          sx={{ mr: { xs: 0, sm: 1 } }}
        >
          <Badge badgeContent={unread} color="error" max={99}>
            <NotificationsNoneOutlinedIcon />
          </Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: { xs: 'calc(100vw - 24px)', sm: 400 }, maxHeight: 520, mt: 1 } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5 }}>
          <Typography sx={{ fontWeight: 700, flex: 1 }}>{tr("Bildirishnomalar")}</Typography>
          {unread > 0 && (
            <Button size="small" onClick={() => analyticsApi.markAllRead().then(setData).catch(() => undefined)}>
              {tr("Hammasi o'qildi")}
            </Button>
          )}
        </Box>
        <Divider />
        {data && data.items.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>
            {tr("Hozircha ogohlantirish yo'q")}
          </Typography>
        )}
        {data?.items.map((n) => (
          <Box
            key={n.key}
            onClick={() => open(n)}
            sx={{
              display: 'flex',
              gap: 1.5,
              px: 2,
              py: 1.25,
              cursor: 'pointer',
              borderBottom: 1,
              borderColor: 'divider',
              opacity: n.read ? 0.6 : 1,
              bgcolor: n.read ? undefined : 'action.hover',
              '&:hover': { bgcolor: 'action.selected' },
            }}
          >
            <Box sx={{ pt: 0.25 }}>{ICON[n.severity]}</Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: n.read ? 400 : 600, fontSize: 14 }}>{n.title}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
                {n.message}
              </Typography>
            </Box>
          </Box>
        ))}
      </Popover>
    </>
  );
}

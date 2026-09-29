import { useState } from 'react';
import { Button, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, type SxProps, type Theme } from '@mui/material';
import LanguageRoundedIcon from '@mui/icons-material/LanguageRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { getLang, LANGUAGES, setLang, tr } from '@/i18n';

/** 🌐 UZ ▾ — til tanlash (O'zbekcha / Русский / English). Tanlanganda sahifa yangi tilda qayta yuklanadi */
export default function LanguageSwitcher({ sx }: { sx?: SxProps<Theme> }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const current = getLang();
  const short = LANGUAGES.find((l) => l.code === current)?.short ?? 'UZ';

  return (
    <>
      <Tooltip title={tr('Til')}>
        <Button
          color="inherit"
          onClick={(e) => setAnchor(e.currentTarget)}
          startIcon={<LanguageRoundedIcon />}
          aria-label={tr('Til')}
          sx={[{ minWidth: 0, px: 1, fontWeight: 800, fontSize: 13, color: 'text.secondary', '& .MuiButton-startIcon': { mr: 0.5 } }, ...(Array.isArray(sx) ? sx : [sx])]}
        >
          {short}
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        {LANGUAGES.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === current}
            onClick={() => {
              setAnchor(null);
              setLang(l.code);
            }}
            sx={{ minWidth: 180 }}
          >
            <ListItemText primary={l.label} secondary={l.short} />
            {l.code === current && (
              <ListItemIcon sx={{ minWidth: 0, color: 'primary.main' }}>
                <CheckRoundedIcon fontSize="small" />
              </ListItemIcon>
            )}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

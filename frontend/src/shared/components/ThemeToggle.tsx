import { IconButton, Tooltip, type SxProps, type Theme } from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { useColorMode } from '@/app/ColorModeContext';
import { tr } from '@/i18n';

/** 🌙/☀️ — Light va Dark rejimlar orasida almashtirish */
export default function ThemeToggle({ sx }: { sx?: SxProps<Theme> }) {
  const { mode, toggle } = useColorMode();
  const label = mode === 'dark' ? tr("Yorug' rejim") : tr("Qorong'i rejim");
  return (
    <Tooltip title={label}>
      <IconButton onClick={toggle} aria-label={label} sx={sx}>
        {mode === 'dark' ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
      </IconButton>
    </Tooltip>
  );
}

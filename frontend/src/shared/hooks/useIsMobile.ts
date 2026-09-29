import { useMediaQuery, useTheme } from '@mui/material';

/** Telefon va kichik planshet (< 900px): jadvallar o'rniga kartalar ko'rsatiladi */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

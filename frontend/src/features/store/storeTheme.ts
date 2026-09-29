import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

const palettes = {
  light: {
    primary: { main: '#a47864', light: '#c49a86', dark: '#7d5a4a', contrastText: '#ffffff' },
    secondary: { main: '#7c8b6f', light: '#9aab8c', dark: '#5f6c55', contrastText: '#ffffff' },
    background: { default: '#f6f5f2', paper: '#ffffff' },
    text: { primary: '#2b211c', secondary: '#6f625a' },
    divider: 'rgba(43, 33, 28, 0.10)',
  },
  dark: {
    primary: { main: '#c9a18c', light: '#dcbcab', dark: '#a47864', contrastText: '#1c1512' },
    secondary: { main: '#9aab8c', light: '#b5c3a9', dark: '#7c8b6f', contrastText: '#1c1512' },
    background: { default: '#16110f', paper: '#211a17' },
    text: { primary: '#f0eee9', secondary: '#b9ada4' },
    divider: 'rgba(240, 238, 233, 0.10)',
  },
} as const;

export const SERIF = 'inherit';

export const glass = (theme: Theme, opacity = 0.72) => ({
  backgroundColor: opacity < 0.7 ? alpha(theme.palette.background.paper, 0.96) : theme.palette.background.paper,
});

export function createStoreTheme(base: Theme): Theme {
  const mode: PaletteMode = base.palette.mode;
  const p = palettes[mode];
  return createTheme(base, {
    palette: {
      primary: p.primary,
      secondary: p.secondary,
      background: p.background,
      text: p.text,
      divider: p.divider,
    },
    shape: { borderRadius: 10 },
    typography: {
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 700 },
      h4: { fontWeight: 700, letterSpacing: '-0.01em' },
      h5: { fontWeight: 700 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 10, paddingInline: 18, textTransform: 'none', fontWeight: 600 },
          containedPrimary: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }: { theme: Theme }) => ({
            backgroundColor: theme.palette.background.paper,
            borderRadius: 14,
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 'none',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            '@media (hover: hover) and (pointer: fine)': {
              '&:hover': {
                borderColor: alpha(theme.palette.text.primary, 0.22),
                boxShadow: `0 6px 18px ${alpha('#2b211c', mode === 'dark' ? 0.4 : 0.07)}`,
              },
            },
          }),
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999 },
          outlined: ({ theme }: { theme: Theme }) => ({ borderColor: alpha(theme.palette.text.primary, 0.18) }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }: { theme: Theme }) => ({
            borderRadius: 10,
            backgroundColor: theme.palette.background.paper,
          }),
          multiline: { borderRadius: 10 },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: ({ theme }: { theme: Theme }) => ({ ...glass(theme, 0.92) }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 16 },
        },
      },
    },
  });
}

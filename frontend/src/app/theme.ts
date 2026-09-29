import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material/styles';

export const SIDEBAR_WIDTH = 272;
/** Sidebar va header ekranning chetidan shu masofada "suzib" turadi */
export const SHELL_GAP = 16;

/**
 * "Linen & Emerald" dizayni: iliq zig'ir fon, to'q zumrad asosiy rang, terrakota urg'u.
 * Sidebar ham kontent kabi ochiq (light) / to'q (dark) — alohida to'q panel yo'q.
 */
export const SIDEBAR_BG: Record<PaletteMode, string> = {
  light: '#ffffff',
  dark: '#171a18',
};

const palettes = {
  light: {
    primary: { main: '#0f5c4d', dark: '#0a4237', light: '#3d8b78', contrastText: '#ffffff' },
    secondary: { main: '#d0643a', dark: '#a84c28', light: '#e38a64', contrastText: '#ffffff' },
    success: { main: '#2f8f5b' },
    info: { main: '#3a6ea5' },
    warning: { main: '#c98a1b' },
    error: { main: '#c2413b' },
    background: { default: '#f3f0ea', paper: '#ffffff' },
    text: { primary: '#1d1c19', secondary: '#6b675f' },
    divider: '#e7e2d8',
  },
  dark: {
    primary: { main: '#5cc4a6', dark: '#3ea88a', light: '#8adbc3', contrastText: '#0c1512' },
    secondary: { main: '#f08a5d', dark: '#d0643a', light: '#f6ab89', contrastText: '#1a0f0a' },
    success: { main: '#5bbf86' },
    info: { main: '#7aa7da' },
    warning: { main: '#e2ad4a' },
    error: { main: '#ef7a73' },
    background: { default: '#0f110f', paper: '#171a18' },
    text: { primary: '#ece9e2', secondary: '#a19d93' },
    divider: 'rgba(236, 233, 226, 0.09)',
  },
} as const;

const TABLE_HEAD_BG: Record<PaletteMode, string> = { light: '#faf8f4', dark: '#1c201d' };

const FONT = '"Manrope", "Inter", "Segoe UI", "Roboto", sans-serif';

/** Kartalar uchun yumshoq, qatlamli soya (dark rejimda — ingichka chegara) */
export const softShadow = (theme: Theme) =>
  theme.palette.mode === 'light'
    ? '0 1px 2px rgba(40, 32, 18, 0.04), 0 8px 24px -12px rgba(40, 32, 18, 0.12)'
    : `0 0 0 1px ${theme.palette.divider}`;

export function createAppTheme(mode: PaletteMode): Theme {
  return createTheme({
    palette: { mode, ...palettes[mode] },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT,
      h4: { fontWeight: 800, letterSpacing: '-0.02em' },
      h5: { fontWeight: 800, letterSpacing: '-0.015em' },
      h6: { fontWeight: 700, letterSpacing: '-0.01em' },
      subtitle1: { fontWeight: 600 },
      body2: { fontSize: 14 },
      button: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 },
      overline: { fontWeight: 700, letterSpacing: '0.1em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: (theme) => ({
          body: {
            transition: 'background-color .2s ease',
            // Fonda juda yengil "to'qima" naqshi
            backgroundImage:
              theme.palette.mode === 'light'
                ? 'radial-gradient(rgba(15, 92, 77, 0.035) 1px, transparent 1px)'
                : 'radial-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px)',
            backgroundSize: '18px 18px',
            backgroundAttachment: 'fixed',
          },
          '::selection': { background: alpha(theme.palette.primary.main, 0.2) },
        }),
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, paddingInline: 18 },
          sizeSmall: { paddingInline: 12 },
          outlined: ({ theme }) => ({ borderColor: theme.palette.divider, '&:hover': { borderColor: theme.palette.primary.main } }),
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 600, borderRadius: 8 },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: ({ theme }) => ({ borderRadius: 18, boxShadow: softShadow(theme) }),
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { borderRadius: 16 },
          outlined: ({ theme }) => ({ borderColor: theme.palette.divider }),
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: { borderRadius: 16 },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: ({ theme }) => ({ borderColor: theme.palette.divider }),
          head: ({ theme }) => ({
            fontWeight: 700,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: theme.palette.text.secondary,
            backgroundColor: TABLE_HEAD_BG[theme.palette.mode],
          }),
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: ({ theme }) => ({
            '&.MuiTableRow-hover:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.04) },
          }),
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', fullWidth: true },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: ({ theme }) => ({
            borderRadius: 12,
            backgroundColor: theme.palette.mode === 'light' ? '#fdfcfa' : alpha('#fff', 0.02),
            '& .MuiOutlinedInput-notchedOutline': { borderColor: theme.palette.divider },
          }),
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 3, borderRadius: 3 },
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 700 } },
      },
      MuiSkeleton: {
        defaultProps: { animation: 'wave' },
        styleOverrides: {
          root: ({ theme }) => ({
            backgroundColor: alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.08 : 0.06),
          }),
        },
      },
      MuiTooltip: {
        defaultProps: { arrow: true },
        styleOverrides: { tooltip: { borderRadius: 8, fontWeight: 600 } },
      },
      MuiMenu: {
        styleOverrides: {
          paper: ({ theme }) => ({ borderRadius: 14, boxShadow: '0 12px 40px -12px rgba(0,0,0,0.25)', border: `1px solid ${theme.palette.divider}` }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme }) => ({
            borderRadius: 20,
            [theme.breakpoints.down('sm')]: {
              margin: 12,
              width: 'calc(100% - 24px)',
              maxWidth: 'calc(100% - 24px) !important',
              maxHeight: 'calc(100% - 24px)',
            },
          }),
        },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: ({ theme }) => ({ fontWeight: 800, [theme.breakpoints.down('sm')]: { padding: '16px 16px 8px' } }),
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: ({ theme }) => ({ [theme.breakpoints.down('sm')]: { padding: '8px 16px' } }),
        },
      },
      MuiTablePagination: {
        styleOverrides: {
          selectLabel: ({ theme }) => ({ [theme.breakpoints.down('sm')]: { display: 'none' } }),
          input: ({ theme }) => ({ [theme.breakpoints.down('sm')]: { display: 'none' } }),
          toolbar: ({ theme }) => ({ [theme.breakpoints.down('sm')]: { paddingLeft: 12, paddingRight: 4 } }),
        },
      },
      MuiContainer: {
        styleOverrides: {
          root: ({ theme }) => ({ [theme.breakpoints.down('sm')]: { paddingLeft: 12, paddingRight: 12 } }),
        },
      },
    },
  });
}

/** Header/app bar uchun yarim shaffof fon (orqasidagi kontent xiralashadi) */
export const translucentPaper = (theme: Theme) => alpha(theme.palette.background.paper, 0.8);

/** 'primary.main' kabi mavzu yo'lini yoki oddiy CSS rangni haqiqiy rangga aylantiradi */
export function resolveColor(theme: Theme, color: string): string {
  const [key, shade = 'main'] = color.split('.');
  const entry = (theme.palette as unknown as Record<string, unknown>)[key];
  if (entry && typeof entry === 'object' && shade in (entry as Record<string, string>)) {
    return (entry as Record<string, string>)[shade];
  }
  return color;
}

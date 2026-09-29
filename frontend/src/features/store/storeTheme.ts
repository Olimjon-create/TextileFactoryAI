import { alpha, createTheme, type PaletteMode, type Theme } from '@mui/material/styles';
import { tr } from '@/i18n';

/**
 * Mijozlar katalogi uchun moda do'koni uslubidagi mavzu.
 * Ranglar — 2025–2026 trendlari: Pantone 2025 "Mocha Mousse" (asosiy), Pantone 2026 "Cloud Dancer" (fon),
 * espresso (matn) va sage (qo'shimcha). Xodimlar paneli o'zining ERP mavzusida qoladi.
 */
const palettes = {
  light: {
    primary: { main: '#a47864', light: '#c49a86', dark: '#7d5a4a', contrastText: '#ffffff' },
    secondary: { main: '#7c8b6f', light: '#9aab8c', dark: '#5f6c55', contrastText: '#ffffff' },
    background: { default: '#f0eee9', paper: '#fbfaf7' },
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

export const SERIF = tr("\"Playfair Display\", Georgia, \"Times New Roman\", serif");

/** "Shisha" (glass) sirt — blur qilingan fon ustida kontent o'qiladigan bo'lsin */
export const glass = (theme: Theme, opacity = 0.72) => ({
  backgroundColor: alpha(theme.palette.background.paper, opacity),
  backdropFilter: 'blur(18px) saturate(140%)',
  WebkitBackdropFilter: 'blur(18px) saturate(140%)',
});

/** Ilova mavzusi ustiga katalog uslubini qo'shadi (Light/Dark rejim saqlanadi) */
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
    shape: { borderRadius: 14 },
    typography: {
      h1: { fontFamily: SERIF, fontWeight: 600 },
      h2: { fontFamily: SERIF, fontWeight: 600 },
      h3: { fontFamily: SERIF, fontWeight: 600 },
      h4: { fontFamily: SERIF, fontWeight: 600, letterSpacing: '-0.01em' },
      h5: { fontFamily: SERIF, fontWeight: 600 },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          // Moda do'konlaridagidek yumaloq "pill" tugmalar
          root: { borderRadius: 999, paddingInline: 18 },
          containedPrimary: {
            boxShadow: `0 8px 20px ${alpha(p.primary.main, 0.28)}`,
            '&:hover': { boxShadow: `0 10px 24px ${alpha(p.primary.main, 0.36)}` },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: ({ theme }: { theme: Theme }) => ({
            ...glass(theme, mode === 'dark' ? 0.7 : 0.78),
            borderRadius: 20,
            border: `1px solid ${alpha('#ffffff', mode === 'dark' ? 0.06 : 0.6)}`,
            boxShadow: `0 10px 30px ${alpha('#2b211c', mode === 'dark' ? 0.35 : 0.08)}`,
            transition: 'transform 0.35s cubic-bezier(.2,.7,.2,1), box-shadow 0.35s ease, border-color 0.35s ease',
            // Sichqoncha borganda: karta sal ko'tariladi, soya chuqurlashadi, cheti mokko rangda yonadi.
            // Faqat sichqonchali qurilmalarda — telefonda "yopishib qolgan" hover bo'lmasin
            '@media (hover: hover) and (pointer: fine)': {
              '&:hover': {
                transform: 'translateY(-4px)',
                borderColor: alpha(theme.palette.primary.main, 0.45),
                boxShadow: `0 22px 48px ${alpha('#2b211c', mode === 'dark' ? 0.5 : 0.16)}, 0 0 0 1px ${alpha(theme.palette.primary.main, 0.25)}`,
              },
            },
            '@media (prefers-reduced-motion: reduce)': {
              transition: 'none',
              '&:hover': { transform: 'none' },
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
            borderRadius: 999,
            backgroundColor: alpha(theme.palette.background.paper, 0.7),
          }),
          multiline: { borderRadius: 16 },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: ({ theme }: { theme: Theme }) => ({ ...glass(theme, 0.92) }),
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 24 },
        },
      },
    },
  });
}

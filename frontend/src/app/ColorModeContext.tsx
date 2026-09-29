import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider, type PaletteMode } from '@mui/material';
import { createAppTheme } from './theme';

/** index.html dagi splash skripti ham shu kalitni o'qiydi — nomini o'zgartirmang */
export const COLOR_MODE_KEY = 'tfai_color_mode';

function initialMode(): PaletteMode {
  try {
    const saved = localStorage.getItem(COLOR_MODE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {

  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface ColorModeValue {
  mode: PaletteMode;
  toggle: () => void;
}

const ColorModeContext = createContext<ColorModeValue>({ mode: 'light', toggle: () => undefined });

/** Light/Dark mavzuni boshqaradi va tanlovni localStorage'da saqlaydi */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(initialMode);

  useEffect(() => {
    try {
      localStorage.setItem(COLOR_MODE_KEY, mode);
    } catch {
      // saqlab bo'lmasa ham rejim sahifa ochiq turganda ishlaydi
    }
    // Brauzerning o'z elementlari (scrollbar, autofill) ham mos rangda bo'lsin
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === 'light' ? 'dark' : 'light')), []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);
  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

export const useColorMode = () => useContext(ColorModeContext);

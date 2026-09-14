import { createContext, useContext, type ReactNode } from 'react';

import { lightTheme, type AppTheme } from './theme';

const ThemeContext = createContext<AppTheme>(lightTheme);

export function ThemeProvider({
  children,
  theme,
}: {
  children: ReactNode;
  theme: AppTheme;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}

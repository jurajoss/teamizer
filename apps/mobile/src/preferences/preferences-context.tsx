import { useColorScheme } from 'react-native';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nextProvider } from 'react-i18next';

import {
  darkTheme,
  lightTheme,
  ThemeProvider,
  type ThemeMode,
} from '@teamizer/ui';

import { i18n, type SupportedLanguage } from '../i18n/i18n';
import {
  loadPreferences,
  preferredLanguage,
  resolveThemeMode,
  saveLanguagePreference,
  saveThemePreference,
  type PreferenceStorage,
  type ThemePreference,
} from './preferences';

export type { ThemePreference } from './preferences';

type PreferencesValue = {
  language: SupportedLanguage;
  themePreference: ThemePreference;
  resolvedTheme: ThemeMode;
  setLanguage(language: SupportedLanguage): Promise<void>;
  setThemePreference(preference: ThemePreference): Promise<void>;
};

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({
  children,
  storage,
}: {
  children: ReactNode;
  storage: PreferenceStorage;
}) {
  const systemAppearance = useColorScheme();
  const systemLanguage = preferredLanguage([systemLocale()]);
  const [language, setLanguageState] =
    useState<SupportedLanguage>(systemLanguage);
  const [themePreference, setThemePreferenceState] =
    useState<ThemePreference>('system');
  const resolvedTheme = resolveThemeMode(themePreference, systemAppearance);

  useEffect(() => {
    let active = true;
    void loadPreferences(storage, systemLanguage).then((preferences) => {
      if (!active) return;
      setLanguageState(preferences.language);
      setThemePreferenceState(preferences.themePreference);
    });
    return () => {
      active = false;
    };
  }, [storage, systemLanguage]);

  useEffect(() => {
    void i18n.changeLanguage(language);
  }, [language]);

  const value = useMemo<PreferencesValue>(
    () => ({
      language,
      themePreference,
      resolvedTheme,
      setLanguage: async (nextLanguage) => {
        setLanguageState(nextLanguage);
        await saveLanguagePreference(storage, nextLanguage);
      },
      setThemePreference: async (preference) => {
        setThemePreferenceState(preference);
        await saveThemePreference(storage, preference);
      },
    }),
    [language, resolvedTheme, storage, themePreference],
  );

  return (
    <PreferencesContext.Provider value={value}>
      <I18nextProvider i18n={i18n}>
        <ThemeProvider
          theme={resolvedTheme === 'dark' ? darkTheme : lightTheme}
        >
          {children}
        </ThemeProvider>
      </I18nextProvider>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider.');
  }
  return context;
}

function systemLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en';
  }
}

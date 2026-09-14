import type { ThemeMode } from '@teamizer/ui';

import type { SupportedLanguage } from '../i18n/i18n';

export type ThemePreference = 'system' | ThemeMode;

export type PreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const LANGUAGE_STORAGE_KEY = '@teamizer/language';
export const THEME_STORAGE_KEY = '@teamizer/theme';

export function preferredLanguage(
  locales: readonly string[],
): SupportedLanguage {
  return locales.some(
    (locale) => locale.toLowerCase().split(/[-_]/)[0] === 'cs',
  )
    ? 'cs'
    : 'en';
}

export function resolveThemeMode(
  preference: ThemePreference,
  systemAppearance: 'dark' | 'light' | 'unspecified' | null | undefined,
): ThemeMode {
  if (preference !== 'system') return preference;
  return systemAppearance === 'dark' ? 'dark' : 'light';
}

export async function loadPreferences(
  storage: PreferenceStorage,
  fallbackLanguage: SupportedLanguage,
): Promise<{
  language: SupportedLanguage;
  themePreference: ThemePreference;
}> {
  const [storedLanguage, storedTheme] = await Promise.all([
    storage.getItem(LANGUAGE_STORAGE_KEY),
    storage.getItem(THEME_STORAGE_KEY),
  ]);
  return {
    language:
      storedLanguage === 'cs' || storedLanguage === 'en'
        ? storedLanguage
        : fallbackLanguage,
    themePreference:
      storedTheme === 'light' ||
      storedTheme === 'dark' ||
      storedTheme === 'system'
        ? storedTheme
        : 'system',
  };
}

export async function saveLanguagePreference(
  storage: PreferenceStorage,
  language: SupportedLanguage,
): Promise<void> {
  await storage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export async function saveThemePreference(
  storage: PreferenceStorage,
  preference: ThemePreference,
): Promise<void> {
  await storage.setItem(THEME_STORAGE_KEY, preference);
}

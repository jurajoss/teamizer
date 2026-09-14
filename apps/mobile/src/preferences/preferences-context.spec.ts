import { describe, expect, it } from 'vitest';

import {
  LANGUAGE_STORAGE_KEY,
  loadPreferences,
  preferredLanguage,
  resolveThemeMode,
  saveLanguagePreference,
  saveThemePreference,
  THEME_STORAGE_KEY,
  type PreferenceStorage,
} from './preferences';

class MemoryStorage implements PreferenceStorage {
  constructor(private readonly values = new Map<string, string>()) {}

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  value(key: string): string | undefined {
    return this.values.get(key);
  }
}

describe('local appearance and language preferences', () => {
  it('uses Czech for a supported Czech system locale and English otherwise', () => {
    expect(preferredLanguage(['cs-CZ'])).toBe('cs');
    expect(preferredLanguage(['en-GB'])).toBe('en');
    expect(preferredLanguage(['de-DE'])).toBe('en');
  });

  it('loads persisted choices and defaults theme to System', async () => {
    await expect(loadPreferences(new MemoryStorage(), 'cs')).resolves.toEqual({
      language: 'cs',
      themePreference: 'system',
    });
    await expect(
      loadPreferences(
        new MemoryStorage(
          new Map([
            [LANGUAGE_STORAGE_KEY, 'en'],
            [THEME_STORAGE_KEY, 'dark'],
          ]),
        ),
        'cs',
      ),
    ).resolves.toEqual({ language: 'en', themePreference: 'dark' });
  });

  it('follows system appearance only while System is selected', () => {
    expect(resolveThemeMode('system', 'dark')).toBe('dark');
    expect(resolveThemeMode('system', 'light')).toBe('light');
    expect(resolveThemeMode('light', 'dark')).toBe('light');
    expect(resolveThemeMode('dark', 'light')).toBe('dark');
  });

  it('persists explicit Czech/English and System/Light/Dark selections', async () => {
    const storage = new MemoryStorage();

    for (const language of ['cs', 'en'] as const) {
      await saveLanguagePreference(storage, language);
      expect(storage.value(LANGUAGE_STORAGE_KEY)).toBe(language);
    }

    for (const theme of ['system', 'light', 'dark'] as const) {
      await saveThemePreference(storage, theme);
      expect(storage.value(THEME_STORAGE_KEY)).toBe(theme);
    }
  });
});

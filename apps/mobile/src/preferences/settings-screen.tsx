import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Card, spacing } from '@teamizer/ui';

import type { SupportedLanguage } from '../i18n/i18n';
import { AppScreen } from '../ui/app-screen';
import { SegmentedControl } from '../ui/segmented-control';
import { usePreferences, type ThemePreference } from './preferences-context';

export function SettingsScreen() {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const themes: ReadonlyArray<{
    label: string;
    value: ThemePreference;
  }> = [
    { label: t('settings.themeSystem'), value: 'system' },
    { label: t('settings.themeLight'), value: 'light' },
    { label: t('settings.themeDark'), value: 'dark' },
  ];
  const languages: ReadonlyArray<{
    label: string;
    value: SupportedLanguage;
  }> = [
    { label: t('settings.languageCzech'), value: 'cs' },
    { label: t('settings.languageEnglish'), value: 'en' },
  ];

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <Card padding="compact" style={styles.card}>
        <AppText accessibilityRole="header" variant="heading">
          {t('settings.theme')}
        </AppText>
        <SegmentedControl
          accessibilityLabel={t('settings.theme')}
          items={themes}
          onChange={(value) => void preferences.setThemePreference(value)}
          value={preferences.themePreference}
        />
      </Card>
      <Card padding="compact" style={styles.card}>
        <AppText accessibilityRole="header" variant="heading">
          {t('settings.language')}
        </AppText>
        <SegmentedControl
          accessibilityLabel={t('settings.language')}
          items={languages}
          onChange={(value) => void preferences.setLanguage(value)}
          value={preferences.language}
        />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  card: { gap: spacing.sm },
});

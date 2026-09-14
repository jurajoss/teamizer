import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, Button, spacing, Surface } from '@teamizer/ui';

import type { SupportedLanguage } from '../../src/i18n/i18n';
import {
  usePreferences,
  type ThemePreference,
} from '../../src/preferences/preferences-context';
import { AppScreen } from '../../src/ui/app-screen';

export default function SettingsRoute() {
  const { t } = useTranslation();
  const preferences = usePreferences();
  const themes: ReadonlyArray<[ThemePreference, string]> = [
    ['system', t('settings.themeSystem')],
    ['light', t('settings.themeLight')],
    ['dark', t('settings.themeDark')],
  ];
  const languages: ReadonlyArray<[SupportedLanguage, string]> = [
    ['cs', t('settings.languageCzech')],
    ['en', t('settings.languageEnglish')],
  ];

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <AppText style={styles.intro} tone="muted">
        {t('settings.intro')}
      </AppText>
      <Surface style={styles.section}>
        <View style={styles.sectionHeading}>
          <AppText variant="eyebrow" tone="brand">
            {t('settings.appearance').toUpperCase()}
          </AppText>
          <AppText variant="heading">{t('settings.theme')}</AppText>
          <AppText variant="caption" tone="muted">
            {t('settings.themeHint')}
          </AppText>
        </View>
        <View style={styles.choices}>
          {themes.map(([value, label]) => (
            <Button
              key={value}
              label={label}
              onPress={() => void preferences.setThemePreference(value)}
              variant={
                preferences.themePreference === value ? 'primary' : 'secondary'
              }
            />
          ))}
        </View>
      </Surface>
      <Surface style={styles.section}>
        <View style={styles.sectionHeading}>
          <AppText variant="eyebrow" tone="brand">
            {t('settings.language').toUpperCase()}
          </AppText>
          <AppText variant="heading">{t('settings.language')}</AppText>
          <AppText variant="caption" tone="muted">
            {t('settings.languageHint')}
          </AppText>
        </View>
        <View style={styles.choices}>
          {languages.map(([value, label]) => (
            <Button
              key={value}
              label={label}
              onPress={() => void preferences.setLanguage(value)}
              variant={preferences.language === value ? 'primary' : 'secondary'}
            />
          ))}
        </View>
      </Surface>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl },
  intro: { maxWidth: 620 },
  section: { gap: spacing.lg },
  sectionHeading: { gap: spacing.xs },
  choices: { gap: spacing.sm },
});

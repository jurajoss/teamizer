import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { spacing, typography, useTheme } from '@teamizer/ui';

export function HeaderBackButton() {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/home');
  };

  return (
    <Pressable
      accessibilityLabel={t('common.back')}
      accessibilityRole="button"
      hitSlop={spacing.xs}
      onPress={goBack}
      style={({ pressed }) => [
        styles.button,
        pressed && { backgroundColor: colors.accentSoft },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.chevron, { color: colors.accent }]}>{'‹'}</Text>
        <Text style={[styles.label, { color: colors.accent }]}>
          {t('common.back')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 48,
  },
  chevron: {
    fontSize: 32,
    fontWeight: '300',
    lineHeight: 32,
    marginTop: -2,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  label: {
    fontSize: typography.body.fontSize,
    fontWeight: '500',
  },
});

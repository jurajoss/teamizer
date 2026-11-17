import { router, usePathname, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText, radii, sizes, spacing, useTheme } from '@teamizer/ui';

import { AppIcon } from '../ui/icons/app-icon';
import type { TeamizerIconName } from '../ui/icons/app-icon-map';
import { nestedBackFallback } from './header-policy';

export function HeaderIconAction({
  icon,
  label,
  onPress,
}: {
  icon: TeamizerIconName;
  label: string;
  onPress(): void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        {
          backgroundColor: pressed ? colors.surfaceSubtle : 'transparent',
        },
      ]}
    >
      <AppIcon color={colors.textPrimary} name={icon} size={sizes.icon.large} />
    </Pressable>
  );
}

export function HeaderBackButton({ fallback }: { fallback?: Href } = {}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(fallback ?? (nestedBackFallback(pathname) as Href));
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
        <AppIcon color={colors.accent} name="back" size={sizes.icon.medium} />
        <AppText variant="body" style={{ color: colors.accent }}>
          {t('common.back')}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconAction: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: sizes.minimumTouchTarget,
    justifyContent: 'center',
    width: sizes.minimumTouchTarget,
  },
  button: {
    alignItems: 'center',
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    minWidth: sizes.minimumTouchTarget,
  },
  content: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
  },
});

import { router, usePathname, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AppText,
  borderWidths,
  BrandLockup,
  layout,
  radii,
  sizes,
  spacing,
  useResponsiveLayout,
  useTheme,
} from '@teamizer/ui';

import { AppScreenShellProvider } from '../ui/app-screen-shell-context';
import { AppIcon } from '../ui/icons/app-icon';
import {
  activePrimaryDestination,
  authenticatedShellPresentationForPath,
  initialPrimaryDestination,
  primaryDestinations,
  primaryNavigationTarget,
  type PrimaryDestination,
  type PrimaryDestinationKey,
} from './primary-navigation';

export function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { mode } = useResponsiveLayout();
  const pathname = usePathname();
  const resolvedDestination = activePrimaryDestination(pathname);
  const [retainedDestination, setRetainedDestination] =
    useState<PrimaryDestinationKey>(initialPrimaryDestination(pathname));
  const activeDestination = resolvedDestination ?? retainedDestination;
  const presentation = authenticatedShellPresentationForPath(mode, pathname);

  const navigate = (destination: PrimaryDestination) => {
    setRetainedDestination(destination.key);
    const target = primaryNavigationTarget(pathname, destination);
    if (target) router.dismissTo(target as Href);
  };

  return (
    <View
      style={[
        mode === 'tablet' ? styles.tabletShell : styles.phoneShell,
        { backgroundColor: colors.background },
      ]}
    >
      {presentation.showSidebar ? (
        <TabletSidebar
          activeDestination={activeDestination}
          onNavigate={navigate}
        />
      ) : null}
      <AppScreenShellProvider
        key={presentation.contentKey}
        ownership={presentation.ownership}
      >
        <View style={styles.content}>{children}</View>
      </AppScreenShellProvider>
      {presentation.showBottomNavigation ? (
        <PhoneBottomNavigation
          activeDestination={activeDestination}
          onNavigate={navigate}
        />
      ) : null}
    </View>
  );
}

function PhoneBottomNavigation({
  activeDestination,
  onNavigate,
}: {
  activeDestination: PrimaryDestinationKey | null;
  onNavigate(destination: PrimaryDestination): void;
}) {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      edges={['right', 'bottom', 'left']}
      style={[
        styles.bottomSafeArea,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      ]}
    >
      <View accessibilityRole="tablist" style={styles.bottomNavigation}>
        {primaryDestinations.map((destination) => (
          <PrimaryNavigationItem
            active={destination.key === activeDestination}
            destination={destination}
            key={destination.key}
            onPress={() => onNavigate(destination)}
            placement="bottom"
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

function TabletSidebar({
  activeDestination,
  onNavigate,
}: {
  activeDestination: PrimaryDestinationKey | null;
  onNavigate(destination: PrimaryDestination): void;
}) {
  const { colors } = useTheme();

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      style={[
        styles.sidebar,
        {
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
        },
      ]}
    >
      <View style={styles.sidebarBrand}>
        <BrandLockup compact />
      </View>
      <View accessibilityRole="tablist" style={styles.sidebarNavigation}>
        {primaryDestinations.map((destination) => (
          <PrimaryNavigationItem
            active={destination.key === activeDestination}
            destination={destination}
            key={destination.key}
            onPress={() => onNavigate(destination)}
            placement="sidebar"
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

function PrimaryNavigationItem({
  active,
  destination,
  onPress,
  placement,
}: {
  active: boolean;
  destination: PrimaryDestination;
  onPress(): void;
  placement: 'bottom' | 'sidebar';
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const label = t(destination.labelKey);
  const foreground = active ? colors.accent : colors.textSecondary;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        placement === 'bottom' ? styles.bottomItem : styles.sidebarItem,
        placement === 'bottom' && {
          borderTopColor: active ? colors.accent : 'transparent',
        },
        placement === 'sidebar' &&
          active && {
            backgroundColor: colors.accentSoft,
            borderLeftColor: colors.accent,
          },
        pressed && { backgroundColor: colors.surfaceSubtle },
      ]}
    >
      <AppIcon
        color={foreground}
        name={destination.icon}
        size={sizes.icon.large}
      />
      <AppText
        numberOfLines={2}
        style={[styles.navigationLabel, { color: foreground }]}
        variant={active ? 'label' : 'caption'}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  phoneShell: { flex: 1 },
  tabletShell: { flex: 1, flexDirection: 'row' },
  content: { flex: 1, minWidth: 0 },
  bottomSafeArea: { borderTopWidth: borderWidths.subtle },
  bottomNavigation: {
    flexDirection: 'row',
    minHeight: layout.bottomNavigationMinHeight,
  },
  bottomItem: {
    alignItems: 'center',
    borderTopWidth: borderWidths.emphasized,
    flex: 1,
    gap: spacing.xxs,
    justifyContent: 'center',
    minHeight: layout.bottomNavigationMinHeight,
    minWidth: sizes.minimumTouchTarget,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.xs,
  },
  navigationLabel: { textAlign: 'center' },
  sidebar: {
    borderRightWidth: borderWidths.subtle,
    paddingHorizontal: spacing.md,
    width: layout.navigationSidebarWidth,
  },
  sidebarBrand: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xl,
  },
  sidebarNavigation: { gap: spacing.xs },
  sidebarItem: {
    alignItems: 'center',
    borderLeftColor: 'transparent',
    borderLeftWidth: borderWidths.emphasized,
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});

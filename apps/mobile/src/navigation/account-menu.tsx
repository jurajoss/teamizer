import { router, type Href } from 'expo-router';
import {
  createContext,
  useContext,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Avatar,
  Divider,
  FeedbackBanner,
  radii,
  sizes,
  spacing,
  useResponsiveLayout,
  useTheme,
} from '@teamizer/ui';

import type { CurrentUser } from '../api/contracts';
import { useSession } from '../session/session-context';
import { playerRouteFor } from '../statistics/statistics';
import { AppIcon } from '../ui/icons/app-icon';
import type { TeamizerIconName } from '../ui/icons/app-icon-map';
import {
  accountMenuItemKeysForRole,
  accountMenuVisibility,
  type AccountMenuItemKey,
} from './account-menu-state';

const AccountMenuContext = createContext<(() => void) | null>(null);

export function AccountMenuProvider({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { isTablet } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [menuState, dispatchMenu] = useReducer(accountMenuVisibility, 'closed');
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'AUTHENTICATED') return <>{children}</>;

  const navigate = (href: Href) => {
    dispatchMenu('CLOSE');
    router.navigate(href);
  };

  const submitSignOut = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
      dispatchMenu('CLOSE');
    } catch {
      setError(t('account.signOutFailed'));
    } finally {
      setSigningOut(false);
    }
  };
  return (
    <AccountMenuContext.Provider value={() => dispatchMenu('OPEN')}>
      {children}
      <Modal
        animationType="fade"
        onRequestClose={() => dispatchMenu('CLOSE')}
        statusBarTranslucent
        transparent
        visible={menuState === 'open'}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel={t('account.close')}
            accessibilityRole="button"
            onPress={() => dispatchMenu('CLOSE')}
            style={[styles.backdrop, { backgroundColor: colors.overlay }]}
          />
          <View
            accessibilityViewIsModal
            onAccessibilityEscape={() => dispatchMenu('CLOSE')}
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: isTablet ? spacing.xxl : 0,
              },
            ]}
          >
            <View style={styles.handleRow}>
              <View
                accessibilityElementsHidden
                style={[
                  styles.handle,
                  { backgroundColor: colors.borderStrong },
                ]}
              />
            </View>
            <ScrollView
              bounces={false}
              contentContainerStyle={[
                styles.sheetContent,
                { paddingBottom: Math.max(spacing.md, insets.bottom) },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.sheetScroll}
            >
              <AccountMenuContent
                currentUser={state.currentUser}
                error={error}
                onNavigate={navigate}
                onSignOut={() => void submitSignOut()}
                signingOut={signingOut}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </AccountMenuContext.Provider>
  );
}

export function AccountMenuContent({
  currentUser,
  error,
  onNavigate,
  onSignOut,
  signingOut,
}: {
  currentUser: CurrentUser;
  error: string | null;
  onNavigate(href: Href): void;
  onSignOut(): void;
  signingOut: boolean;
}) {
  const { t } = useTranslation();
  const routeItems = accountMenuItemKeysForRole(currentUser.user.role).filter(
    (key): key is AccountMenuRouteKey => key !== 'logout',
  );

  return (
    <>
      <View style={styles.identity}>
        <Avatar
          name={currentUser.player.name}
          size="medium"
          url={currentUser.player.avatarUrl}
        />
        <AppText accessibilityRole="header" variant="heading">
          {currentUser.player.name}
        </AppText>
      </View>
      <Divider />
      <View>
        {routeItems.map((key) => {
          const item = accountMenuRoutes[key];
          const href =
            key === 'profile'
              ? playerRouteFor(currentUser.player.id)
              : (item.href as '/settings' | '/admin');
          return (
            <AccountMenuNavigationRow
              icon={item.icon}
              key={key}
              label={t(item.labelKey)}
              onPress={() => onNavigate(href)}
            />
          );
        })}
      </View>
      {error ? <FeedbackBanner tone="error" message={error} /> : null}
      <View style={styles.logoutSection}>
        <Divider />
        <AccountMenuLogoutRow
          busy={signingOut}
          label={t('account.signOut')}
          onPress={onSignOut}
        />
      </View>
    </>
  );
}

export function AccountMenuNavigationRow({
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
        styles.menuRow,
        pressed && { backgroundColor: colors.accentSoft },
      ]}
    >
      <AppIcon color={colors.accent} name={icon} size={sizes.icon.medium} />
      <AppText numberOfLines={1} style={styles.menuRowLabel} variant="body">
        {label}
      </AppText>
      <AppIcon color={colors.textSubtle} name="next" size={sizes.icon.small} />
    </Pressable>
  );
}

export function AccountMenuLogoutRow({
  busy,
  label,
  onPress,
}: {
  busy: boolean;
  label: string;
  onPress(): void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        pressed && !busy && { backgroundColor: colors.dangerSurface },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={colors.danger} size="small" />
      ) : (
        <AppIcon color={colors.danger} name="logout" size={sizes.icon.medium} />
      )}
      <AppText
        numberOfLines={1}
        style={[styles.menuRowLabel, { color: colors.danger }]}
        variant="body"
      >
        {label}
      </AppText>
    </Pressable>
  );
}

type AccountMenuRouteKey = Exclude<AccountMenuItemKey, 'logout'>;

const accountMenuRoutes: Record<
  AccountMenuRouteKey,
  {
    href: '/settings' | '/admin' | null;
    icon: TeamizerIconName;
    labelKey: 'account.profile' | 'account.settings' | 'account.administration';
  }
> = {
  profile: {
    href: null,
    icon: 'account',
    labelKey: 'account.profile',
  },
  settings: {
    href: '/settings',
    icon: 'settings',
    labelKey: 'account.settings',
  },
  administration: {
    href: '/admin',
    icon: 'administration',
    labelKey: 'account.administration',
  },
};

export function AccountAvatarButton() {
  const open = useContext(AccountMenuContext);
  const { state } = useSession();
  const { colors } = useTheme();
  const { t } = useTranslation();
  if (!open || state.status !== 'AUTHENTICATED') return null;

  return (
    <Pressable
      accessibilityLabel={t('nav.openAccount')}
      accessibilityRole="button"
      hitSlop={4}
      onPress={open}
      style={({ pressed }) => [
        styles.avatarButton,
        pressed && { backgroundColor: colors.accentSoft },
      ]}
    >
      <Avatar
        name={state.currentUser.player.name}
        size="medium"
        url={state.currentUser.player.avatarUrl}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  sheet: {
    alignSelf: 'center',
    borderRadius: radii.lg,
    borderWidth: 1,
    maxHeight: '92%',
    maxWidth: 440,
    overflow: 'hidden',
    width: '100%',
  },
  handleRow: {
    alignItems: 'center',
    height: spacing.lg,
    justifyContent: 'center',
  },
  handle: { borderRadius: radii.pill, height: 4, width: 40 },
  sheetScroll: { flexGrow: 0, flexShrink: 1 },
  sheetContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxs,
  },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.xs,
  },
  menuRow: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: sizes.controlHeight,
    paddingHorizontal: spacing.xs,
  },
  menuRowLabel: { flex: 1 },
  logoutSection: { gap: spacing.xs, marginTop: spacing.xxs },
  avatarButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: sizes.minimumTouchTarget,
    justifyContent: 'center',
    width: sizes.minimumTouchTarget,
  },
});

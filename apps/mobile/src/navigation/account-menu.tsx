import { router, type Href } from 'expo-router';
import {
  createContext,
  useContext,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  layout,
  radii,
  spacing,
  StatusPill,
  useTheme,
} from '@teamizer/ui';

import { useSession } from '../session/session-context';
import { accountMenuVisibility } from './account-menu-state';

const AccountMenuContext = createContext<(() => void) | null>(null);

export function AccountMenuProvider({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [menuState, dispatchMenu] = useReducer(accountMenuVisibility, 'closed');
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (state.status !== 'AUTHENTICATED') return <>{children}</>;

  const navigate = (href: Href) => {
    dispatchMenu('CLOSE');
    router.push(href);
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
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                marginBottom: width >= 700 ? spacing.xxl : 0,
                paddingBottom: spacing.xl + insets.bottom,
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
            <View style={styles.identity}>
              <Avatar
                name={state.currentUser.player.name}
                size="large"
                url={state.currentUser.player.avatarUrl}
              />
              <View style={styles.identityCopy}>
                <AppText accessibilityRole="header" variant="heading">
                  {state.currentUser.player.name}
                </AppText>
                <View style={styles.pills}>
                  <StatusPill
                    label={
                      state.currentUser.user.role === 'ADMIN'
                        ? t('status.admin')
                        : t('common.player').toUpperCase()
                    }
                    tone={
                      state.currentUser.user.role === 'ADMIN'
                        ? 'info'
                        : 'neutral'
                    }
                  />
                  <StatusPill
                    label={
                      state.currentUser.player.status === 'ACTIVE'
                        ? t('status.active')
                        : t('status.inactive')
                    }
                    tone={
                      state.currentUser.player.status === 'ACTIVE'
                        ? 'success'
                        : 'neutral'
                    }
                  />
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              <Button
                label={t('account.profile')}
                onPress={() => navigate('/profile')}
                variant="secondary"
              />
              <Button
                label={t('account.settings')}
                onPress={() => navigate('/settings' as Href)}
                variant="secondary"
              />
              {state.currentUser.user.role === 'ADMIN' ? (
                <Button
                  label={t('account.administration')}
                  onPress={() => navigate('/admin' as Href)}
                  variant="secondary"
                />
              ) : null}
            </View>

            {error ? <FeedbackBanner tone="error" message={error} /> : null}
            <View style={[styles.signOut, { borderTopColor: colors.border }]}>
              <Button
                busy={signingOut}
                label={t('account.signOut')}
                onPress={() => void submitSignOut()}
                variant="danger"
              />
            </View>
          </View>
        </View>
      </Modal>
    </AccountMenuContext.Provider>
  );
}

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
        size="small"
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
    gap: spacing.lg,
    maxWidth: 440,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  handleRow: {
    alignItems: 'center',
    height: spacing.lg,
    justifyContent: 'center',
  },
  handle: { borderRadius: radii.pill, height: 4, width: 40 },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  identityCopy: { flex: 1, gap: spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { gap: spacing.xs },
  signOut: { borderTopWidth: 1, paddingTop: spacing.lg },
  avatarButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    height: layout.minimumTouchTarget,
    justifyContent: 'center',
    width: layout.minimumTouchTarget,
  },
});

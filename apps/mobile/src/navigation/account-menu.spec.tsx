import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  activityIndicator: 'ActivityIndicator',
  modal: 'Modal',
  pressable: 'Pressable',
  scrollView: 'ScrollView',
  view: 'View',
}));

vi.mock('react-native', () => ({
  ActivityIndicator: native.activityIndicator,
  Modal: native.modal,
  Pressable: native.pressable,
  ScrollView: native.scrollView,
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: native.view,
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'account.administration': 'Administration',
        'account.profile': 'My profile',
        'account.settings': 'Settings',
        'account.signOut': 'Sign out',
      })[key] ?? key,
  }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 0 }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  Divider: 'Divider',
  FeedbackBanner: 'FeedbackBanner',
  radii: { lg: 20, pill: 999, sm: 10 },
  sizes: {
    controlHeight: 52,
    icon: { medium: 20, small: 16 },
    minimumTouchTarget: 48,
  },
  spacing: {
    lg: 20,
    md: 16,
    sm: 12,
    xl: 24,
    xxl: 32,
    xs: 8,
    xxs: 4,
  },
  useResponsiveLayout: () => ({ isTablet: false }),
  useTheme: () => ({
    colors: {
      accent: 'accent',
      accentSoft: 'accentSoft',
      border: 'border',
      borderStrong: 'borderStrong',
      danger: 'danger',
      dangerSurface: 'dangerSurface',
      overlay: 'overlay',
      surface: 'surface',
      textSubtle: 'textSubtle',
    },
  }),
}));
vi.mock('../session/session-context', () => ({ useSession: vi.fn() }));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));

import type { CurrentUser } from '../api/contracts';
import {
  AccountMenuContent,
  AccountMenuLogoutRow,
  AccountMenuNavigationRow,
} from './account-menu';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('account menu presentation', () => {
  it('renders a compact identity with the shared avatar fallback and no badges', () => {
    const content = accountMenuContent('ADMIN');
    const avatar = descendants(content).find(({ type }) => type === 'Avatar');

    expect(avatar?.props).toMatchObject({
      name: 'Jura',
      size: 'medium',
      url: null,
    });
    expect(textValues(content)).toContain('Jura');
    expect(textValues(content)).not.toContain('ADMIN');
    expect(textValues(content)).not.toContain('ACTIVE');
    expect(descendants(content).some(({ type }) => type === 'StatusPill')).toBe(
      false,
    );
  });

  it('shows all authorized destinations for an administrator', () => {
    const onNavigate = vi.fn();
    const content = accountMenuContent('ADMIN', { onNavigate });
    const rows = descendants(content).filter(
      ({ type }) => type === AccountMenuNavigationRow,
    );

    expect(rows.map(({ props }) => props.label)).toEqual([
      'My profile',
      'Settings',
      'Administration',
    ]);
    rows.forEach(({ props }) => invoke(props.onPress));
    expect(onNavigate.mock.calls.map(([href]) => href)).toEqual([
      '/players/00000000-0000-4000-8000-000000000001',
      '/settings',
      '/admin',
    ]);
  });

  it('omits Administration for regular users without an empty placeholder', () => {
    const content = accountMenuContent('PLAYER');
    const rows = descendants(content).filter(
      ({ type }) => type === AccountMenuNavigationRow,
    );

    expect(rows.map(({ props }) => props.label)).toEqual([
      'My profile',
      'Settings',
    ]);
    expect(textValues(content)).not.toContain('Administration');
  });

  it('keeps logout as the same full-row action without a chevron', () => {
    const onSignOut = vi.fn();
    const content = accountMenuContent('PLAYER', { onSignOut });
    const logout = descendants(content).find(
      ({ type }) => type === AccountMenuLogoutRow,
    );
    const rendered = AccountMenuLogoutRow(
      logout?.props as Parameters<typeof AccountMenuLogoutRow>[0],
    ) as TestElement;

    invoke(logout?.props.onPress);
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(rendered.props).toMatchObject({
      accessibilityLabel: 'Sign out',
      accessibilityRole: 'button',
      accessibilityState: { busy: false, disabled: false },
    });
    expect(resolveStyle(rendered)).toContainEqual(
      expect.objectContaining({ minHeight: 52 }),
    );
    expect(
      descendants(rendered)
        .filter(({ type }) => type === 'AppIcon')
        .map(({ props }) => props.name),
    ).toEqual(['logout']);
    expect(
      descendants(rendered).find(({ type }) => type === 'AppText')?.props.style,
    ).toEqual(expect.arrayContaining([{ color: 'danger' }]));
  });

  it('renders navigation as compact full-width rows with restrained icon hierarchy', () => {
    const onPress = vi.fn();
    const row = AccountMenuNavigationRow({
      icon: 'account',
      label: 'My profile',
      onPress,
    }) as TestElement;

    invoke(row.props.onPress);
    expect(onPress).toHaveBeenCalledOnce();
    expect(row.props).toMatchObject({
      accessibilityLabel: 'My profile',
      accessibilityRole: 'button',
    });
    expect(resolveStyle(row)).toContainEqual(
      expect.objectContaining({ minHeight: 52 }),
    );
    expect(
      descendants(row)
        .filter(({ type }) => type === 'AppIcon')
        .map(({ props }) => ({ color: props.color, name: props.name })),
    ).toEqual([
      { color: 'accent', name: 'account' },
      { color: 'textSubtle', name: 'next' },
    ]);
  });
});

function accountMenuContent(
  role: 'PLAYER' | 'ADMIN',
  overrides: Partial<Parameters<typeof AccountMenuContent>[0]> = {},
) {
  return AccountMenuContent({
    currentUser: currentUser(role),
    error: null,
    onNavigate: vi.fn(),
    onSignOut: vi.fn(),
    signingOut: false,
    ...overrides,
  }) as TestElement;
}

function currentUser(role: 'PLAYER' | 'ADMIN'): CurrentUser {
  return {
    player: {
      avatarUrl: null,
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Jura',
      status: 'ACTIVE',
      type: 'REGULAR',
    },
    user: {
      createdAt: '2026-01-01T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000002',
      notificationsEnabled: true,
      role,
    },
  };
}

function descendants(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [
    element,
    ...Children.toArray(element.props.children).flatMap(descendants),
  ];
}

function textValues(node: ReactNode): string[] {
  if (typeof node === 'string') return [node];
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return Children.toArray(element.props.children).flatMap(textValues);
}

function invoke(handler: unknown) {
  if (typeof handler === 'function') handler();
}

function resolveStyle(element: TestElement) {
  const style = element.props.style;
  const resolved =
    typeof style === 'function'
      ? style({ hovered: false, pressed: false })
      : style;
  return Array.isArray(resolved) ? resolved : [resolved];
}

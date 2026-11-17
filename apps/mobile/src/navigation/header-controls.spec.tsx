import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  router: {
    back: vi.fn(),
    canGoBack: vi.fn(),
    replace: vi.fn(),
  },
  usePathname: () => '/players/player-id',
}));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  radii: { pill: 999, sm: 10 },
  sizes: { icon: { large: 24, medium: 20 }, minimumTouchTarget: 48 },
  spacing: { xs: 8, xxs: 4 },
  useTheme: () => ({
    colors: {
      accent: 'accent',
      accentContrast: 'accentContrast',
      accentPressed: 'accentPressed',
      accentSoft: 'accentSoft',
      surfaceSubtle: 'surfaceSubtle',
      textPrimary: 'textPrimary',
    },
  }),
}));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));

import { HeaderIconAction } from './header-controls';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('shared header actions', () => {
  it('uses a transparent 48 pt target with the theme foreground color', () => {
    const onPress = vi.fn();
    const action = HeaderIconAction({
      icon: 'edit',
      label: 'Edit player profile',
      onPress,
    }) as TestElement;
    const styles = (
      action.props.style as (state: { pressed: boolean }) => unknown[]
    )({ pressed: false });
    const icon = descendants(action).find(({ type }) => type === 'AppIcon');

    expect(action.props).toMatchObject({
      accessibilityLabel: 'Edit player profile',
      accessibilityRole: 'button',
    });
    expect(styles).toEqual([
      expect.objectContaining({
        borderRadius: 999,
        height: 48,
        width: 48,
      }),
      { backgroundColor: 'transparent' },
    ]);
    const pressedStyles = (
      action.props.style as (state: { pressed: boolean }) => unknown[]
    )({ pressed: true });
    expect(pressedStyles).toContainEqual({
      backgroundColor: 'surfaceSubtle',
    });
    expect(icon?.props).toMatchObject({
      color: 'textPrimary',
      name: 'edit',
      size: 24,
    });

    invoke(action.props.onPress);
    expect(onPress).toHaveBeenCalledOnce();
  });
});

function descendants(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [
    element,
    ...Children.toArray(element.props.children).flatMap(descendants),
  ];
}

function invoke(callback: unknown): void {
  expect(callback).toEqual(expect.any(Function));
  (callback as () => void)();
}

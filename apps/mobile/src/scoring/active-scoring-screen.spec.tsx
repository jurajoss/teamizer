import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  pressable: 'Pressable',
  view: 'View',
}));

vi.mock('react-native', () => ({
  Pressable: native.pressable,
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: native.view,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  borderWidths: { subtle: 1 },
  Button: 'Button',
  Card: 'Card',
  FeedbackBanner: 'FeedbackBanner',
  layout: { formMaxWidth: 460 },
  radii: { md: 14, pill: 999, sm: 10 },
  sizes: {
    compactControl: 36,
    icon: { medium: 20 },
    minimumTouchTarget: 48,
  },
  spacing: { lg: 20, md: 16, sm: 12, xs: 8, xxs: 4 },
  TeamTintAccent: 'TeamTintAccent',
  TeamTintBackground: 'TeamTintBackground',
  useResponsiveLayout: () => ({ isTablet: false }),
  useTheme: () => ({
    colors: {
      accentContrast: '#ffffff',
      background: '#000000',
      border: '#111111',
      borderDisabled: '#222222',
      disabledSurface: '#333333',
      surface: '#444444',
      surfaceSubtle: '#555555',
      teamABorder: '#666666',
      teamASurface: '#777777',
      teamAText: '#888888',
      teamBBorder: '#999999',
      teamBSurface: '#aaaaaa',
      teamBText: '#bbbbbb',
      textDisabled: '#cccccc',
      textSecondary: '#dddddd',
    },
  }),
}));

vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));

import { ScoringPlayerTile } from './active-scoring-screen';
import { ids } from './scoring-test-fixtures';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

const player = {
  id: ids.playerA,
  name: 'Radoslav Novotný',
  type: 'REGULAR' as const,
  status: 'ACTIVE' as const,
  avatarUrl: null,
};

describe('active scoring Player-tile responder structure', () => {
  it('owns increment at one outer Pressable and leaves passive areas to it', () => {
    const addGoal = vi.fn();
    const tile = scoringTile({ goals: 2, onAddGoal: addGoal });

    expect(tile.type).toBe(native.pressable);
    expect(tile.props.disabled).toBe(false);
    expect(tile.props.onStartShouldSetResponder).toBeUndefined();
    expect(tile.props.onResponderRelease).toBeUndefined();

    invoke(tile.props.onPress);
    expect(addGoal).toHaveBeenCalledExactlyOnceWith(player.id);

    const card = renderPressableChildren(tile, false);
    expect(card.type).toBe('Card');
    expect(card.props.pointerEvents).toBe('box-none');

    const elements = descendants(card);
    const name = elements.find(
      (element) =>
        element.type === 'AppText' && element.props.children === player.name,
    );
    const goalCount = elements.find(
      (element) => element.type === 'AppText' && element.props.children === 2,
    );
    const avatarWrapper = elements.find(
      (element) =>
        element.type === native.view &&
        directChildren(element).some((child) => child.type === 'Avatar'),
    );

    expect(name?.props.pointerEvents).toBe('none');
    expect(goalCount?.props.pointerEvents).toBe('none');
    expect(avatarWrapper?.props.pointerEvents).toBe('none');
    expect(
      elements
        .filter((element) => element.type === native.view)
        .every(({ props }) =>
          ['box-none', 'none'].includes(String(props.pointerEvents)),
        ),
    ).toBe(true);
  });

  it('keeps minus as the only nested Pressable and isolates its action', () => {
    const addGoal = vi.fn();
    const removeGoal = vi.fn();
    const tile = scoringTile({
      goals: 2,
      onAddGoal: addGoal,
      onRemoveGoal: removeGoal,
    });
    const card = renderPressableChildren(tile, false);
    const nestedPressables = descendants(card).filter(
      ({ type }) => type === native.pressable,
    );
    const event = { stopPropagation: vi.fn() };

    expect(nestedPressables).toHaveLength(1);
    invoke(nestedPressables[0]?.props.onPressIn, event);
    invoke(nestedPressables[0]?.props.onPress, event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
    expect(removeGoal).toHaveBeenCalledExactlyOnceWith(player.id);
    expect(addGoal).not.toHaveBeenCalled();
  });

  it('keeps the zero-goal minus responder active but action-disabled', () => {
    const addGoal = vi.fn();
    const removeGoal = vi.fn();
    const tile = scoringTile({
      goals: 0,
      onAddGoal: addGoal,
      onRemoveGoal: removeGoal,
    });
    const card = renderPressableChildren(tile, false);
    const minus = descendants(card).find(
      ({ type }) => type === native.pressable,
    );
    const event = { stopPropagation: vi.fn() };

    expect(minus?.props.accessibilityState).toEqual({ disabled: true });
    expect(minus?.props.disabled).toBeUndefined();
    invoke(minus?.props.onPress, event);

    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(removeGoal).not.toHaveBeenCalled();
    expect(addGoal).not.toHaveBeenCalled();
  });

  it('keeps the pressed-state layer decorative', () => {
    const card = renderPressableChildren(scoringTile({ goals: 1 }), true);
    const passiveOverlays = descendants(card).filter(
      ({ type, props }) =>
        type === native.view &&
        props.pointerEvents === 'none' &&
        props.importantForAccessibility === 'no-hide-descendants',
    );

    expect(passiveOverlays.length).toBeGreaterThanOrEqual(2);
  });
});

function scoringTile({
  goals,
  onAddGoal = vi.fn(),
  onRemoveGoal = vi.fn(),
}: {
  goals: number;
  onAddGoal?: (playerId: string) => void;
  onRemoveGoal?: (playerId: string) => void;
}): TestElement {
  return ScoringPlayerTile({
    disabled: false,
    goals,
    onAddGoal,
    onRemoveGoal,
    player,
    side: 'A',
  }) as TestElement;
}

function renderPressableChildren(
  element: TestElement,
  pressed: boolean,
): TestElement {
  const render = element.props.children as unknown as (state: {
    pressed: boolean;
  }) => TestElement;

  return render({ pressed });
}

function descendants(element: TestElement): TestElement[] {
  return directChildren(element).flatMap((child) => [
    child,
    ...descendants(child),
  ]);
}

function directChildren(element: TestElement): TestElement[] {
  return Children.toArray(element.props.children).filter(
    (child): child is TestElement => isValidElement(child),
  );
}

function invoke(callback: unknown, ...args: unknown[]): void {
  expect(callback).toEqual(expect.any(Function));
  (callback as (...values: unknown[]) => void)(...args);
}

import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: { create: <T>(styles: T) => styles },
  View: 'View',
}));

vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  borderWidths: { emphasized: 2 },
  radii: { pill: 999 },
  sizes: { avatar: { small: 32 } },
  spacing: { sm: 12 },
  useTheme: () => ({ colors: {} }),
}));

import {
  PlayerAvatarStack,
  playerAvatarStackCounts,
} from './player-avatar-stack';

describe('Player avatar stack', () => {
  it('reports no overflow below or at the limit and exact overflow above it', () => {
    expect(playerAvatarStackCounts(2, 3)).toEqual({ hidden: 0, visible: 2 });
    expect(playerAvatarStackCounts(3, 3)).toEqual({ hidden: 0, visible: 3 });
    expect(playerAvatarStackCounts(6, 3)).toEqual({ hidden: 3, visible: 3 });
    expect(playerAvatarStackCounts(0, 3)).toEqual({ hidden: 0, visible: 0 });
  });

  it('renders the compact +N overflow without fabricating players', () => {
    const stack = PlayerAvatarStack({
      maxVisible: 3,
      players: Array.from({ length: 6 }, (_, index) => ({
        avatarUrl: null,
        id: String(index),
        name: `Player ${index}`,
      })),
    }) as ReactElement<{ children: ReactNode }>;
    const text = descendants(stack).find(({ type }) => type === 'AppText');

    expect(Children.toArray(text?.props.children).join('')).toBe('+3');
  });
});

function descendants(
  element: ReactElement<{ children?: ReactNode }>,
): Array<ReactElement<{ children?: ReactNode }>> {
  const children = Children.toArray(element.props.children).filter(
    isValidElement,
  ) as Array<ReactElement<{ children?: ReactNode }>>;
  return [element, ...children.flatMap(descendants)];
}

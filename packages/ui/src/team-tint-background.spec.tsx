import { Children, isValidElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
}));

vi.mock('./theme-provider', () => ({
  useTheme: () => ({
    colors: {
      teamABorder: '#111111',
      teamAText: '#222222',
      teamBBorder: '#333333',
      teamBText: '#444444',
    },
    teamSurfaceTints: {
      teamA: {
        subtle: {
          colorStops: [
            { color: '#111111', position: '0%' },
            { color: '#222222', position: '100%' },
          ],
          direction: 'to right',
        },
      },
      teamB: {
        subtle: {
          colorStops: [
            { color: '#333333', position: '0%' },
            { color: '#444444', position: '100%' },
          ],
          direction: 'to right',
        },
      },
    },
  }),
}));

import { TeamTintAccent, TeamTintBackground } from './team-tint-background';

type TestElement = ReactElement<{
  children?: React.ReactNode;
  pointerEvents?: string;
}>;

describe('team tint hit-test behavior', () => {
  it('keeps the gradient background outside hit testing', () => {
    const background = TeamTintBackground({
      emphasis: 'subtle',
      side: 'A',
    }) as TestElement;

    expect(background.props.pointerEvents).toBe('none');
  });

  it.each(['left', 'right'] as const)(
    'keeps the %s accent and its strip outside hit testing',
    (edge) => {
      const accent = TeamTintAccent({
        edge,
        radius: 10,
        side: edge === 'left' ? 'A' : 'B',
        tone: 'strong',
      }) as TestElement;
      const strip = Children.toArray(accent.props.children).find((child) =>
        isValidElement(child),
      ) as TestElement | undefined;

      expect(accent.props.pointerEvents).toBe('none');
      expect(strip).toBeDefined();
    },
  );
});

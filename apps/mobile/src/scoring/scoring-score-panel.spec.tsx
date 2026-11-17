import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Readonly<Record<string, unknown>>) =>
      key === 'common.team' ? `Team ${String(options?.side)}` : key,
  }),
}));

vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  borderWidths: { subtle: 1 },
  radii: { md: 14 },
  spacing: { sm: 12, xxs: 4 },
  TeamTintAccent: 'TeamTintAccent',
  TeamTintBackground: 'TeamTintBackground',
  useTheme: () => ({
    colors: {
      teamABorder: 'teamABorder',
      teamASurface: 'teamASurface',
      teamAText: 'teamAText',
      teamBBorder: 'teamBBorder',
      teamBSurface: 'teamBSurface',
      teamBText: 'teamBText',
    },
  }),
}));

import { ScoringScorePanel } from './scoring-score-panel';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('shared scoring score panel', () => {
  it('renders the live Team A panel language', () => {
    const panel = ScoringScorePanel({ score: 5, side: 'A' }) as TestElement;
    const [tint, accent, score] = directChildren(panel);

    expect(resolveStyle(panel)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minHeight: 64 }),
        expect.objectContaining({
          backgroundColor: 'teamASurface',
          borderColor: 'teamABorder',
        }),
      ]),
    );
    expect(tint?.props).toMatchObject({
      direction: 'to right',
      emphasis: 'prominent',
      side: 'A',
    });
    expect(accent?.props).toMatchObject({
      edge: 'left',
      radius: 14,
      side: 'A',
      tone: 'subdued',
    });
    expect(score?.props).toMatchObject({
      accessibilityLabel: 'Team A, 5',
      children: 5,
      style: { color: 'teamAText' },
      variant: 'scoreCompact',
    });
  });

  it('preserves the mirrored Team B treatment and live score sizing', () => {
    const panel = ScoringScorePanel({ score: 3, side: 'B' }) as TestElement;
    const [tint, accent, score] = directChildren(panel);

    expect(resolveStyle(panel)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ minHeight: 64 }),
        expect.objectContaining({
          backgroundColor: 'teamBSurface',
          borderColor: 'teamBBorder',
        }),
      ]),
    );
    expect(tint?.props.direction).toBe('to left');
    expect(accent?.props.edge).toBe('right');
    expect(score?.props).toMatchObject({
      accessibilityLabel: 'Team B, 3',
      children: 3,
      style: { color: 'teamBText' },
      variant: 'scoreCompact',
    });
  });
});

function directChildren(element: TestElement): TestElement[] {
  return Children.toArray(element.props.children).filter(
    (child): child is TestElement => isValidElement(child),
  );
}

function resolveStyle(element: TestElement): unknown[] {
  return (
    Array.isArray(element.props.style)
      ? element.props.style
      : [element.props.style]
  ).filter(Boolean);
}

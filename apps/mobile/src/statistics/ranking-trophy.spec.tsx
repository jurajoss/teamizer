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
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Path: 'Path',
  Text: 'SvgText',
}));
vi.mock('@teamizer/ui', () => ({ sizes: { icon: { large: 24 } } }));

import { RankingTrophy } from './ranking-trophy';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('Ranking trophy', () => {
  it.each([1, 2, 3] as const)(
    'centers rank %s inside the vector trophy silhouette',
    (rank) => {
      const trophy = RankingTrophy({
        color: 'medal',
        numberColor: 'number',
        rank,
      }) as TestElement;
      const svg = descendants(trophy).find(({ type }) => type === 'Svg');
      const number = descendants(trophy).find(({ type }) => type === 'SvgText');

      expect(svg?.props).toMatchObject({
        height: 24,
        viewBox: '0 0 24 24',
        width: 24,
      });
      expect(number?.props).toMatchObject({
        alignmentBaseline: 'central',
        fill: 'number',
        textAnchor: 'middle',
        x: 12,
      });
      expect(number?.props.children).toBe(rank);
      expect(trophy.props.pointerEvents).toBe('none');
    },
  );
});

function descendants(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  return [
    element,
    ...Children.toArray(element.props.children).flatMap(descendants),
  ];
}

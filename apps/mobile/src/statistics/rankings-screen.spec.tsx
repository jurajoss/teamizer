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

vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'common.guest') return 'Guest';
      if (key === 'ranking.participationSummary') {
        return `${String(values?.played)} of ${String(values?.total)}`;
      }
      if (key === 'ranking.winRateSummary') {
        return `Wins: ${String(values?.wins)}, draws: ${String(values?.draws)}, losses: ${String(values?.losses)}`;
      }
      return key;
    },
  }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  borderWidths: { subtle: 1 },
  Button: 'Button',
  FeedbackBanner: 'FeedbackBanner',
  radii: { md: 14, sm: 10 },
  sizes: {
    icon: { medium: 20, small: 16 },
    minimumTouchTarget: 48,
  },
  spacing: {
    jumbo: 48,
    lg: 20,
    md: 16,
    sm: 12,
    xxxl: 40,
    xs: 8,
    xxs: 4,
  },
  useTheme: () => ({
    mode: 'dark',
    colors: {
      accent: 'accent',
      accentContrast: 'accentContrast',
      background: 'background',
      border: 'border',
      surface: 'surface',
      surfaceElevated: 'surfaceElevated',
      surfaceStrong: 'surfaceStrong',
      surfaceSubtle: 'surfaceSubtle',
      textPrimary: 'textPrimary',
      textSecondary: 'textSecondary',
      medalGold: 'medalGold',
      medalSilver: 'medalSilver',
      medalBronze: 'medalBronze',
      medalNumber: 'medalNumber',
    },
  }),
}));
vi.mock('../matches/match-list-row', () => ({
  FinishedMatchResultIndicator: 'FinishedMatchResultIndicator',
}));
vi.mock('../preferences/preferences-context', () => ({
  usePreferences: () => ({ language: 'en' }),
}));
vi.mock('../providers/app-services-context', () => ({
  useAppServices: vi.fn(),
}));
vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('./ranking-trophy', () => ({ RankingTrophy: 'RankingTrophy' }));

import type { RankingRow } from '../api/contracts';
import { SegmentedControl } from '../ui/segmented-control';
import {
  RankingCriterionControl,
  RankingIndicator,
  RankingListRow,
  RankingWinRateBreakdown,
} from './rankings-screen';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('Rankings presentation', () => {
  it('offers exactly the three approved criteria', () => {
    const onChange = vi.fn();
    const control = RankingCriterionControl({
      criterion: 'winRate',
      onChange,
    }) as TestElement;
    expect(control.type).toBe(SegmentedControl);
    expect(control.props.shrinkLabelsToFit).toBe(false);
    const renderedControl = SegmentedControl(
      control.props as Parameters<typeof SegmentedControl>[0],
    ) as TestElement;
    const tabs = descendants(renderedControl).filter(
      ({ type }) => type === native.pressable,
    );
    const labels = descendants(renderedControl).filter(
      ({ type }) => type === 'AppText',
    );

    expect(tabs.map(({ props }) => props.accessibilityState)).toEqual([
      { selected: true },
      { selected: false },
      { selected: false },
    ]);
    labels.forEach(({ props }) => {
      expect(props).toMatchObject({ numberOfLines: 1, variant: 'label' });
      expect(props).not.toHaveProperty('adjustsFontSizeToFit');
      expect(props).not.toHaveProperty('minimumFontScale');
    });
    tabs.forEach(({ props }) => invoke(props.onPress));
    expect(onChange.mock.calls.map(([criterion]) => criterion)).toEqual([
      'winRate',
      'goalsPerMatch',
      'participation',
    ]);
  });

  it.each([
    ['winRate', '50 %'],
    ['goalsPerMatch', '2.00'],
    ['participation', '50 %'],
  ] as const)('renders only the selected %s statistic', (criterion, value) => {
    const row = rankingRow();
    const item = RankingListRow({
      criterion,
      language: 'en',
      onOpen: vi.fn(),
      row,
    }) as TestElement;
    const text = textValues(item);

    expect(text).toContain(value);
    expect(text.filter((item) => item === value)).toHaveLength(1);
    expect(text).not.toContain(4);
    if (criterion !== 'goalsPerMatch') expect(text).not.toContain('2.00');
    expect(text).not.toContain('2 matches');
  });

  it('shows attendance percentage with right-aligned played/total context', () => {
    const item = RankingListRow({
      criterion: 'participation',
      language: 'en',
      onOpen: vi.fn(),
      row: rankingRow(),
    }) as TestElement;
    const statisticGroup = descendants(item).find(
      (element) =>
        element.type === native.view &&
        textValues(element).includes('50 %') &&
        textValues(element).includes('2 of 4'),
    );

    expect(textValues(item)).toEqual(
      expect.arrayContaining(['50 %', '2 of 4']),
    );
    expect(statisticGroup?.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ alignItems: 'flex-end' }),
      ]),
    );
    expect(item.props.accessibilityLabel).toContain('50 %, 2 of 4');
  });

  it('shows the complete W/D/L breakdown below win rate using shared result indicators', () => {
    const item = RankingListRow({
      criterion: 'winRate',
      language: 'en',
      onOpen: vi.fn(),
      row: rankingRow(),
    }) as TestElement;
    const breakdown = descendants(item).find(
      ({ type }) => type === RankingWinRateBreakdown,
    );
    const renderedBreakdown = RankingWinRateBreakdown({
      draws: 0,
      losses: 5,
      wins: 12,
    }) as TestElement;
    const indicators = descendants(renderedBreakdown).filter(
      ({ type }) => type === 'FinishedMatchResultIndicator',
    );

    expect(breakdown?.props).toMatchObject({ draws: 0, losses: 1, wins: 1 });
    expect(indicators.map(({ props }) => props)).toEqual([
      { result: 'WIN', size: 'dense' },
      { result: 'DRAW', size: 'dense' },
      { result: 'LOSS', size: 'dense' },
    ]);
    expect(textValues(renderedBreakdown)).toEqual([12, 0, 5]);
    expect(renderedBreakdown.props.style).toEqual(
      expect.objectContaining({
        alignItems: 'center',
        flexDirection: 'row',
        gap: 4,
        justifyContent: 'flex-end',
      }),
    );
    const resultGroups = Children.toArray(
      renderedBreakdown.props.children,
    ).filter(isValidElement) as TestElement[];
    expect(resultGroups).toHaveLength(3);
    resultGroups.forEach((group) => {
      expect(group.props.style).toEqual(expect.objectContaining({ gap: 2 }));
    });
    const counts = descendants(renderedBreakdown).filter(
      ({ type }) => type === 'AppText',
    );
    counts.forEach(({ props }) => {
      expect(props).toMatchObject({ tone: 'muted', variant: 'caption' });
      expect(props.style).toEqual(
        expect.objectContaining({ fontVariant: ['tabular-nums'] }),
      );
    });
    expect(item.props.accessibilityLabel).toContain(
      'Wins: 1, draws: 0, losses: 1',
    );
  });

  it('keeps all zero and large W/D/L counts visible', () => {
    const zero = RankingWinRateBreakdown({
      draws: 0,
      losses: 0,
      wins: 0,
    }) as TestElement;
    const large = RankingWinRateBreakdown({
      draws: 100,
      losses: 345,
      wins: 99,
    }) as TestElement;

    expect(textValues(zero)).toEqual([0, 0, 0]);
    expect(textValues(large)).toEqual([99, 100, 345]);
  });

  it('does not add a W/D/L breakdown to other criteria', () => {
    for (const criterion of ['goalsPerMatch', 'participation'] as const) {
      const item = RankingListRow({
        criterion,
        language: 'en',
        onOpen: vi.fn(),
        row: rankingRow(),
      }) as TestElement;

      expect(
        descendants(item).some(({ type }) => type === RankingWinRateBreakdown),
      ).toBe(false);
    }
  });

  it('keeps guests identifiable and routes the complete compact row', () => {
    const onOpen = vi.fn();
    const item = RankingListRow({
      criterion: 'winRate',
      language: 'en',
      onOpen,
      row: rankingRow('GUEST'),
    }) as TestElement;

    expect(textValues(item)).toContain('Guest');
    expect(textValues(item)).not.toContain('GUEST');
    invoke(item.props.onPress);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(item.props.accessibilityRole).toBe('button');
  });

  it.each(['winRate', 'goalsPerMatch', 'participation'] as const)(
    'opens Player statistics from the %s ranking',
    (criterion) => {
      const onOpen = vi.fn();
      const item = RankingListRow({
        criterion,
        language: 'en',
        onOpen,
        row: rankingRow(),
      }) as TestElement;

      invoke(item.props.onPress);
      expect(onOpen).toHaveBeenCalledOnce();
    },
  );

  it('preserves the accepted row and chevron geometry', () => {
    const item = RankingListRow({
      criterion: 'winRate',
      language: 'en',
      onOpen: vi.fn(),
      row: rankingRow(),
    }) as TestElement;
    const style = invokeStyle(item.props.style);
    const chevron = descendants(item).find(
      ({ type, props }) => type === 'AppIcon' && props.name === 'next',
    );

    expect(style[0]).toMatchObject({ minHeight: 64, paddingVertical: 8 });
    expect(chevron?.props).toMatchObject({
      color: 'textSecondary',
      name: 'next',
      size: 20,
    });
  });

  it('assigns trophies only to the current top three ranks', () => {
    const medals = [
      [1, 'medalGold'],
      [2, 'medalSilver'],
      [3, 'medalBronze'],
    ] as const;
    for (const [rank, color] of medals) {
      const rendered = RankingIndicator({ rank }) as TestElement;
      const trophy = descendants(rendered).find(
        ({ type }) => type === 'RankingTrophy',
      );

      expect(trophy?.props).toMatchObject({
        color,
        numberColor: 'medalNumber',
        rank,
      });
      expect(textValues(rendered)).not.toContain(rank);
    }

    const fourth = RankingIndicator({ rank: 4 }) as TestElement;
    expect(
      descendants(fourth).some(({ type }) => type === 'RankingTrophy'),
    ).toBe(false);
    expect(textValues(fourth)).toContain(4);
  });
});

function rankingRow(type: 'REGULAR' | 'GUEST' = 'REGULAR'): RankingRow {
  return {
    player: {
      avatarUrl: null,
      id: 'player-id',
      name: 'Ada',
      status: 'ACTIVE',
      type,
    },
    rank: 1,
    statistics: {
      draws: 0,
      goals: 4,
      goalsPerMatch: 2,
      losses: 1,
      matches: 2,
      winRate: 0.5,
      wins: 1,
      attendance: {
        playedMatches: 2,
        totalMatches: 4,
        percentage: 50,
      },
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

function textValues(node: ReactNode): Array<string | number> {
  if (typeof node === 'string' || typeof node === 'number') return [node];
  if (!isValidElement(node)) return [];
  return Children.toArray((node as TestElement).props.children).flatMap(
    textValues,
  );
}

function invoke(value: unknown) {
  if (typeof value === 'function') value();
}

function invokeStyle(value: unknown): unknown[] {
  if (typeof value !== 'function') return [];
  const result = value({ pressed: false });
  return Array.isArray(result) ? result : [result];
}

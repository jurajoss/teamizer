import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const queryMocks = vi.hoisted(() => ({ responses: [] as unknown[] }));
const routeMocks = vi.hoisted(() => ({
  dismissTo: vi.fn(),
  parameters: {} as { playerId?: string },
  push: vi.fn(),
}));
const sessionMock = vi.hoisted(() => ({
  playerId: '00000000-0000-4000-8000-000000000001',
  role: 'PLAYER' as 'PLAYER' | 'ADMIN',
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => queryMocks.responses.shift()),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
}));
vi.mock('expo-router', () => ({
  router: { dismissTo: routeMocks.dismissTo, push: routeMocks.push },
  Stack: { Screen: 'Stack.Screen' },
  useLocalSearchParams: () => routeMocks.parameters,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (values?.count !== undefined) {
        return `${key}:${String(values.count)}`;
      }
      if (key === 'playerDetail.recentWinsValue') {
        return `${String(values?.wins)} z ${String(values?.matches)}`;
      }
      if (key === 'playerDetail.recentWinsAccessibility') {
        return `${key}:${String(values?.wins)}/${String(values?.matches)}:${String(values?.results)}`;
      }
      if (key === 'playerDetail.attendanceSummary') {
        return `${String(values?.attended)} z ${String(values?.eligible)} zápasů`;
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
  Card: 'Card',
  FeedbackBanner: 'FeedbackBanner',
  radii: { pill: 999, sm: 8 },
  sizes: { icon: { large: 24, medium: 20 }, minimumTouchTarget: 48 },
  spacing: { lg: 20, md: 16, sm: 12, xs: 8, xxs: 4 },
  useResponsiveLayout: () => ({ mode: 'phone', width: 360 }),
  useTheme: () => ({
    colors: {
      accent: 'accent',
      border: 'border',
      danger: 'danger',
      success: 'success',
      surfaceStrong: 'surfaceStrong',
      textSecondary: 'textSecondary',
    },
  }),
}));
vi.mock('../matches/match-list-row', () => ({
  FinishedMatchResultIndicator: 'FinishedMatchResultIndicator',
}));
vi.mock('../navigation/account-menu', () => ({
  AccountAvatarButton: 'AccountAvatarButton',
}));
vi.mock('../navigation/header-controls', () => ({
  HeaderIconAction: 'HeaderIconAction',
}));
vi.mock('../preferences/preferences-context', () => ({
  usePreferences: () => ({ language: 'cs' }),
}));
vi.mock('../providers/app-services-context', () => ({
  useAppServices: () => ({ apiClient: {} }),
}));
vi.mock('../session/session-context', () => ({
  useSession: () => ({
    state: {
      status: 'AUTHENTICATED',
      currentUser: {
        player: {
          avatarUrl: null,
          id: sessionMock.playerId,
          name: 'Current Player',
          status: 'ACTIVE',
          type: 'REGULAR',
        },
        user: {
          createdAt: '2026-01-01T00:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000099',
          notificationsEnabled: true,
          role: sessionMock.role,
        },
      },
    },
  }),
}));
vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('./goal-history-chart', () => ({
  GoalHistoryChart: 'GoalHistoryChart',
}));
vi.mock('./player-history-match-row', () => ({
  PlayerHistoryMatchRow: 'PlayerHistoryMatchRow',
}));

import type { PlayerDetail, PlayerMatchHistoryItem } from '../api/contracts';
import {
  GoalsCard,
  PlayerProfile,
  PlayerProfileHeaderActions,
  PlayerStatisticsContent,
  PlayerStatisticsScreen,
  RecentWinsCard,
  StatisticsGrid,
} from './player-statistics-screen';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('Player statistics detail presentation', () => {
  it('shows the shared edit entry to the owner and routes to that profile editor', () => {
    const player = detail();
    sessionMock.role = 'PLAYER';
    sessionMock.playerId = player.id;
    routeMocks.parameters = { playerId: player.id };
    routeMocks.push.mockClear();
    queryMocks.responses = [settledQuery(player), settledQuery({ items: [] })];

    const screen = PlayerStatisticsScreen() as TestElement;

    invoke(screen.props.onEdit);
    expect(routeMocks.push).toHaveBeenCalledExactlyOnceWith(
      `/players/${player.id}/edit`,
    );
  });

  it('hides edit from another regular Player and exposes it to an administrator', () => {
    const player = detail();
    sessionMock.playerId = '00000000-0000-4000-8000-000000000098';
    routeMocks.parameters = { playerId: player.id };
    sessionMock.role = 'PLAYER';
    queryMocks.responses = [settledQuery(player), settledQuery({ items: [] })];
    const regularView = PlayerStatisticsScreen() as TestElement;

    sessionMock.role = 'ADMIN';
    queryMocks.responses = [settledQuery(player), settledQuery({ items: [] })];
    const adminView = PlayerStatisticsScreen() as TestElement;

    expect(regularView.props.onEdit).toBeUndefined();
    expect(adminView.props.onEdit).toEqual(expect.any(Function));
  });

  it('places only the permission-aware edit action in the nested header', () => {
    const onEdit = vi.fn();
    const editable = PlayerProfileHeaderActions({ onEdit }) as TestElement;
    const readOnly = PlayerProfileHeaderActions({});

    expect(editable.type).toBe('HeaderIconAction');
    expect(editable.props).toMatchObject({
      icon: 'edit',
      label: 'profile.edit',
    });
    expect(readOnly).toBeNull();

    invoke(editable.props.onPress);
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('routes the recent-history header to the canonical unfiltered Matches tab', () => {
    routeMocks.dismissTo.mockClear();
    routeMocks.push.mockClear();
    routeMocks.parameters = { playerId: detail().id };
    queryMocks.responses = [
      {
        data: detail(),
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      },
      {
        data: { items: [] },
        isError: false,
        isPending: false,
        refetch: vi.fn(),
      },
    ];

    const screen = PlayerStatisticsScreen() as TestElement;

    expect(screen.type).toBe(PlayerStatisticsContent);
    invoke(screen.props.onOpenHistory);
    expect(routeMocks.dismissTo).toHaveBeenCalledExactlyOnceWith('/matches');
    expect(routeMocks.push).not.toHaveBeenCalled();
  });

  it('renders the selected guest identity and real finished-match count', () => {
    const profile = PlayerProfile({ player: detail('GUEST') }) as TestElement;
    const avatar = descendants(profile).find(({ type }) => type === 'Avatar');

    expect(avatar?.props).toMatchObject({
      name: 'Jura',
      size: 'hero',
      url: 'https://example.test/jura.jpg',
    });
    expect(textValues(profile)).toEqual(
      expect.arrayContaining([
        'Jura',
        'playerDetail.playedMatches:17',
        'common.guest',
      ]),
    );
    expect(
      descendants(profile).some(
        ({ props, type }) =>
          type === 'Pressable' && props.accessibilityLabel === 'profile.edit',
      ),
    ).toBe(false);
  });

  it('renders real API attendance counts, percentage, and progress', () => {
    const grid = statisticsGrid(detail());
    const resultCounts = descendants(grid)
      .map(({ props }) => props.count)
      .filter((value) => typeof value === 'number');
    const goalsCard = descendants(grid).find(({ type }) => type === GoalsCard);
    const formCard = descendants(grid).find(
      ({ type }) => type === RecentWinsCard,
    );

    expect(textValues(grid)).toContain('68,8 %');
    expect(goalsCard?.props).toMatchObject({
      goalsPerMatch: '5,53',
      totalGoals: '111',
    });
    expect(formCard?.props).toMatchObject({
      error: false,
      form: { results: [], wins: 0 },
      loading: false,
    });
    expect(resultCounts).toEqual(expect.arrayContaining([11, 2, 5]));
    expect(textValues(grid)).toContain('85 %');
    expect(textValues(grid)).toContain('17 z 20 zápasů');
    const progressValues = descendants(grid)
      .filter(
        ({ type }) => typeof type === 'function' && type.name === 'ProgressBar',
      )
      .map(({ props }) => props.value);
    expect(progressValues).toEqual([0.688, 0.85]);
  });

  it('handles nullable rate fields without inventing values', () => {
    const player = detail();
    player.statistics.winRate = null;
    player.statistics.goalsPerMatch = null;
    player.statistics.attendance = {
      playedMatches: 0,
      totalMatches: 0,
      percentage: null,
    };
    const grid = statisticsGrid(player);
    const goalsCard = descendants(grid).find(({ type }) => type === GoalsCard);

    expect(textValues(grid)).toContain('—');
    expect(textValues(grid)).toContain('0 z 0 zápasů');
    expect(goalsCard?.props.goalsPerMatch).toBe('N/A');
  });

  it('stacks per-match goals before total goals without the old divider', () => {
    const card = GoalsCard({
      goalsPerMatch: '5,53',
      totalGoals: '111',
    }) as TestElement;
    const title = directChildren(card)[0];
    const metrics = directChildren(card)[1];
    const metricRows = metrics ? directChildren(metrics) : [];
    const divider = descendants(card).find(
      ({ props, type }) => type === 'View' && props.pointerEvents === 'none',
    );

    expect(title?.props).toMatchObject({
      icon: 'football',
      title: 'common.goals',
    });
    expect(textValues(card)).toEqual([
      '5,53',
      'playerDetail.goalsPerMatchShort',
      '111',
      'playerDetail.goalsTotal',
    ]);
    expect(metricRows).toHaveLength(2);
    expect(divider).toBeUndefined();
  });

  it('uses aligned shrinkable value and label columns on narrow cards', () => {
    const card = GoalsCard({
      goalsPerMatch: '6,17',
      totalGoals: '37',
    }) as TestElement;
    const metrics = directChildren(card)[1];
    const metricRows = metrics ? directChildren(metrics) : [];

    expect(metrics?.props.style).toEqual(
      expect.objectContaining({
        flex: 1,
        gap: 8,
        justifyContent: 'space-between',
      }),
    );
    for (const row of metricRows) {
      const [value, label] = directChildren(row);
      expect(row.props.style).toEqual(
        expect.objectContaining({
          alignItems: 'center',
          flexDirection: 'row',
          gap: 4,
        }),
      );
      expect(value?.props).toMatchObject({
        adjustsFontSizeToFit: true,
        minimumFontScale: 0.85,
        numberOfLines: 1,
        style: { flex: 1, minWidth: 0 },
        variant: 'metric',
      });
      expect(label?.props).toMatchObject({
        adjustsFontSizeToFit: true,
        minimumFontScale: 0.85,
        numberOfLines: 1,
        style: { flex: 1, minWidth: 0 },
        tone: 'muted',
        variant: 'caption',
      });
    }
  });

  it('orders Wins before Goals and keeps both second-row cards equal-height', () => {
    const goals = GoalsCard({
      goalsPerMatch: '5,53',
      totalGoals: '111',
    }) as TestElement;
    const wins = RecentWinsCard({
      error: false,
      form: { results: ['WIN'], wins: 1 },
      loading: false,
    }) as TestElement;
    const grid = statisticsGrid(detail());
    const secondRow = directChildren(grid)[1];
    const secondRowCards = secondRow ? directChildren(secondRow) : [];

    expect(secondRowCards.map(({ type }) => type)).toEqual([
      RecentWinsCard,
      GoalsCard,
    ]);
    expect(goals.props.style).toBe(wins.props.style);
    expect(goals.props.style).toEqual(
      expect.objectContaining({ flex: 1, minHeight: 108 }),
    );
    expect(secondRow?.props.style).toEqual(
      expect.objectContaining({ alignItems: 'stretch' }),
    );
  });

  it('renders the Wins title, history icon, ratio, and chronological result segments', () => {
    const card = RecentWinsCard({
      error: false,
      form: {
        results: ['WIN', 'DRAW', 'LOSS', 'WIN', 'WIN'],
        wins: 3,
      },
      loading: false,
    }) as TestElement;
    const title = descendants(card).find(
      ({ props }) => props.icon === 'history',
    );
    const segments = resultSegments(card);
    const formContent = descendants(card).find((element) =>
      directChildren(element).some((child) =>
        directChildren(child).some(isResultSegment),
      ),
    );
    const formCopy = formContent && directChildren(formContent)[0];

    expect(title?.props.title).toBe('common.wins');
    expect(textValues(card)).toEqual(
      expect.arrayContaining(['3 z 5', 'playerDetail.recentWinsMatches:5']),
    );
    const primaryValue = descendants(card).find(
      ({ props, type }) => type === 'AppText' && props.children === '3 z 5',
    );
    expect(primaryValue?.props).toMatchObject({
      adjustsFontSizeToFit: true,
      numberOfLines: 1,
      variant: 'metric',
    });
    expect(
      segments.map(
        ({ props }) =>
          (props.style as Array<{ backgroundColor?: string }>)[1]
            ?.backgroundColor,
      ),
    ).toEqual(['success', 'textSecondary', 'danger', 'success', 'success']);
    expect(formContent?.props.style).toEqual(
      expect.objectContaining({ gap: 12, justifyContent: 'flex-end' }),
    );
    expect(formCopy?.props.style).toEqual(expect.objectContaining({ gap: 4 }));
    expect(card.props).toMatchObject({
      accessible: true,
      accessibilityLabel:
        'playerDetail.recentWinsAccessibility:3/5:matchesIndex.win, matchesIndex.draw, matchesIndex.loss, matchesIndex.win, matchesIndex.win',
    });
    const hiddenContent = directChildren(card)[0];
    expect(hiddenContent?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(
      descendants(hiddenContent).some(({ props }) => props.accessible === true),
    ).toBe(false);
  });

  it('renders fewer actual result segments and a meaningful zero-match state', () => {
    const partial = RecentWinsCard({
      error: false,
      form: { results: ['LOSS', 'DRAW', 'WIN'], wins: 1 },
      loading: false,
    }) as TestElement;
    const empty = RecentWinsCard({
      error: false,
      form: { results: [], wins: 0 },
      loading: false,
    }) as TestElement;

    expect(resultSegments(partial)).toHaveLength(3);
    expect(textValues(partial)).toEqual(
      expect.arrayContaining(['1 z 3', 'playerDetail.recentWinsMatches:3']),
    );
    expect(textValues(empty)).toContain('playerDetail.recentWinsEmpty');
    expect(resultSegments(empty)).toHaveLength(0);
    expect(empty.props.accessibilityLabel).toBe(
      'common.wins. playerDetail.recentWinsEmpty',
    );
  });

  it('renders chronological chart data and only the five newest recent rows', () => {
    const history = [1, 6, 3, 2, 5, 4].map(historyItem);
    const onOpenMatch = vi.fn();
    const content = PlayerStatisticsContent({
      history,
      historyError: false,
      historyLoading: false,
      player: detail(),
      onOpenHistory: vi.fn(),
      onOpenMatch,
      onRetryHistory: vi.fn(),
    }) as TestElement;
    const chart = descendants(content).find(
      ({ type }) => type === 'GoalHistoryChart',
    );
    const chartTitle = descendants(content).find(
      ({ props }) => props.title === 'playerDetail.goalsChartTitle',
    );
    const rows = descendants(content).filter(
      ({ type }) => type === 'PlayerHistoryMatchRow',
    );

    expect(
      (chart?.props.points as Array<{ goals: number }>).map(
        ({ goals }) => goals,
      ),
    ).toEqual([1, 2, 3, 4, 5, 6]);
    expect(chartTitle?.props).toMatchObject({
      icon: 'rankings',
      title: 'playerDetail.goalsChartTitle',
    });
    expect(
      rows.map(
        ({ props }) => (props.match as PlayerMatchHistoryItem).subjectGoals,
      ),
    ).toEqual([6, 5, 4, 3, 2]);
    invoke(rows[0]?.props.onOpen);
    expect(onOpenMatch).toHaveBeenCalledExactlyOnceWith(historyItem(6).id);
  });

  it('uses one top-aligned recent-history header target without visible view-all text', () => {
    const onOpenHistory = vi.fn();
    const content = PlayerStatisticsContent({
      history: [historyItem(1)],
      historyError: false,
      historyLoading: false,
      player: detail(),
      onOpenHistory,
      onOpenMatch: vi.fn(),
      onRetryHistory: vi.fn(),
    }) as TestElement;
    const historyHeader = descendants(content).find(
      ({ props, type }) =>
        type === 'Pressable' &&
        props.accessibilityLabel === 'playerDetail.openHistory',
    );
    const headerContent = historyHeader && directChildren(historyHeader)[0];
    const titleGroup = headerContent && directChildren(headerContent)[0];
    const title = titleGroup && directChildren(titleGroup)[0];
    const chevron = headerContent
      ? descendants(headerContent).find(
          ({ props, type }) => type === 'AppIcon' && props.name === 'next',
        )
      : undefined;
    const historyCard = descendants(content).find(
      (element) =>
        element.type === 'Card' &&
        directChildren(element).some(
          ({ props, type }) =>
            type === 'Pressable' &&
            props.accessibilityLabel === 'playerDetail.openHistory',
        ),
    );

    expect(historyHeader?.props).toMatchObject({
      accessibilityRole: 'button',
      onPress: onOpenHistory,
    });
    const headerStyles = (
      historyHeader?.props.style as (state: { pressed: boolean }) => unknown[]
    )({ pressed: false });
    expect(headerStyles[0]).toEqual(expect.objectContaining({ minHeight: 48 }));
    expect(historyCard?.props.style).toEqual(
      expect.objectContaining({ gap: 0 }),
    );
    expect(headerContent?.props).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
      pointerEvents: 'none',
      style: expect.objectContaining({ alignItems: 'flex-start' }),
    });
    expect(title?.props).toMatchObject({
      icon: 'matches',
      title: 'playerDetail.recentTitle',
    });
    expect(chevron).toBeDefined();
    expect(textValues(content)).not.toContain('playerDetail.viewAll');
    expect(textValues(content)).not.toContain('playerDetail.openHistory');
    invoke(historyHeader?.props.onPress);
    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it('shows safe empty history states without fabricating chart or match data', () => {
    const content = PlayerStatisticsContent({
      history: [],
      historyError: false,
      historyLoading: false,
      player: detail(),
      onOpenHistory: vi.fn(),
      onOpenMatch: vi.fn(),
      onRetryHistory: vi.fn(),
    }) as TestElement;

    expect(textValues(content)).toEqual(
      expect.arrayContaining([
        'playerDetail.noGoalHistory',
        'playerDetail.noHistory',
      ]),
    );
    expect(
      descendants(content).some(({ type }) => type === 'GoalHistoryChart'),
    ).toBe(false);
    expect(
      descendants(content).some(({ type }) => type === 'PlayerHistoryMatchRow'),
    ).toBe(false);
  });
});

function detail(type: 'GUEST' | 'REGULAR' = 'REGULAR'): PlayerDetail {
  return {
    avatarUrl: 'https://example.test/jura.jpg',
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Jura',
    status: 'ACTIVE',
    type,
    statistics: {
      draws: 2,
      goals: 111,
      goalsPerMatch: 5.53,
      losses: 5,
      matches: 17,
      winRate: 0.688,
      wins: 11,
      attendance: {
        playedMatches: 17,
        totalMatches: 20,
        percentage: 85,
      },
    },
  };
}

function statisticsGrid(player: PlayerDetail): TestElement {
  return StatisticsGrid({
    history: [],
    historyError: false,
    historyLoading: false,
    player,
  }) as TestElement;
}

function historyItem(day: number): PlayerMatchHistoryItem {
  const selected = detail();
  return {
    id: `00000000-0000-4000-8001-${String(day).padStart(12, '0')}`,
    location: null,
    playerGoals: [{ goals: day, playerId: selected.id }],
    score: { teamA: day, teamB: 0 },
    sport: {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Football',
    },
    startsAt: `2026-01-${String(day).padStart(2, '0')}T18:00:00.000Z`,
    subjectGoals: day,
    subjectResult: 'WIN',
    teams: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        side: 'A',
        players: [selected],
      },
      {
        id: '00000000-0000-4000-8000-000000000004',
        side: 'B',
        players: [],
      },
    ],
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

function directChildren(node: TestElement): TestElement[] {
  return Children.toArray(node.props.children).filter(
    isValidElement,
  ) as TestElement[];
}

function textValues(node: ReactNode): unknown[] {
  return descendants(node)
    .filter(({ type }) => type === 'AppText')
    .map(({ props }) => props.children);
}

function resultSegments(node: ReactNode): TestElement[] {
  return descendants(node).filter(isResultSegment);
}

function isResultSegment({ props, type }: TestElement): boolean {
  if (type !== 'View' || !Array.isArray(props.style)) return false;
  const backgroundColor = (
    props.style as Array<{ backgroundColor?: string }>
  )[1]?.backgroundColor;
  return ['danger', 'success', 'textSecondary'].includes(backgroundColor ?? '');
}

function invoke(callback: unknown): void {
  expect(callback).toEqual(expect.any(Function));
  (callback as () => void)();
}

function settledQuery(data: unknown) {
  return {
    data,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  };
}

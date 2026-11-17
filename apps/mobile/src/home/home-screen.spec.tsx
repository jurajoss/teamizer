import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  layoutMode: 'phone' as 'phone' | 'tablet',
  pressable: 'Pressable',
  view: 'View',
}));
const navigation = vi.hoisted(() => ({
  dismissTo: vi.fn(),
  navigate: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
    variables: undefined,
  }),
  useQuery: () => ({
    data: undefined,
    isError: false,
    isPending: false,
    refetch: vi.fn(),
  }),
  useQueryClient: () => ({}),
}));

vi.mock('react-native', () => ({
  Pressable: native.pressable,
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: native.view,
}));

vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Circle: 'Circle',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Line: 'Line',
  Path: 'Path',
  Stop: 'Stop',
}));

vi.mock('expo-router', () => ({
  router: navigation,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { name?: string }) =>
      values?.name ? `${key}:${values.name}` : key,
  }),
}));

vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  borderWidths: { subtle: 1 },
  Button: 'Button',
  Card: 'Card',
  FeedbackBanner: 'FeedbackBanner',
  radii: { md: 14, pill: 999, sm: 10 },
  sizes: {
    avatar: { small: 32 },
    controlHeight: 52,
    icon: { large: 24, medium: 20, small: 16 },
    minimumTouchTarget: 48,
  },
  spacing: { lg: 20, md: 16, sm: 12, xs: 8, xxs: 4 },
  useResponsiveLayout: () => ({ mode: native.layoutMode }),
  useTheme: () => ({
    colors: {
      accent: 'accent',
      accentContrast: 'accentContrast',
      accentSoft: 'accentSoft',
      border: 'border',
      success: 'success',
      surfaceElevated: 'surfaceElevated',
      surfaceStrong: 'surfaceStrong',
      surfaceSubtle: 'surfaceSubtle',
      textPrimary: 'textPrimary',
      textSecondary: 'textSecondary',
    },
  }),
}));

vi.mock('../session/session-context', () => ({
  useSession: () => ({
    state: {
      status: 'AUTHENTICATED',
      currentUser: {
        player: {
          avatarUrl: null,
          id: '00000000-0000-4000-8000-000000000002',
          name: 'Jura',
          status: 'ACTIVE',
          type: 'REGULAR',
        },
        user: {
          createdAt: '2026-01-01T00:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000004',
          notificationsEnabled: true,
          role: 'PLAYER',
        },
      },
    },
  }),
}));
vi.mock('../attendance/attendance-control', () => ({
  PersonalAttendanceControl: 'PersonalAttendanceControl',
}));
vi.mock('../preferences/preferences-context', () => ({
  usePreferences: () => ({ language: 'cs' }),
}));
vi.mock('../providers/app-services-context', () => ({
  useAppServices: () => ({ apiClient: {} }),
}));
vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('../ui/foundation-screen', () => ({
  FoundationScreen: 'FoundationScreen',
}));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));

import type { MatchDetail, UpcomingMatch } from '../api/contracts';
import {
  DashboardSectionHeader,
  HomeGreeting,
  HomeScreen,
  HomeGoalsCard,
  HomeNextMatch,
  HomeStatisticsCard,
} from './home-screen';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

const ids = {
  match: '00000000-0000-4000-8000-000000000001',
  player: '00000000-0000-4000-8000-000000000002',
  sport: '00000000-0000-4000-8000-000000000003',
};

describe('Home presentation contracts', () => {
  it('opens both personal dashboard sections directly on the authenticated Player', () => {
    navigation.navigate.mockClear();
    const home = HomeScreen() as TestElement;
    const statistics = descendants(home).find(
      ({ type }) => type === HomeStatisticsCard,
    );
    const goals = descendants(home).find(({ type }) => type === HomeGoalsCard);

    invoke(statistics?.props.onOpen);
    invoke(goals?.props.onOpen);

    expect(navigation.navigate.mock.calls).toEqual([
      ['/players/00000000-0000-4000-8000-000000000002'],
      ['/players/00000000-0000-4000-8000-000000000002'],
    ]);
  });

  it('renders the personalized greeting as content below the native header', () => {
    const greeting = HomeGreeting({
      playerName: 'Jiří Syrový',
    }) as TestElement;
    const copy = directChildren(greeting);

    expect(greeting.type).toBe(native.view);
    expect(copy.map(({ type }) => type)).toEqual(['AppText', 'AppText']);
    expect(copy.map(({ props }) => props.children)).toEqual([
      'home.greeting:Jiří',
      'home.greetingSubtitle',
    ]);
  });

  it('lays root content out below the native header', () => {
    const home = HomeScreen() as TestElement;
    expect(home.type).toBe('AppScreen');
    expect(home.props.underHeader).toBe(true);
  });

  it('passes unanswered attendance to the shared direct-choice control', () => {
    const card = nextMatchCard({
      match: upcomingMatch({ myAttendance: null }),
      onOpen: vi.fn(),
    });
    const control = descendants(card).find(
      ({ type }) => type === 'PersonalAttendanceControl',
    );

    expect(control?.props.attendance).toBeNull();
    expect(control?.props.disabled).toBe(false);
    expect(textValues(card)).not.toContain('home.edit');
  });

  it.each([['GOING'], ['NOT_GOING']] as const)(
    'passes answered %s attendance to the shared bordered-status control',
    (attendance) => {
      const card = nextMatchCard({
        match: upcomingMatch({ myAttendance: attendance }),
        onOpen: vi.fn(),
      });
      const control = descendants(card).find(
        ({ type }) => type === 'PersonalAttendanceControl',
      );

      expect(control?.props.attendance).toBe(attendance);
      expect(control?.props.disabled).toBe(false);
    },
  );

  it('routes the whole next-Match header to the actual Match detail', () => {
    const onOpen = vi.fn();
    const card = nextMatchCard({ onOpen });
    const header = directChildren(card).find(
      ({ type }) => type === DashboardSectionHeader,
    );
    expectWholeHeaderTarget(header, 'home.openMatch');
    invokeHeaderAction(header);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(ids.match);
  });

  it('renders only the three agreed statistics and routes its whole header', () => {
    const onOpen = vi.fn();
    const card = HomeStatisticsCard({
      error: false,
      loading: false,
      metrics: [
        { key: 'winRate', value: '68 %' },
        { key: 'goalsPerMatch', value: '2,1' },
        { key: 'matches', value: '18' },
      ],
      onOpen,
      onRetry: vi.fn(),
    }) as TestElement;
    const metricElements = descendants(card).filter(
      ({ props }) => typeof props.metric === 'object',
    );
    const header = directChildren(card).find(
      ({ type }) => type === DashboardSectionHeader,
    );

    expect(
      metricElements.map(({ props }) => (props.metric as { key: string }).key),
    ).toEqual(['winRate', 'goalsPerMatch', 'matches']);
    expectWholeHeaderTarget(header, 'home.openRankings');
    invokeHeaderAction(header);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('routes the whole goals-section header toward Statistics', () => {
    const onOpen = vi.fn();
    const card = HomeGoalsCard({
      error: false,
      loading: false,
      onOpen,
      onRetry: vi.fn(),
      points: [],
    }) as TestElement;
    const header = directChildren(card).find(
      ({ type }) => type === DashboardSectionHeader,
    );

    expectWholeHeaderTarget(header, 'home.openGoalsStatistics');
    invokeHeaderAction(header);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('reduces only the card-title top inset on phone', () => {
    native.layoutMode = 'phone';
    const cards = dashboardCards();

    for (const card of cards) {
      expect(card.props.padding).toBe('compact');
      expect(card.props.style).toContainEqual({ paddingTop: 8 });
    }

    native.layoutMode = 'tablet';
    const tabletCards = dashboardCards();

    for (const card of tabletCards) {
      expect(card.props.style).not.toContainEqual({ paddingTop: 8 });
    }

    native.layoutMode = 'phone';
  });
});

function dashboardCards(): TestElement[] {
  return [
    nextMatchCard({ onOpen: vi.fn() }),
    HomeStatisticsCard({
      error: false,
      loading: false,
      metrics: [],
      onOpen: vi.fn(),
      onRetry: vi.fn(),
    }) as TestElement,
    HomeGoalsCard({
      error: false,
      loading: false,
      onOpen: vi.fn(),
      onRetry: vi.fn(),
      points: [],
    }) as TestElement,
  ];
}

function nextMatchCard({
  match = upcomingMatch(),
  onOpen,
}: {
  match?: UpcomingMatch;
  onOpen(matchId: string): void;
}): TestElement {
  return HomeNextMatch({
    detail: matchDetail(),
    detailError: false,
    error: false,
    loading: false,
    match,
    mutationError: null,
    pendingAttendance: undefined,
    playerStatus: 'ACTIVE',
    updatingAttendance: false,
    onChangeAttendance: vi.fn(),
    onOpen,
    onRetry: vi.fn(),
  }) as TestElement;
}

function upcomingMatch(overrides: Partial<UpcomingMatch> = {}): UpcomingMatch {
  return {
    id: ids.match,
    location: 'Sportovní hala Kbely',
    myAttendance: null,
    sport: {
      id: ids.sport,
      name: 'Football',
      playersOnFieldPerTeam: 3,
      teamsPerMatch: 2,
    },
    startsAt: '2026-12-16T18:00:00.000Z',
    stateVersion: 1,
    status: 'OPEN_FOR_REGISTRATION',
    ...overrides,
  };
}

function matchDetail(): MatchDetail {
  return {
    ...upcomingMatch(),
    participants: {
      going: [
        {
          avatarUrl: null,
          id: ids.player,
          name: 'Jiří Syrový',
          status: 'ACTIVE',
          type: 'REGULAR',
        },
      ],
      notGoing: [],
      unanswered: [],
    },
    provenance: null,
    result: null,
    teams: null,
  };
}

function invokeHeaderAction(element: TestElement | undefined): void {
  const rendered = DashboardSectionHeader(
    element?.props as Parameters<typeof DashboardSectionHeader>[0],
  ) as TestElement;
  invoke(rendered.props.onPress);
}

function expectWholeHeaderTarget(
  element: TestElement | undefined,
  accessibilityLabel: string,
): void {
  const rendered = DashboardSectionHeader(
    element?.props as Parameters<typeof DashboardSectionHeader>[0],
  ) as TestElement;
  const content = directChildren(rendered)[0];

  expect(rendered.type).toBe(native.pressable);
  expect(rendered.props).toMatchObject({
    accessibilityLabel,
    accessibilityRole: 'button',
  });
  expect(
    (rendered.props.style as (state: { pressed: boolean }) => unknown[])({
      pressed: false,
    })[0],
  ).toEqual(expect.objectContaining({ minHeight: 48 }));
  expect(content?.props).toMatchObject({
    accessibilityElementsHidden: true,
    importantForAccessibility: 'no-hide-descendants',
    pointerEvents: 'none',
  });
  expect(
    [rendered, ...descendants(rendered)].filter(
      ({ type }) => type === native.pressable,
    ),
  ).toHaveLength(1);
  expect(
    descendants(rendered).some(
      ({ props, type }) => type === 'AppIcon' && props.name === 'next',
    ),
  ).toBe(true);
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

function textValues(element: TestElement): unknown[] {
  return descendants(element).map(({ props }) => props.children);
}

function invoke(callback: unknown): void {
  expect(callback).toEqual(expect.any(Function));
  (callback as () => void)();
}

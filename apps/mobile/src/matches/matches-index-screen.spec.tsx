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
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('react-native-svg', () => ({ Path: 'Path', Svg: 'Svg' }));

vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  borderWidths: { subtle: 1 },
  Button: 'Button',
  FeedbackBanner: 'FeedbackBanner',
  radii: { md: 14, pill: 999, sm: 10 },
  sizes: { icon: { large: 24 }, minimumTouchTarget: 48 },
  spacing: {
    lg: 20,
    md: 16,
    sm: 12,
    xl: 24,
    xs: 8,
    xxs: 4,
    xxl: 32,
    xxxl: 40,
  },
  statusColorSet: () => ({
    background: 'background',
    border: 'border',
    foreground: 'foreground',
  }),
  useResponsiveLayout: () => ({ mode: 'phone', width: 360 }),
  useTheme: () => ({
    colors: {
      accent: 'accent',
      accentContrast: 'accentContrast',
      accentPressed: 'accentPressed',
      border: 'border',
      danger: 'danger',
      success: 'success',
      surface: 'surface',
      surfaceElevated: 'surfaceElevated',
      surfaceStrong: 'surfaceStrong',
      surfaceSubtle: 'surfaceSubtle',
      textPrimary: 'textPrimary',
      textSecondary: 'textSecondary',
    },
  }),
}));

vi.mock('../preferences/preferences-context', () => ({
  usePreferences: () => ({ language: 'cs' }),
}));
vi.mock('../providers/app-services-context', () => ({
  useAppServices: vi.fn(),
}));
vi.mock('../session/session-context', () => ({ useSession: vi.fn() }));
vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('../ui/foundation-screen', () => ({
  FoundationScreen: 'FoundationScreen',
}));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));
vi.mock('../ui/player-avatar-stack', () => ({
  PlayerAvatarStack: 'PlayerAvatarStack',
}));

import type {
  MatchDetail,
  MatchSummary,
  UpcomingMatch,
} from '../api/contracts';
import {
  FinishedMatchResultIndicator,
  FinishedMatchScore,
  MatchListRow as SharedMatchListRow,
} from './match-list-row';
import {
  MatchListRow,
  MatchesFilterControl,
  MatchesListContent,
} from './matches-index-screen';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

const ids = {
  current: '00000000-0000-4000-8000-000000000001',
  match: '00000000-0000-4000-8000-000000000002',
  other: '00000000-0000-4000-8000-000000000003',
  outsider: '00000000-0000-4000-8000-000000000004',
  sport: '00000000-0000-4000-8000-000000000005',
  teamA: '00000000-0000-4000-8000-000000000006',
  teamB: '00000000-0000-4000-8000-000000000007',
};

describe('Matches index presentation', () => {
  it('exposes all three filters through one segmented control', () => {
    const onChange = vi.fn();
    const control = MatchesFilterControl({
      filter: 'all',
      onChange,
    }) as TestElement;
    const tabs = descendants(control).filter(
      ({ type }) => type === native.pressable,
    );

    expect(tabs.map(({ props }) => props.accessibilityState)).toEqual([
      { selected: true },
      { selected: false },
      { selected: false },
    ]);
    for (const tab of tabs) invoke(tab.props.onPress);
    expect(onChange.mock.calls.map(([filter]) => filter)).toEqual([
      'all',
      'upcoming',
      'finished',
    ]);
  });

  it('groups All into upcoming then finished rows', () => {
    const content = listContent({
      filter: 'all',
      upcoming: [upcomingMatch('GOING')],
      finished: [finishedMatch()],
    });
    const rows = descendants(content).filter(
      ({ type }) => type === MatchListRow,
    );

    expect(rows.map(({ props }) => props.kind)).toEqual([
      'upcoming',
      'finished',
    ]);
  });

  it.each([
    ['GOING', 'matchesIndex.going'],
    ['NOT_GOING', 'matchesIndex.notGoing'],
  ] as const)('renders explicit %s attendance', (attendance, label) => {
    const row = upcomingRow(attendance);
    expect(descendants(row).some(({ props }) => props.label === label)).toBe(
      true,
    );
  });

  it('renders no attendance chip for unanswered', () => {
    const row = upcomingRow(null);
    const labels = descendants(row).map(({ props }) => props.label);

    expect(labels).not.toContain('matchesIndex.going');
    expect(labels).not.toContain('matchesIndex.notGoing');
  });

  it.each([
    ['WIN', 'M6 1 L11 11 H1 Z', 'success'],
    ['LOSS', 'M1 1 H11 L6 11 Z', 'danger'],
    ['DRAW', 'M2 1 L11 6 L2 11 Z', 'textSecondary'],
  ] as const)(
    'renders %s as the approved filled cross-platform triangle',
    (result, pathData, color) => {
      const indicator = FinishedMatchResultIndicator({ result }) as TestElement;
      const svg = descendants(indicator).find(({ type }) => type === 'Svg');
      const path = descendants(indicator).find(({ type }) => type === 'Path');

      expect(svg?.props).toMatchObject({
        height: 15,
        viewBox: '0 0 12 12',
        width: 15,
      });
      expect(path?.props).toMatchObject({ d: pathData, fill: color });
      expect(textValues(indicator)).toEqual([]);
      expect(indicator.props.style).toEqual([
        expect.objectContaining({ flexShrink: 0 }),
        expect.objectContaining({ width: 15 }),
      ]);
      expect(indicator.props.pointerEvents).toBe('none');
    },
  );

  it('keeps the neutral nonparticipant dash without using a triangle glyph', () => {
    const indicator = FinishedMatchResultIndicator({
      result: 'DID_NOT_PLAY',
    }) as TestElement;
    const text = descendants(indicator).find(({ type }) => type === 'AppText');

    expect(text?.props.children).toBe('—');
    expect(text?.props.style).toEqual(
      expect.objectContaining({ color: 'textSecondary' }),
    );
    expect(descendants(indicator).some(({ type }) => type === 'Svg')).toBe(
      false,
    );
  });

  it('preserves the compact indicator size for non-row summaries', () => {
    const indicator = FinishedMatchResultIndicator({
      result: 'WIN',
      size: 'compact',
    }) as TestElement;
    const svg = descendants(indicator).find(({ type }) => type === 'Svg');

    expect(svg?.props).toMatchObject({ height: 12, width: 12 });
    expect(indicator.props.style).toEqual([
      expect.objectContaining({ flexShrink: 0 }),
      expect.objectContaining({ width: 12 }),
    ]);
  });

  it('provides a dense indicator without changing the existing summary size', () => {
    const indicator = FinishedMatchResultIndicator({
      result: 'WIN',
      size: 'dense',
    }) as TestElement;
    const svg = descendants(indicator).find(({ type }) => type === 'Svg');

    expect(svg?.props).toMatchObject({ height: 9, width: 9 });
    expect(indicator.props.style).toEqual([
      expect.objectContaining({ flexShrink: 0 }),
      expect.objectContaining({ width: 9 }),
    ]);
  });

  it('does not fabricate an indicator when authoritative participation is unknown', () => {
    const indicator = FinishedMatchResultIndicator({
      result: null,
    }) as TestElement;
    const row = finishedRow(ids.current, { matchDetail: null });

    expect(textValues(indicator)).toEqual([]);
    expect(row.props.accessibilityLabel).not.toContain('matchesIndex.win');
    expect(row.props.accessibilityLabel).not.toContain('matchesIndex.loss');
    expect(row.props.accessibilityLabel).not.toContain('matchesIndex.draw');
    expect(row.props.accessibilityLabel).not.toContain(
      'matchesIndex.didNotPlay',
    );
  });

  it.each([
    [ids.current, { teamA: 2, teamB: 1 }, 'matchesIndex.win'],
    [ids.other, { teamA: 2, teamB: 1 }, 'matchesIndex.loss'],
    [ids.current, { teamA: 2, teamB: 2 }, 'matchesIndex.draw'],
    [ids.outsider, { teamA: 2, teamB: 1 }, 'matchesIndex.didNotPlay'],
  ] as const)(
    'announces the semantic result for %s without rendering a result text chip',
    (playerId, score, label) => {
      const row = finishedRow(playerId, { score });

      expect(row.props.accessibilityLabel).toContain(label);
      expect(textValues(row)).not.toContain(label);
      expect(descendants(row).some(({ props }) => props.label === label)).toBe(
        false,
      );
    },
  );

  it.each([
    [{ teamA: 7, teamB: 10 }, [7, ':', 10]],
    [{ teamA: 15, teamB: 11 }, [15, ':', 11]],
  ] as const)(
    'renders normal score %o in equal fixed two-digit regions',
    (value, expectedParts) => {
      const score = FinishedMatchScore({ score: value }) as TestElement;
      const parts = directChildren(score);
      const leftStyle = parts[0]?.props.style as unknown[];
      const rightStyle = parts[2]?.props.style as unknown[];

      expect(parts.map(({ props }) => props.children)).toEqual(expectedParts);
      expect(leftStyle[0]).toEqual(
        expect.objectContaining({ fontVariant: ['tabular-nums'] }),
      );
      expect(leftStyle[1]).toEqual(
        expect.objectContaining({ width: expect.any(Number) }),
      );
      expect(leftStyle[2]).toEqual(
        expect.objectContaining({ textAlign: 'right' }),
      );
      expect(parts[1]?.props.style).toEqual(
        expect.objectContaining({
          textAlign: 'center',
          width: expect.any(Number),
        }),
      );
      expect(rightStyle[0]).toEqual(
        expect.objectContaining({ fontVariant: ['tabular-nums'] }),
      );
      expect(rightStyle[1]).toEqual(
        expect.objectContaining({ width: expect.any(Number) }),
      );
      expect(rightStyle[2]).toEqual(
        expect.objectContaining({ textAlign: 'left' }),
      );
      expect((leftStyle[1] as { width: number }).width).toBe(
        (rightStyle[1] as { width: number }).width,
      );
    },
  );

  it('renders an unexpected three-digit score with intrinsic fallback width', () => {
    const score = FinishedMatchScore({
      score: { teamA: 84, teamB: 112 },
    }) as TestElement;
    const parts = directChildren(score);
    const rightStyle = parts[2]?.props.style as unknown[];

    expect(parts.map(({ props }) => props.children)).toEqual([84, ':', 112]);
    expect(rightStyle[1]).toEqual(
      expect.objectContaining({ minWidth: expect.any(Number) }),
    );
  });

  it('groups the indicator with the fixed score while preserving trailing row geometry', () => {
    const row = finishedRow(ids.current);
    const parts = directChildren(row);
    const resultBlock = parts[2]!;
    const resultParts = directChildren(resultBlock);

    expect(parts[1]?.props.style).toEqual(
      expect.objectContaining({ flex: 1, minWidth: 0 }),
    );
    expect(resultBlock.type).toBe(native.view);
    expect(resultBlock.props.style).toEqual(
      expect.objectContaining({ alignItems: 'center', flexDirection: 'row' }),
    );
    expect(resultParts[0]?.type).toBe(FinishedMatchResultIndicator);
    expect(
      descendants(resultParts[1]!).some(
        ({ type }) => type === FinishedMatchScore,
      ),
    ).toBe(true);
    expect(parts[3]?.type).toBe('AppIcon');
  });

  it('uses the denser finished-row spacing without reducing the touch target', () => {
    const row = finishedRow(ids.current);
    const rowStyles = row.props.style as (state: {
      pressed: boolean;
    }) => unknown[];
    const resolvedStyles = rowStyles({ pressed: false });

    expect(resolvedStyles[1]).toEqual(
      expect.objectContaining({ minHeight: 68, paddingVertical: 4 }),
    );
    expect(
      (resolvedStyles[1] as { minHeight: number }).minHeight,
    ).toBeGreaterThan(48);
  });

  it('uses the responsive avatar limit and routes the complete row', () => {
    const onOpen = vi.fn();
    const phone = upcomingRow('GOING', 'phone', onOpen);
    const tablet = upcomingRow('GOING', 'tablet');
    const phoneStack = descendants(phone).find(
      ({ type }) => type === 'PlayerAvatarStack',
    );
    const tabletStack = descendants(tablet).find(
      ({ type }) => type === 'PlayerAvatarStack',
    );

    expect(phoneStack?.props.maxVisible).toBe(3);
    expect(tabletStack?.props.maxVisible).toBe(8);
    invoke(phone.props.onPress);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('restores responsive finished participant capacity without moving fixed columns', () => {
    const narrowPhone = finishedRow(ids.current, { viewportWidth: 360 });
    const widePhone = finishedRow(ids.current, { viewportWidth: 390 });
    const tablet = finishedRow(ids.current, {
      mode: 'tablet',
      viewportWidth: 768,
    });
    const limits = [narrowPhone, widePhone, tablet].map(
      (row) =>
        descendants(row).find(({ type }) => type === 'PlayerAvatarStack')?.props
          .maxVisible,
    );

    expect(limits).toEqual([2, 3, 8]);
  });

  it('passes every participant to the bounded stack so overflow stays accurate', () => {
    const matchDetail = finishedDetailWithPlayers(6);
    const row = finishedRow(ids.current, {
      matchDetail,
      viewportWidth: 360,
    });
    const stack = descendants(row).find(
      ({ type }) => type === 'PlayerAvatarStack',
    );

    expect(stack?.props.maxVisible).toBe(2);
    expect(stack?.props.players).toHaveLength(6);
  });

  it('keeps the complete finished row as the navigation target', () => {
    const onOpen = vi.fn();
    const row = finishedRow(ids.current, { onOpen });

    invoke(row.props.onPress);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('passes an explicit zero-goal count to the shared row for a participant', () => {
    const adapter = MatchListRow({
      currentPlayerId: ids.current,
      detail: detail('FINISHED'),
      kind: 'finished',
      language: 'cs',
      match: finishedMatch(),
      mode: 'phone',
      onOpen: vi.fn(),
      viewportWidth: 360,
    }) as TestElement;

    expect(adapter.type).toBe(SharedMatchListRow);
    expect(adapter.props.personalGoals).toBe(0);
  });

  it('omits personal goals when the current Player did not participate', () => {
    const adapter = MatchListRow({
      currentPlayerId: ids.outsider,
      detail: detail('FINISHED'),
      kind: 'finished',
      language: 'cs',
      match: finishedMatch(),
      mode: 'phone',
      onOpen: vi.fn(),
      viewportWidth: 360,
    }) as TestElement;

    expect(adapter.props.personalGoals).toBeNull();
  });

  it.each([
    ['all', 'matchesIndex.emptyStates.all.title'],
    ['upcoming', 'matchesIndex.emptyStates.upcoming.title'],
    ['finished', 'matchesIndex.emptyStates.finished.title'],
  ] as const)('renders the %s empty state', (filter, title) => {
    const content = listContent({ filter, upcoming: [], finished: [] });
    expect(textValues(content)).toContain(title);
  });
});

function listContent({
  filter,
  upcoming,
  finished,
}: {
  filter: 'all' | 'upcoming' | 'finished';
  upcoming: UpcomingMatch[];
  finished: MatchSummary[];
}): TestElement {
  return MatchesListContent({
    currentPlayerId: ids.current,
    detailsByMatchId: new Map(),
    filter,
    finished,
    language: 'cs',
    mode: 'phone',
    upcoming,
    viewportWidth: 360,
    onOpen: vi.fn(),
  }) as TestElement;
}

function upcomingRow(
  attendance: UpcomingMatch['myAttendance'],
  mode: 'phone' | 'tablet' = 'phone',
  onOpen = vi.fn(),
): TestElement {
  const adapter = MatchListRow({
    currentPlayerId: ids.current,
    detail: detail('OPEN_FOR_REGISTRATION'),
    kind: 'upcoming',
    language: 'cs',
    match: upcomingMatch(attendance),
    mode,
    onOpen,
    viewportWidth: mode === 'tablet' ? 768 : 360,
  }) as TestElement;
  return SharedMatchListRow(
    adapter.props as Parameters<typeof SharedMatchListRow>[0],
  ) as TestElement;
}

function finishedRow(
  playerId: string,
  {
    matchDetail,
    mode = 'phone',
    onOpen = vi.fn(),
    score = { teamA: 2, teamB: 1 },
    viewportWidth = 360,
  }: {
    matchDetail?: MatchDetail | null;
    mode?: 'phone' | 'tablet';
    onOpen?: () => void;
    score?: { teamA: number; teamB: number };
    viewportWidth?: number;
  } = {},
): TestElement {
  const adapter = MatchListRow({
    currentPlayerId: playerId,
    detail:
      matchDetail === null
        ? undefined
        : (matchDetail ?? detail('FINISHED', score)),
    kind: 'finished',
    language: 'cs',
    match: finishedMatch(),
    mode,
    onOpen,
    viewportWidth,
  }) as TestElement;
  return SharedMatchListRow(
    adapter.props as Parameters<typeof SharedMatchListRow>[0],
  ) as TestElement;
}

function upcomingMatch(
  attendance: UpcomingMatch['myAttendance'],
): UpcomingMatch {
  return {
    ...baseMatch(),
    status: 'OPEN_FOR_REGISTRATION',
    myAttendance: attendance,
  };
}

function finishedMatch(): MatchSummary {
  return { ...baseMatch(), status: 'FINISHED' };
}

function baseMatch() {
  return {
    id: ids.match,
    sport: {
      id: ids.sport,
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 3,
    },
    startsAt: '2026-12-16T18:00:00.000Z',
    location: 'Pitch A',
    stateVersion: 1,
  };
}

function detail(
  status: 'OPEN_FOR_REGISTRATION' | 'FINISHED',
  score = { teamA: 2, teamB: 1 },
): MatchDetail {
  const current = player(ids.current, 'Current');
  const other = player(ids.other, 'Other');
  return {
    ...baseMatch(),
    status,
    myAttendance: 'GOING',
    participants: { going: [current, other], notGoing: [], unanswered: [] },
    teams:
      status === 'FINISHED'
        ? [
            { id: ids.teamA, side: 'A', players: [current] },
            { id: ids.teamB, side: 'B', players: [other] },
          ]
        : null,
    provenance: null,
    result: status === 'FINISHED' ? { score, playerGoals: [] } : null,
  };
}

function finishedDetailWithPlayers(playerCount: number): MatchDetail {
  const match = detail('FINISHED');
  const extraPlayers = Array.from(
    { length: Math.max(0, playerCount - 2) },
    (_, index) =>
      player(
        `00000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`,
        `Extra ${index + 1}`,
      ),
  );
  match.participants.going.push(...extraPlayers);
  match.teams?.[0]?.players.push(...extraPlayers);
  return match;
}

function player(id: string, name: string) {
  return {
    id,
    name,
    type: 'REGULAR' as const,
    status: 'ACTIVE' as const,
    avatarUrl: null,
  };
}

function descendants(element: TestElement): TestElement[] {
  const children = directChildren(element);
  return [element, ...children.flatMap(descendants)];
}

function directChildren(element: TestElement): TestElement[] {
  return Children.toArray(element.props.children).filter(
    isValidElement,
  ) as TestElement[];
}

function textValues(element: TestElement): unknown[] {
  return descendants(element)
    .filter(({ type }) => type === 'AppText')
    .map(({ props }) => props.children);
}

function invoke(callback: unknown) {
  if (typeof callback === 'function') callback();
}

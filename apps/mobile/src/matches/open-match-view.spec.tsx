import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  modal: 'Modal',
  pressable: 'Pressable',
  scrollView: 'ScrollView',
  view: 'View',
}));

vi.mock('react-native', () => ({
  Modal: native.modal,
  Pressable: native.pressable,
  ScrollView: native.scrollView,
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: native.view,
}));
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Readonly<Record<string, unknown>>) =>
      key === 'attendance.groupCount'
        ? `${String(options?.label)} (${String(options?.count)})`
        : key,
  }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  borderWidths: { subtle: 1 },
  Button: 'Button',
  Card: 'Card',
  FeedbackBanner: 'FeedbackBanner',
  NumberStepper: 'NumberStepper',
  radii: { md: 14, sm: 10 },
  sizes: {
    compactControl: 36,
    icon: { medium: 20, small: 16 },
    minimumTouchTarget: 48,
  },
  spacing: { lg: 20, md: 16, sm: 12, xs: 8, xxs: 4 },
  TextField: 'TextField',
  useTheme: () => ({
    colors: {
      accent: 'accent',
      accentContrast: 'accentContrast',
      accentSoft: 'accentSoft',
      background: 'background',
      border: 'border',
      success: 'success',
      surface: 'surface',
      surfaceSubtle: 'surfaceSubtle',
      teamABorder: 'teamABorder',
      teamASurface: 'teamASurface',
      teamAText: 'teamAText',
      teamBBorder: 'teamBBorder',
      teamBSurface: 'teamBSurface',
      teamBText: 'teamBText',
      textDisabled: 'textDisabled',
      textSecondary: 'textSecondary',
    },
  }),
}));
vi.mock('../attendance/attendance-control', () => ({
  PersonalAttendanceControl: 'PersonalAttendanceControl',
}));
vi.mock('../preferences/preferences-context', () => ({
  usePreferences: () => ({ language: 'en' }),
}));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));

import type { MatchDetail } from '../api/contracts';
import type { TransientTeamProposal } from './match-flow';
import { MatchTeamColumns } from './match-team-columns';
import {
  MatchAttendanceSection,
  MatchCancellationSection,
  MatchParticipantsSection,
  MatchStartAction,
  MatchTeamsSection,
  TextAction,
} from './open-match-view';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

const ids = {
  match: '00000000-0000-4000-8000-000000000010',
  sport: '00000000-0000-4000-8000-000000000011',
  a: '00000000-0000-4000-8000-000000000001',
  b: '00000000-0000-4000-8000-000000000002',
};

describe('pre-match detail presentation', () => {
  it.each([[null], ['GOING'], ['NOT_GOING']] as const)(
    'uses the shared Home attendance behavior for %s',
    (attendance) => {
      const onUpdate = vi.fn();
      const section = MatchAttendanceSection({
        active: true,
        attendance,
        busy: false,
        pendingValue: undefined,
        updating: false,
        onUpdate,
      }) as TestElement;
      const control = descendants(section).find(
        ({ type }) => type === 'PersonalAttendanceControl',
      );

      expect(control?.props.attendance).toBe(attendance);
      expect(control?.props.disabled).toBe(false);
      invoke(control?.props.onChange);
      expect(onUpdate).toHaveBeenCalledOnce();
      expect(
        descendants(section).some(
          ({ props }) => props.label === 'attendance.edit',
        ),
      ).toBe(false);
    },
  );

  it.each(['regular user', 'ADMIN'])(
    'shows equal team-management actions to a %s',
    () => {
      const section = teamsSection(false);
      const actions = descendants(section).filter(
        ({ type }) => type === TextAction,
      );

      expect(section.type).toBe('Card');
      expect(actions.map(({ props }) => props.label)).toEqual([
        'teams.regenerate',
        'teams.edit',
      ]);
      expect(actions.map(({ props }) => props.icon)).toEqual([
        'regenerate',
        'edit',
      ]);
      expect(actions.every(({ props }) => props.disabled === false)).toBe(true);
      expect(descendants(section).some(({ type }) => type === 'Button')).toBe(
        false,
      );
    },
  );

  it('does not expose a manual action while the initial proposal generates automatically', () => {
    const section = MatchTeamsSection({
      generating: true,
      mayGenerate: true,
      playersById: new Map(),
      proposal: null,
      stale: false,
      onEdit: vi.fn(),
      onGenerate: vi.fn(),
    }) as TestElement;

    expect(
      descendants(section).filter(({ type }) => type === TextAction),
    ).toHaveLength(0);
    expect(textValues(section)).toContain('teams.generating');
  });

  it('preserves the insufficient-player state without adding an action', () => {
    const section = MatchTeamsSection({
      generating: false,
      mayGenerate: false,
      playersById: new Map(),
      proposal: null,
      stale: false,
      onEdit: vi.fn(),
      onGenerate: vi.fn(),
    }) as TestElement;

    expect(
      descendants(section).filter(({ type }) => type === TextAction),
    ).toHaveLength(0);
    expect(
      descendants(section).find(({ type }) => type === 'FeedbackBanner')?.props
        .message,
    ).toBe('teams.minimum');
  });

  it('renders Team A and Team B side by side without counts or menu controls', () => {
    const section = teamsSection(false);
    const columns = descendants(section).find(
      ({ type }) => type === MatchTeamColumns,
    );

    expect(
      (columns?.props.teamAPlayers as MatchDetail['participants']['going']).map(
        ({ name }) => name,
      ),
    ).toEqual(['Ada']);
    expect(
      (columns?.props.teamBPlayers as MatchDetail['participants']['going']).map(
        ({ name }) => name,
      ),
    ).toEqual(['Ben']);
    expect(textValues(section)).not.toContain('⋮');
    expect(textValues(section)).not.toContain('common.playerCount');
  });

  it('shows the stale warning and contextual Update teams action', () => {
    const section = teamsSection(true);
    const banner = descendants(section).find(
      ({ type }) => type === 'FeedbackBanner',
    );
    const actions = descendants(section).filter(
      ({ type }) => type === TextAction,
    );

    expect(banner?.props.title).toBe('teams.staleTitle');
    expect(banner?.props.message).toBe('teams.staleHint');
    expect(actions[0]?.props.label).toBe('teams.update');
  });

  it.each(['regular user', 'ADMIN'])(
    'shows Start match as a separate primary action to an eligible %s',
    () => {
      const start = MatchStartAction({
        confirming: false,
        enabled: true,
        pending: false,
        onBegin: vi.fn(),
        onCancel: vi.fn(),
        onConfirm: vi.fn(),
      }) as TestElement;
      const button = descendants(start).find(({ type }) => type === 'Button');

      expect(button?.props.label).toBe('teams.start');
      expect(button?.props.variant).toBeUndefined();
      expect((button?.props.icon as TestElement).type).toBe('AppIcon');
      expect((button?.props.icon as TestElement).props.name).toBe('play');
      expect(
        descendants(teamsSection(false)).some(
          ({ props }) => props.label === 'teams.start',
        ),
      ).toBe(false);
    },
  );

  it('uses a warning followed by full-width Keep editing and Start match actions during confirmation', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const confirmation = MatchStartAction({
      confirming: true,
      enabled: true,
      pending: false,
      onBegin: vi.fn(),
      onCancel,
      onConfirm,
    }) as TestElement;
    const banner = descendants(confirmation).find(
      ({ type }) => type === 'FeedbackBanner',
    );
    const buttons = descendants(confirmation).filter(
      ({ type }) => type === 'Button',
    );

    expect(banner?.props).toMatchObject({
      message: 'teams.lockHint',
      title: 'teams.lockTitle',
      tone: 'warning',
    });
    expect(buttons.map(({ props }) => props.label)).toEqual([
      'teams.keepEditing',
      'teams.start',
    ]);
    expect(buttons.map(({ props }) => props.fullWidth)).toEqual([true, true]);
    expect(buttons[0]?.props.variant).toBe('secondary');
    expect(buttons[1]?.props.variant).toBeUndefined();
    expect((buttons[1]?.props.icon as TestElement).type).toBe('AppIcon');
    expect((buttons[1]?.props.icon as TestElement).props.name).toBe('play');

    invoke(buttons[0]?.props.onPress);
    invoke(buttons[1]?.props.onPress);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses a quiet destructive text trigger while preserving cancel confirmation', () => {
    const onBegin = vi.fn();
    const trigger = MatchCancellationSection({
      confirming: false,
      pending: false,
      onBegin,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    }) as TestElement;

    expect(trigger.type).toBe(native.pressable);
    expect(trigger.props.accessibilityLabel).toBe('cancellation.title');
    expect(trigger.props.accessibilityRole).toBe('button');
    expect(descendants(trigger).some(({ type }) => type === 'Button')).toBe(
      false,
    );
    expect(descendants(trigger)).not.toContainEqual(
      expect.objectContaining({ type: 'AppIcon' }),
    );
    expect(resolveStyle(trigger)).toContainEqual(
      expect.objectContaining({ minHeight: 48, width: '100%' }),
    );
    invoke(trigger.props.onPress);
    expect(onBegin).toHaveBeenCalledOnce();

    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const confirmation = MatchCancellationSection({
      confirming: true,
      pending: false,
      onBegin: vi.fn(),
      onCancel,
      onConfirm,
    }) as TestElement;
    const buttons = descendants(confirmation).filter(
      ({ type }) => type === 'Button',
    );
    expect(buttons.map(({ props }) => props.label)).toEqual([
      'cancellation.keep',
      'cancellation.confirm',
    ]);
    expect(buttons[1]?.props.variant).toBe('destructive');
    invoke(buttons[0]?.props.onPress);
    invoke(buttons[1]?.props.onPress);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('uses the same compact read-only participant groups for players and administrators', () => {
    const normal = participantsSection(false);
    const admin = participantsSection(true);
    const normalGroups = descendants(normal)
      .filter(({ props }) => Array.isArray(props.players))
      .map(({ props }) => props.players);
    const adminGroups = descendants(admin)
      .filter(({ props }) => Array.isArray(props.players))
      .map(({ props }) => props.players);

    expect(adminGroups).toEqual(normalGroups);
    expect(textValues(normal)).not.toContain('attendance.setGoing');
    expect(textValues(normal)).not.toContain('attendance.setNotGoing');
    expect(textValues(admin)).not.toContain('attendance.setGoing');
    expect(textValues(admin)).not.toContain('attendance.setNotGoing');
  });

  it('shows actual counts for populated Going and Not-going groups', () => {
    const match = matchDetail();
    match.participants.going.push(
      player('00000000-0000-4000-8000-000000000003', 'Cy'),
    );
    const section = participantsSection(false, match);
    const groups = renderedParticipantGroups(section);
    const goingGroup = requiredElement(groups[0], 'Going participant group');
    const notGoingGroup = requiredElement(
      groups[1],
      'Not-going participant group',
    );

    expect(textValues(goingGroup)).toContain('attendance.going (2)');
    expect(textValues(notGoingGroup)).toContain('attendance.notGoing (1)');
    expect(
      groups.flatMap(descendants).filter(({ type }) => type === 'Avatar'),
    ).toHaveLength(3);
  });

  it.each([
    ['going', 'attendance.going (0)'],
    ['notGoing', 'attendance.notGoing (0)'],
  ] as const)(
    'renders an empty %s group as only its zero-count heading',
    (group, heading) => {
      const match = matchDetail();
      match.participants[group] = [];
      const section = participantsSection(false, match);
      const renderedGroup = requiredElement(
        renderedParticipantGroups(section)[group === 'going' ? 0 : 1],
        `${group} participant group`,
      );

      expect(textValues(renderedGroup)).toContain(heading);
      expect(textValues(renderedGroup)).not.toContain('attendance.empty');
      expect(directChildren(renderedGroup)).toHaveLength(1);
    },
  );

  it('keeps Add guest for everyone and the short participant Edit ADMIN-only', () => {
    const onEditParticipants = vi.fn();
    const normal = participantsSection(false);
    const admin = participantsSection(true, matchDetail(), onEditParticipants);
    const normalActions = descendants(normal).filter(
      ({ type }) => type === TextAction,
    );
    const adminActions = descendants(admin).filter(
      ({ type }) => type === TextAction,
    );

    expect(normalActions.map(({ props }) => props.label)).toEqual([
      'guest.add',
    ]);
    expect(normalActions.map(({ props }) => props.icon)).toEqual(['add']);
    expect(adminActions.map(({ props }) => props.label)).toEqual([
      'guest.add',
      'attendance.editParticipantsAction',
    ]);
    expect(adminActions.map(({ props }) => props.icon)).toEqual([
      'add',
      'edit',
    ]);
    invoke(adminActions[1]?.props.onPress);
    expect(onEditParticipants).toHaveBeenCalledOnce();
  });
});

function participantsSection(
  isAdmin: boolean,
  match = matchDetail(),
  onEditParticipants = vi.fn(),
): TestElement {
  return MatchParticipantsSection({
    busy: false,
    guest: {
      draft: {
        name: '',
        attributes: {
          speed: 5,
          endurance: 5,
          defense: 5,
          attack: 5,
          technique: 5,
        },
      },
      isOpen: false,
      isPending: false,
      setDraft: vi.fn(),
      submit: vi.fn(),
      toggle: vi.fn(),
    },
    isAdmin,
    match,
    onEditParticipants,
  }) as TestElement;
}

function teamsSection(stale: boolean): TestElement {
  return MatchTeamsSection({
    generating: false,
    mayGenerate: true,
    playersById: new Map([
      [ids.a, player(ids.a, 'Ada')],
      [ids.b, player(ids.b, 'Ben')],
    ]),
    proposal: proposal(),
    stale,
    onEdit: vi.fn(),
    onGenerate: vi.fn(),
  }) as TestElement;
}

function player(id: string, name: string) {
  return {
    id,
    name,
    avatarUrl: null,
    status: 'ACTIVE' as const,
    type: 'REGULAR' as const,
  } satisfies MatchDetail['participants']['going'][number];
}

function matchDetail(): MatchDetail {
  return {
    id: ids.match,
    sport: {
      id: ids.sport,
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 5,
    },
    startsAt: '2026-09-29T18:00:00.000Z',
    location: 'Pitch',
    status: 'OPEN_FOR_REGISTRATION',
    stateVersion: 2,
    myAttendance: 'GOING',
    participants: {
      going: [player(ids.a, 'Ada')],
      notGoing: [player(ids.b, 'Ben')],
      unanswered: [],
    },
    teams: null,
    provenance: null,
    result: null,
  };
}

function proposal(): TransientTeamProposal & {
  participantSnapshotIds: string[];
  source: 'GENERATED';
  forcedStale: false;
} {
  return {
    matchStateVersion: 1,
    generatedTeamAPlayerIds: [ids.a],
    generatedTeamBPlayerIds: [ids.b],
    teamAPlayerIds: [ids.a],
    teamBPlayerIds: [ids.b],
    balance: { balanceScore: 0.1, historyScore: 0.2 },
    algorithmVersion: 'v1',
    configurationVersion: 'v1',
    proposalReceipt: 'receipt',
    participantSnapshotIds: [ids.a, ids.b],
    source: 'GENERATED',
    forcedStale: false,
  };
}

function descendants(element: TestElement): TestElement[] {
  return directChildren(element).flatMap((child) => [
    child,
    ...descendants(child),
  ]);
}

function renderedParticipantGroups(section: TestElement): TestElement[] {
  return descendants(section)
    .filter(
      ({ type, props }) =>
        typeof type === 'function' && Array.isArray(props.players),
    )
    .map(renderFunctionElement);
}

function renderFunctionElement(element: TestElement): TestElement {
  if (typeof element.type !== 'function') {
    throw new Error('Expected a function component element.');
  }
  return (element.type as (props: TestElement['props']) => ReactNode)(
    element.props,
  ) as TestElement;
}

function requiredElement(
  element: TestElement | undefined,
  label: string,
): TestElement {
  if (!element) throw new Error(`Expected ${label}.`);
  return element;
}

function directChildren(element: TestElement): TestElement[] {
  return Children.toArray(element.props.children).filter(
    (child): child is TestElement => isValidElement(child),
  );
}

function textValues(element: TestElement): unknown[] {
  return descendants(element).map(({ props }) => props.children);
}

function resolveStyle(element: TestElement): unknown[] {
  const style = element.props.style;
  const resolved =
    typeof style === 'function' ? style({ pressed: false }) : style;
  return Array.isArray(resolved) ? resolved : [resolved];
}

function invoke(value: unknown): void {
  if (typeof value === 'function') value();
}

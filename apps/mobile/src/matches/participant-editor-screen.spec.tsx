import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  view: 'View',
}));

vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: native.view,
}));
vi.mock('expo-router', () => ({ Redirect: 'Redirect' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  borderWidths: { emphasized: 2, subtle: 1 },
  Button: 'Button',
  Card: 'Card',
  FeedbackBanner: 'FeedbackBanner',
  radii: { lg: 20, md: 14, pill: 999 },
  sizes: {
    compactControl: 36,
    icon: { small: 16 },
  },
  spacing: { lg: 20, md: 16, sm: 12, xs: 8, xxs: 4 },
  TextField: 'TextField',
  useTheme: () => ({
    colors: {
      accentSoft: 'accentSoft',
      border: 'border',
      borderStrong: 'borderStrong',
      danger: 'danger',
      dangerSurface: 'dangerSurface',
      overlay: 'overlay',
      success: 'success',
      successSurface: 'successSurface',
      surface: 'surface',
      surfaceSubtle: 'surfaceSubtle',
      textSecondary: 'textSecondary',
      textSubtle: 'textSubtle',
    },
  }),
}));
vi.mock('../attendance/attendance-control', () => ({
  AttendanceChoiceButtons: 'AttendanceChoiceButtons',
}));
vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('../ui/icons/app-icon', () => ({ AppIcon: 'AppIcon' }));

import {
  ParticipantEditorAuthorizationRedirect,
  ParticipantEditorGroup,
} from './participant-editor-screen';
import type { ParticipantEditorPlayer } from './participant-editor-model';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('participant editor presentation', () => {
  it('redirects unauthorized route access back to Match Detail', () => {
    const redirect = ParticipantEditorAuthorizationRedirect({
      matchId: 'match-1',
    }) as TestElement;

    expect(redirect.type).toBe('Redirect');
    expect(redirect.props.href).toBe('/matches/match-1');
  });

  it('renders persistent guest Players with direct compact actions', () => {
    const onChange = vi.fn();
    const group = ParticipantEditorGroup({
      attendance: null,
      errors: new Map(),
      label: 'attendance.unanswered',
      pendingAttendances: new Map(),
      players: [player('guest-1', 'Guest Pat', null, 'GUEST')],
      onChange,
    }) as TestElement;
    const control = descendants(group).find(
      ({ type }) => type === 'AttendanceChoiceButtons',
    );

    expect(textValues(group)).toContain('common.guest');
    expect(textValues(group)).not.toContain('attendance.unanswered');
    expect(control?.props.compact).toBe(true);
    expect(control?.props.attendance).toBeNull();
    invokeWith(control?.props.onChange, 'GOING');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('guest-1', null, 'GOING');
  });

  it.each([['GOING'], ['NOT_GOING'], [null]] as const)(
    'keeps both semantic actions visible for the %s state',
    (attendance) => {
      const group = participantGroup({ attendance });
      const control = descendants(group).find(
        ({ type }) => type === 'AttendanceChoiceButtons',
      );

      expect(control?.props.attendance).toBe(attendance);
      expect(control?.props.compact).toBe(true);
      expect(control?.props.disabled).toBe(false);
      expect(textValues(group)).not.toContain('attendance.unanswered');
      expect(textValues(group)).not.toContain('common.guest');
    },
  );

  it('limits pending state to the changed row', () => {
    const players = [
      player('player-1', 'Ada', 'GOING'),
      player('player-2', 'Bea', 'GOING'),
    ];
    const group = ParticipantEditorGroup({
      attendance: 'GOING',
      errors: new Map(),
      label: 'attendance.going',
      pendingAttendances: new Map([['player-1', 'NOT_GOING']]),
      players,
      onChange: vi.fn(),
    }) as TestElement;
    const controls = descendants(group).filter(
      ({ type }) => type === 'AttendanceChoiceButtons',
    );

    expect(controls[0]?.props.disabled).toBe(true);
    expect(controls[0]?.props.pendingAttendance).toBe('NOT_GOING');
    expect(controls[1]?.props.disabled).toBe(false);
    expect(controls[1]?.props.pendingAttendance).toBeUndefined();
  });

  it('keeps an authoritative failed state visible and retryable in-row', () => {
    const onChange = vi.fn();
    const group = ParticipantEditorGroup({
      attendance: 'GOING',
      errors: new Map([
        ['player-1', { tone: 'error', text: 'attendance.participantFailed' }],
      ]),
      label: 'attendance.going',
      pendingAttendances: new Map(),
      players: [player('player-1', 'Ada', 'GOING')],
      onChange,
    }) as TestElement;
    const control = descendants(group).find(
      ({ type }) => type === 'AttendanceChoiceButtons',
    );

    expect(control?.props.attendance).toBe('GOING');
    expect(control?.props.disabled).toBe(false);
    expect(textValues(group)).toContain('attendance.participantFailed');
    invokeWith(control?.props.onChange, 'NOT_GOING');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      'player-1',
      'GOING',
      'NOT_GOING',
    );
  });
});

function participantGroup({
  attendance,
}: {
  attendance: ParticipantEditorPlayer['attendance'];
}): TestElement {
  return ParticipantEditorGroup({
    attendance,
    errors: new Map(),
    label: 'attendance.group',
    pendingAttendances: new Map(),
    players: [player('player-1', 'Ada', attendance)],
    onChange: vi.fn(),
  }) as TestElement;
}

function player(
  id: string,
  name: string,
  attendance: ParticipantEditorPlayer['attendance'],
  type: ParticipantEditorPlayer['type'] = 'REGULAR',
): ParticipantEditorPlayer {
  return {
    attendance,
    avatarUrl: null,
    id,
    name,
    status: 'ACTIVE',
    type,
  };
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

function invokeWith(value: unknown, argument: unknown): void {
  if (typeof value === 'function') value(argument);
}

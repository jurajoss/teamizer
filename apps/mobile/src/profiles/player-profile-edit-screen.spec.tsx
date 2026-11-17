import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  Redirect: 'Redirect',
  useNavigation: () => ({
    addListener: vi.fn(() => vi.fn()),
    dispatch: vi.fn(),
  }),
}));
vi.mock('react-native', () => ({
  Alert: { alert: vi.fn() },
  StyleSheet: { create: <T,>(styles: T) => styles },
  View: 'View',
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));
vi.mock('@teamizer/ui', () => ({
  AppText: 'AppText',
  Avatar: 'Avatar',
  Button: 'Button',
  Card: 'Card',
  FeedbackBanner: 'FeedbackBanner',
  NumberStepper: 'NumberStepper',
  spacing: { md: 16, sm: 12, xs: 8, xxs: 4 },
  TextField: 'TextField',
}));
vi.mock('../ui/app-screen', () => ({ AppScreen: 'AppScreen' }));
vi.mock('./avatar-manager', () => ({ AvatarManager: 'AvatarManager' }));

import type { AdminPlayerDetail, PlayerDetail } from '../api/contracts';
import { AdminEditContent, OwnEditContent } from './player-profile-edit-screen';

type TestElement = ReactElement<{
  [key: string]: unknown;
  children?: ReactNode;
}>;

describe('shared Player profile editor presentation', () => {
  it('keeps regular self-editing limited to public identity', () => {
    const player = publicPlayer();
    const view = OwnEditContent({
      controller: ownController(),
      player,
    } as never) as TestElement;

    expect(
      descendants(view).filter(({ type }) => type === 'AvatarManager'),
    ).toHaveLength(1);
    expect(
      descendants(view).filter(({ type }) => type === 'NumberStepper'),
    ).toHaveLength(0);
    expect(textValues(view)).not.toContain('adminPlayer.accountAccess');
    expect(buttonLabels(view)).toEqual(['profile.saveChanges']);
  });

  it('shows compact 1–10 ratings, invitation controls, and activation only to an administrator', () => {
    const view = adminView(adminPlayer({ state: 'UNLINKED' }));
    const steppers = descendants(view).filter(
      ({ type }) => type === 'NumberStepper',
    );

    expect(steppers).toHaveLength(5);
    for (const stepper of steppers) {
      expect(stepper.props).toMatchObject({ maximum: 10, minimum: 1 });
    }
    expect(textValues(view)).toContain('adminPlayer.accountAccess');
    expect(buttonLabels(view)).toEqual(
      expect.arrayContaining([
        'adminPlayer.sendInvitation',
        'adminPlayer.advancedOptions',
        'adminPlayer.deactivate',
        'profile.saveChanges',
      ]),
    );
  });

  it('renders a pending invitation as resendable and hides account controls once linked', () => {
    const invited = adminView(
      adminPlayer({
        state: 'INVITED',
        email: 'player@example.com',
        invitationStatus: 'SENT',
      }),
    );
    const registered = adminView(adminPlayer({ state: 'REGISTERED' }));

    expect(textValues(invited)).toEqual(
      expect.arrayContaining([
        'adminPlayer.invitationPending',
        'player@example.com',
      ]),
    );
    expect(buttonLabels(invited)).toContain('adminPlayer.resendInvitation');
    expect(textValues(registered)).not.toContain('adminPlayer.accountAccess');
    expect(buttonLabels(registered)).not.toContain(
      'adminPlayer.sendInvitation',
    );
  });

  it('offers reactivation for an inactive Player without changing the shared form', () => {
    const view = adminView({
      ...adminPlayer({ state: 'REGISTERED' }),
      status: 'INACTIVE',
    });

    expect(buttonLabels(view)).toContain('adminPlayer.reactivate');
    expect(buttonLabels(view)).not.toContain('adminPlayer.deactivate');
  });
});

function adminView(player: AdminPlayerDetail): TestElement {
  return AdminEditContent({
    administrationDisabled: false,
    controller: adminController(),
    player,
  } as never) as TestElement;
}

function publicPlayer(): PlayerDetail {
  return {
    avatarUrl: null,
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Ada',
    status: 'ACTIVE',
    type: 'REGULAR',
    statistics: {
      attendance: { percentage: 50, playedMatches: 1, totalMatches: 2 },
      draws: 0,
      goals: 2,
      goalsPerMatch: 2,
      losses: 0,
      matches: 1,
      winRate: 1,
      wins: 1,
    },
  };
}

function adminPlayer(account: AdminPlayerDetail['account']): AdminPlayerDetail {
  return {
    ...publicPlayer(),
    account,
    attributes: {
      attack: 5,
      defense: 5,
      endurance: 5,
      speed: 5,
      technique: 5,
    },
    type: 'GUEST',
  };
}

function ownController() {
  return {
    avatarPending: false,
    canSaveName: false,
    errorMessage: null,
    message: null,
    name: 'Ada',
    namePending: false,
    removeAvatar: vi.fn(),
    saveName: vi.fn(),
    setName: vi.fn(),
    uploadAvatar: vi.fn(),
  };
}

function adminController() {
  return {
    attributes: {
      attack: 5,
      defense: 5,
      endurance: 5,
      speed: 5,
      technique: 5,
    },
    authProviderId: '',
    avatarPending: false,
    busy: false,
    canSaveDetails: false,
    canSubmitInvitation: true,
    cancelDeactivation: vi.fn(),
    confirmDeactivation: vi.fn(),
    confirmingDeactivation: false,
    conversionPending: false,
    convert: vi.fn(),
    errorMessage: null,
    invitationEmail: 'player@example.com',
    invitationEmailValid: true,
    invitationPending: false,
    invite: vi.fn(),
    message: null,
    name: 'Ada',
    removeAvatar: vi.fn(),
    removeAvatarPending: false,
    requestStatusChange: vi.fn(),
    saveDetails: vi.fn(),
    setAttribute: vi.fn(),
    setAuthProviderId: vi.fn(),
    setInvitationEmail: vi.fn(),
    setName: vi.fn(),
    showAdvancedConversion: false,
    toggleAdvancedConversion: vi.fn(),
    updatePending: false,
    uploadAvatar: vi.fn(),
  };
}

function descendants(node: ReactNode): TestElement[] {
  if (!isValidElement(node)) return [];
  const element = node as TestElement;
  const rendered =
    typeof element.type === 'function'
      ? (element.type as (props: TestElement['props']) => ReactNode)(
          element.props,
        )
      : element.props.children;
  return [element, ...Children.toArray(rendered).flatMap(descendants)];
}

function textValues(node: ReactNode): unknown[] {
  return descendants(node)
    .filter(({ type }) => type === 'AppText')
    .map(({ props }) => props.children);
}

function buttonLabels(node: ReactNode): unknown[] {
  return descendants(node)
    .filter(({ type }) => type === 'Button')
    .map(({ props }) => props.label);
}

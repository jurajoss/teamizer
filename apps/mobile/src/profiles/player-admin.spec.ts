import { describe, expect, it } from 'vitest';

import {
  asyncContentState,
  canAccessPlayerAdministration,
  canInviteGuest,
  canSubmitGuestInvitation,
  isValidInvitationEmail,
  normalizeInvitationEmail,
  requiresDeactivationConfirmation,
} from './player-admin';

describe('Player profile and administration presentation', () => {
  it('keeps Player administration navigation ADMIN-only', () => {
    expect(canAccessPlayerAdministration('ADMIN')).toBe(true);
    expect(canAccessPlayerAdministration('PLAYER')).toBe(false);
  });

  it('shows invitation and UID fallback controls only for an ADMIN viewing a Guest', () => {
    expect(canInviteGuest('ADMIN', 'GUEST')).toBe(true);
    expect(canInviteGuest('ADMIN', 'REGULAR')).toBe(false);
    expect(canInviteGuest('PLAYER', 'GUEST')).toBe(false);
  });

  it('selects intentional loading, error, empty, and ready states', () => {
    expect(asyncContentState(true, false, 0)).toBe('LOADING');
    expect(asyncContentState(false, true, 0)).toBe('ERROR');
    expect(asyncContentState(false, false, 0)).toBe('EMPTY');
    expect(asyncContentState(false, false, 1)).toBe('READY');
  });

  it('requires confirmation only for the destructive deactivation transition', () => {
    expect(requiresDeactivationConfirmation('ACTIVE')).toBe(true);
    expect(requiresDeactivationConfirmation('INACTIVE')).toBe(false);
  });

  it('normalizes and validates the primary email invitation input', () => {
    expect(normalizeInvitationEmail('  PLAYER@Example.COM ')).toBe(
      'player@example.com',
    );
    expect(isValidInvitationEmail(' player@example.com ')).toBe(true);
    expect(isValidInvitationEmail('not-an-email')).toBe(false);
    expect(isValidInvitationEmail('')).toBe(false);
    expect(canSubmitGuestInvitation('player@example.com', false, false)).toBe(
      true,
    );
    expect(canSubmitGuestInvitation('player@example.com', true, false)).toBe(
      false,
    );
    expect(canSubmitGuestInvitation('player@example.com', false, true)).toBe(
      false,
    );
  });
});

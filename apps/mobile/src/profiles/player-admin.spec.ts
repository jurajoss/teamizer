import { describe, expect, it } from 'vitest';

import { ApiClientError } from '../api/authenticated-api-client';

import {
  asyncContentState,
  canAccessPlayerAdministration,
  canInviteGuest,
  canSubmitGuestInvitation,
  guestConversionErrorMessage,
  isValidInvitationEmail,
  normalizeInvitationEmail,
  playerKindLabel,
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

  it('presents guest account linkage without exposing a Firebase identity', () => {
    expect(playerKindLabel('GUEST')).toBe('Guest · no account');
    expect(playerKindLabel('REGULAR')).toBe('Regular · account linked');
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

  it('distinguishes safe guest-conversion failure causes for administrators', () => {
    expect(
      guestConversionErrorMessage(
        new ApiClientError(422, 'FIREBASE_IDENTITY_NOT_FOUND', 'provider text'),
      ),
    ).toContain('No Firebase identity');
    expect(
      guestConversionErrorMessage(
        new ApiClientError(409, 'AUTH_PROVIDER_ALREADY_LINKED', 'conflict'),
      ),
    ).toContain('already linked');
    expect(
      guestConversionErrorMessage(
        new ApiClientError(503, 'IDENTITY_PROVIDER_UNAVAILABLE', 'unavailable'),
      ),
    ).toContain('credentials');
    expect(
      guestConversionErrorMessage(
        new ApiClientError(403, 'FORBIDDEN', 'forbidden'),
      ),
    ).toContain('active administrator');
    expect(
      guestConversionErrorMessage(
        new ApiClientError(0, 'NETWORK_ERROR', 'network'),
      ),
    ).toContain('could not be reached');
  });
});

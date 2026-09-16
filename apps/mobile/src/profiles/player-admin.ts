export function canAccessPlayerAdministration(role: 'PLAYER' | 'ADMIN') {
  return role === 'ADMIN';
}

export function canInviteGuest(
  role: 'PLAYER' | 'ADMIN',
  playerType: 'REGULAR' | 'GUEST',
): boolean {
  return role === 'ADMIN' && playerType === 'GUEST';
}

export type AsyncContentState = 'LOADING' | 'ERROR' | 'EMPTY' | 'READY';

export function asyncContentState(
  pending: boolean,
  error: boolean,
  itemCount: number,
): AsyncContentState {
  if (pending) return 'LOADING';
  if (error) return 'ERROR';
  return itemCount === 0 ? 'EMPTY' : 'READY';
}

export function playerKindLabel(type: 'REGULAR' | 'GUEST'): string {
  return type === 'GUEST' ? 'Guest · no account' : 'Regular · account linked';
}

export function requiresDeactivationConfirmation(
  status: 'ACTIVE' | 'INACTIVE',
): boolean {
  return status === 'ACTIVE';
}

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidInvitationEmail(email: string): boolean {
  return inviteGuestInputSchema.safeParse({ email }).success;
}

export function canSubmitGuestInvitation(
  email: string,
  busy: boolean,
  administrationDisabled: boolean,
): boolean {
  return isValidInvitationEmail(email) && !busy && !administrationDisabled;
}

export function guestConversionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiClientError)) {
    return 'The guest could not be converted. Try again.';
  }
  switch (error.code) {
    case 'FIREBASE_IDENTITY_NOT_FOUND':
      return 'No Firebase identity with that UID exists in the API’s configured Firebase project.';
    case 'AUTH_PROVIDER_ALREADY_LINKED':
      return 'That Firebase identity is already linked to another Teamizer Player.';
    case 'PLAYER_ALREADY_HAS_USER':
      return 'This Player already has a Teamizer account.';
    case 'IDENTITY_PROVIDER_UNAVAILABLE':
      return 'The API cannot verify Firebase identities right now. Check its Firebase Admin project, credentials, and permissions.';
    case 'FORBIDDEN':
    case 'PLAYER_INACTIVE':
      return 'An active administrator is required to convert a guest.';
    case 'UNAUTHENTICATED':
    case 'AUTH_SESSION_UNAVAILABLE':
      return 'Your administrator session is no longer available. Sign in again.';
    case 'NETWORK_ERROR':
      return 'The Teamizer API could not be reached. Check the connection and try again.';
    default:
      return 'The guest could not be converted. Try again.';
  }
}
import { ApiClientError } from '../api/authenticated-api-client';
import { inviteGuestInputSchema } from '../api/contracts';

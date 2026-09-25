import { inviteGuestInputSchema } from '../api/contracts';

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

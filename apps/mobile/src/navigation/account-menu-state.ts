export type AccountMenuState = 'closed' | 'open';
export type AccountMenuEvent = 'CLOSE' | 'OPEN';

export function accountMenuVisibility(
  _state: AccountMenuState,
  event: AccountMenuEvent,
): AccountMenuState {
  return event === 'OPEN' ? 'open' : 'closed';
}

export function accountMenuActionsForRole(role: 'PLAYER' | 'ADMIN') {
  return role === 'ADMIN'
    ? (['profile', 'settings', 'administration', 'signOut'] as const)
    : (['profile', 'settings', 'signOut'] as const);
}

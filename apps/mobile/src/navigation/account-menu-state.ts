export type AccountMenuState = 'closed' | 'open';
export type AccountMenuEvent = 'CLOSE' | 'OPEN';
export type AccountMenuItemKey =
  'profile' | 'settings' | 'administration' | 'logout';

export function accountMenuVisibility(
  _state: AccountMenuState,
  event: AccountMenuEvent,
): AccountMenuState {
  return event === 'OPEN' ? 'open' : 'closed';
}

export function accountMenuItemKeysForRole(
  role: 'PLAYER' | 'ADMIN',
): AccountMenuItemKey[] {
  return role === 'ADMIN'
    ? ['profile', 'settings', 'administration', 'logout']
    : ['profile', 'settings', 'logout'];
}

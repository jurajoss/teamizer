import { describe, expect, it } from 'vitest';

import {
  accountMenuItemKeysForRole,
  accountMenuVisibility,
} from './account-menu-state';
import {
  authenticatedHeaderKind,
  authenticatedHeaderPolicy,
  authenticatedHeaderTitleAlignment,
  nestedBackFallback,
} from './header-policy';

describe('authenticated navigation chrome', () => {
  it('uses an account-enabled titled header without Back on every primary root', () => {
    expect(authenticatedHeaderPolicy('primary')).toEqual({
      showAccount: true,
      showBack: false,
      showTitle: true,
      titleAlignment: 'center',
    });
    expect(authenticatedHeaderKind('/home')).toBe('primary');
    expect(authenticatedHeaderKind('/matches')).toBe('primary');
    expect(authenticatedHeaderKind('/players')).toBe('primary');
    expect(authenticatedHeaderKind('/statistics')).toBe('primary');
  });

  it('uses Back, a centered title, and account access on nested screens', () => {
    expect(authenticatedHeaderPolicy('nested')).toEqual({
      showAccount: true,
      showBack: true,
      showTitle: true,
      titleAlignment: 'center',
    });
    expect(authenticatedHeaderKind('/matches/match-id')).toBe('nested');
    expect(authenticatedHeaderKind('/profile')).toBe('nested');
  });

  it('uses the native geometrically centered title slot for roots and nested routes', () => {
    expect(authenticatedHeaderTitleAlignment('primary')).toBe('center');
    expect(authenticatedHeaderTitleAlignment('nested')).toBe('center');
  });

  it('opens and closes the account menu deterministically', () => {
    expect(accountMenuVisibility('closed', 'OPEN')).toBe('open');
    expect(accountMenuVisibility('open', 'CLOSE')).toBe('closed');
  });

  it('keeps account destinations role-aware and Logout secondary', () => {
    expect(accountMenuItemKeysForRole('PLAYER')).toEqual([
      'profile',
      'settings',
      'logout',
    ]);
    expect(accountMenuItemKeysForRole('ADMIN')).toEqual([
      'profile',
      'settings',
      'administration',
      'logout',
    ]);
  });

  it('provides canonical Back fallbacks for direct nested entry', () => {
    expect(nestedBackFallback('/matches/match-id')).toBe('/matches');
    expect(nestedBackFallback('/players/player-id')).toBe('/players');
    expect(nestedBackFallback('/admin/matches/create')).toBe('/admin/matches');
    expect(nestedBackFallback('/admin/players/player-id')).toBe(
      '/admin/players',
    );
    expect(nestedBackFallback('/profile')).toBe('/home');
  });
});

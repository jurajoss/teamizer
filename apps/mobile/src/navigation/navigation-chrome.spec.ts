import { describe, expect, it } from 'vitest';

import {
  accountMenuItemKeysForRole,
  accountMenuVisibility,
} from './account-menu-state';
import {
  authenticatedHeaderKind,
  authenticatedHeaderPolicy,
  authenticatedHeaderTitleAlignment,
  homeNativeHeaderTitle,
  nestedBackFallback,
} from './header-policy';
import { primaryDestinations } from './primary-navigation';

describe('authenticated navigation chrome', () => {
  it('uses an account-enabled titled header without Back on every primary root', () => {
    expect(authenticatedHeaderPolicy('primary')).toEqual({
      showAccount: true,
      showBack: false,
      showTitle: true,
    });
    expect(authenticatedHeaderKind('/home')).toBe('primary');
    expect(authenticatedHeaderKind('/matches')).toBe('primary');
    expect(authenticatedHeaderKind('/players')).toBe('nested');
    expect(authenticatedHeaderKind('/rankings')).toBe('primary');
  });

  it('keeps the Home native title branded while its tab label stays localized', () => {
    expect(homeNativeHeaderTitle).toBe('Teamizer');
    expect(primaryDestinations[0]).toMatchObject({
      href: '/home',
      labelKey: 'nav.home',
    });
  });

  it('uses Back without global account access on nested screens', () => {
    expect(authenticatedHeaderPolicy('nested')).toEqual({
      showAccount: false,
      showBack: true,
      showTitle: true,
    });
    expect(authenticatedHeaderKind('/matches/match-id')).toBe('nested');
    expect(authenticatedHeaderKind('/profile')).toBe('nested');
  });

  it('uses native platform title alignment', () => {
    expect(authenticatedHeaderTitleAlignment('primary', 'ios')).toBe('center');
    expect(authenticatedHeaderTitleAlignment('nested', 'ios')).toBe('center');
    expect(authenticatedHeaderTitleAlignment('primary', 'android')).toBe(
      'left',
    );
    expect(authenticatedHeaderTitleAlignment('nested', 'android')).toBe('left');
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
    expect(nestedBackFallback('/matches/match-id/edit-teams')).toBe(
      '/matches/match-id',
    );
    expect(nestedBackFallback('/matches/match-id/edit-participants')).toBe(
      '/matches/match-id',
    );
    expect(nestedBackFallback('/players/player-id')).toBe('/rankings');
    expect(nestedBackFallback('/admin/matches/create')).toBe('/admin/matches');
    expect(nestedBackFallback('/admin/players/player-id')).toBe(
      '/admin/players',
    );
    expect(nestedBackFallback('/profile')).toBe('/home');
  });
});

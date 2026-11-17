import { describe, expect, it } from 'vitest';

import {
  activePrimaryDestination,
  authenticatedFeatureContentKey,
  authenticatedShellPresentation,
  authenticatedShellPresentationForPath,
  isPrimaryRootPath,
  initialPrimaryDestination,
  primaryDestinations,
  primaryNavigationTarget,
  shellCompositionForMode,
} from './primary-navigation';

describe('primary authenticated navigation', () => {
  it('defines the three canonical primary destinations once', () => {
    expect(primaryDestinations).toEqual([
      {
        key: 'home',
        href: '/home',
        icon: 'home',
        labelKey: 'nav.home',
      },
      {
        key: 'matches',
        href: '/matches',
        icon: 'matches',
        labelKey: 'nav.matches',
      },
      {
        key: 'rankings',
        href: '/rankings',
        icon: 'rankings',
        labelKey: 'nav.rankings',
      },
    ]);
  });

  it('resolves primary roots and their canonical details without matching admin paths', () => {
    expect(activePrimaryDestination('/home')).toBe('home');
    expect(activePrimaryDestination('/matches')).toBe('matches');
    expect(activePrimaryDestination('/matches/match-id')).toBe('matches');
    expect(activePrimaryDestination('/players/player-id')).toBeNull();
    expect(activePrimaryDestination('/players/player-id/matches')).toBeNull();
    expect(activePrimaryDestination('/rankings/')).toBe('rankings');
    expect(activePrimaryDestination('/admin/matches')).toBeNull();
    expect(activePrimaryDestination('/profile')).toBeNull();
  });

  it('retains the originating tab while a shared Player profile is open', () => {
    expect(activePrimaryDestination('/players/player-id')).toBeNull();
    expect(initialPrimaryDestination('/players/player-id')).toBe('rankings');
  });

  it('does not replace the current root but exits a detail to its selected root', () => {
    const matches = primaryDestinations[1];
    expect(matches).toBeDefined();
    expect(primaryNavigationTarget('/matches', matches!)).toBeNull();
    expect(primaryNavigationTarget('/matches/match-id', matches!)).toBe(
      '/matches',
    );
    expect(isPrimaryRootPath('/players')).toBe(false);
    expect(isPrimaryRootPath('/players/player-id')).toBe(false);
  });

  it('selects bottom navigation for phone and sidebar for tablet', () => {
    expect(shellCompositionForMode('phone')).toBe('bottom-navigation');
    expect(shellCompositionForMode('tablet')).toBe('sidebar');
  });

  it('removes primary navigation chrome for a focused workflow', () => {
    expect(shellCompositionForMode('phone', true)).toBeNull();
    expect(shellCompositionForMode('tablet', true)).toBeNull();
  });

  it('shows primary navigation only on exact primary roots', () => {
    expect(
      authenticatedShellPresentationForPath('phone', '/matches'),
    ).toMatchObject({
      ownership: { bottom: true, left: false },
      showBottomNavigation: true,
      showSidebar: false,
    });
    expect(
      authenticatedShellPresentationForPath('tablet', '/rankings/'),
    ).toMatchObject({
      ownership: { bottom: false, left: true },
      showBottomNavigation: false,
      showSidebar: true,
    });
    expect(
      authenticatedShellPresentationForPath('phone', '/matches/match-id'),
    ).toMatchObject({
      ownership: { bottom: false, left: false },
      showBottomNavigation: false,
      showSidebar: false,
    });
    expect(
      authenticatedShellPresentationForPath('tablet', '/settings'),
    ).toMatchObject({
      ownership: { bottom: false, left: false },
      showBottomNavigation: false,
      showSidebar: false,
    });
  });

  it.each(['phone', 'tablet'] as const)(
    'keeps feature-content identity stable when %s navigation hides',
    (mode) => {
      const visible = authenticatedShellPresentation(mode, false);
      const hidden = authenticatedShellPresentation(mode, true);

      expect(visible.contentKey).toBe(authenticatedFeatureContentKey);
      expect(hidden.contentKey).toBe(visible.contentKey);
      expect(authenticatedShellPresentation(mode, false).ownership).toBe(
        visible.ownership,
      );
      expect(hidden).toMatchObject({
        ownership: { bottom: false, left: false },
        showBottomNavigation: false,
        showSidebar: false,
      });
    },
  );

  it('keeps feature-content identity stable across the responsive breakpoint', () => {
    const phone = authenticatedShellPresentation('phone', false);
    const tablet = authenticatedShellPresentation('tablet', false);

    expect(phone.contentKey).toBe(tablet.contentKey);
    expect(phone).toMatchObject({
      ownership: { bottom: true, left: false },
      showBottomNavigation: true,
      showSidebar: false,
    });
    expect(tablet).toMatchObject({
      ownership: { bottom: false, left: true },
      showBottomNavigation: false,
      showSidebar: true,
    });
  });
});

import { describe, expect, it } from 'vitest';

import {
  activePrimaryDestination,
  authenticatedFeatureContentKey,
  authenticatedShellPresentation,
  isPrimaryRootPath,
  primaryDestinations,
  primaryNavigationTarget,
  shellCompositionForMode,
} from './primary-navigation';

describe('primary authenticated navigation', () => {
  it('defines the four canonical primary destinations once', () => {
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
        key: 'players',
        href: '/players',
        icon: 'players',
        labelKey: 'nav.players',
      },
      {
        key: 'statistics',
        href: '/statistics',
        icon: 'statistics',
        labelKey: 'nav.statistics',
      },
    ]);
  });

  it('resolves primary roots and their canonical details without matching admin paths', () => {
    expect(activePrimaryDestination('/home')).toBe('home');
    expect(activePrimaryDestination('/matches')).toBe('matches');
    expect(activePrimaryDestination('/matches/match-id')).toBe('matches');
    expect(activePrimaryDestination('/players/player-id')).toBe('players');
    expect(activePrimaryDestination('/statistics/')).toBe('statistics');
    expect(activePrimaryDestination('/admin/matches')).toBeNull();
    expect(activePrimaryDestination('/profile')).toBeNull();
  });

  it('does not replace the current root but exits a detail to its selected root', () => {
    const matches = primaryDestinations[1];
    expect(matches).toBeDefined();
    expect(primaryNavigationTarget('/matches', matches!)).toBeNull();
    expect(primaryNavigationTarget('/matches/match-id', matches!)).toBe(
      '/matches',
    );
    expect(isPrimaryRootPath('/players')).toBe(true);
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

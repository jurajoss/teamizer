import { describe, expect, it } from 'vitest';

import { teamizerIconNames, teamizerIconSymbols } from './app-icon-map';

describe('Teamizer icon mapping', () => {
  it('owns the centralized application icon vocabulary', () => {
    expect(teamizerIconNames).toEqual([
      'home',
      'matches',
      'players',
      'rankings',
      'back',
      'account',
      'settings',
      'administration',
      'logout',
      'add',
      'remove',
      'complete',
      'next',
      'location',
      'edit',
      'decline',
      'trophy',
      'football',
      'history',
      'regenerate',
      'play',
      'drag',
      'swap',
    ]);
    expect(Object.keys(teamizerIconSymbols).sort()).toEqual(
      [...teamizerIconNames].sort(),
    );
  });

  it('provides an iOS, Android, and web symbol for every Teamizer icon', () => {
    for (const name of teamizerIconNames) {
      expect(teamizerIconSymbols[name]).toEqual({
        ios: expect.any(String),
        android: expect.any(String),
        web: expect.any(String),
      });
    }
  });

  it('maps recent wins to the cross-platform history symbol', () => {
    expect(teamizerIconSymbols.history).toEqual({
      ios: 'clock.arrow.circlepath',
      android: 'history',
      web: 'history',
    });
  });
});

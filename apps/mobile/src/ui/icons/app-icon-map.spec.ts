import { describe, expect, it } from 'vitest';

import { teamizerIconNames, teamizerIconSymbols } from './app-icon-map';

describe('Teamizer icon mapping', () => {
  it('owns exactly the icons required by the navigation shell and account menu', () => {
    expect(teamizerIconNames).toEqual([
      'home',
      'matches',
      'players',
      'statistics',
      'back',
      'account',
      'settings',
      'administration',
      'logout',
      'remove',
      'complete',
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
});

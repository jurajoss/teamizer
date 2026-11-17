import { describe, expect, it } from 'vitest';

import {
  matchLifecycleDestination,
  matchViewportKey,
} from './match-navigation';

describe('Match navigation', () => {
  it.each([
    ['OPEN_FOR_REGISTRATION', 'PRE_MATCH_DETAIL'],
    ['IN_PROGRESS', 'SCORING'],
    ['FINISHED', 'FINISHED_DETAIL'],
    ['CANCELLED', 'CANCELLED_DETAIL'],
  ] as const)('routes %s to %s', (status, destination) => {
    expect(matchLifecycleDestination(status)).toBe(destination);
  });

  it('resets the viewport across lifecycle and scoring presentation transitions', () => {
    expect(matchViewportKey('OPEN_FOR_REGISTRATION')).not.toBe(
      matchViewportKey('IN_PROGRESS', 'SCORING'),
    );
    expect(matchViewportKey('IN_PROGRESS', 'SCORING')).not.toBe(
      matchViewportKey('FINISHED'),
    );
  });
});

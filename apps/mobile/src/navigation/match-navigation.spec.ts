import { describe, expect, it } from 'vitest';

import { matchViewportKey } from './match-navigation';

describe('Match navigation', () => {
  it('resets the viewport across lifecycle and scoring presentation transitions', () => {
    expect(matchViewportKey('OPEN_FOR_REGISTRATION')).not.toBe(
      matchViewportKey('IN_PROGRESS', 'READY_TO_START'),
    );
    expect(matchViewportKey('IN_PROGRESS', 'READY_TO_START')).not.toBe(
      matchViewportKey('IN_PROGRESS', 'SCORING'),
    );
    expect(matchViewportKey('IN_PROGRESS', 'SCORING')).not.toBe(
      matchViewportKey('FINISHED'),
    );
  });
});

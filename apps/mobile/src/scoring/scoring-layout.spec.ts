import { describe, expect, it } from 'vitest';

import { SCORING_PLAYER_GOAL_TARGET_MIN_HEIGHT } from './scoring-layout';

describe('scoring layout', () => {
  it('keeps the whole Player row as a large goal-entry target after avatar integration', () => {
    expect(SCORING_PLAYER_GOAL_TARGET_MIN_HEIGHT).toBeGreaterThanOrEqual(64);
  });
});

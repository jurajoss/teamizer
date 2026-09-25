import { describe, expect, it } from 'vitest';

import {
  SCORING_PLAYER_TILE_MIN_HEIGHT,
  SCORING_SCORE_PANEL_MIN_HEIGHT,
  SCORING_SCOREBOARD_PHONE_MAX_WIDTH,
  SCORING_STICKY_SCORE_INDEX,
} from './scoring-layout';

describe('scoring layout', () => {
  it('keeps the whole Player tile compact but comfortably tappable', () => {
    expect(SCORING_PLAYER_TILE_MIN_HEIGHT).toBeGreaterThanOrEqual(80);
    expect(SCORING_PLAYER_TILE_MIN_HEIGHT).toBeLessThanOrEqual(90);
  });

  it('keeps the phone scoreboard within the approved compact proportions', () => {
    expect(SCORING_SCORE_PANEL_MIN_HEIGHT).toBeLessThanOrEqual(68);
    expect(SCORING_SCOREBOARD_PHONE_MAX_WIDTH).toBeLessThanOrEqual(320);
  });

  it('keeps only the score as the first and sticky child', () => {
    expect(SCORING_STICKY_SCORE_INDEX).toBe(0);
  });
});

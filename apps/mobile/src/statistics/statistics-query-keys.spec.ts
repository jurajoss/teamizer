import { describe, expect, it } from 'vitest';

import { statisticsQueryKeys } from './statistics-query-keys';

describe('statistics query keys', () => {
  it('keeps Home summary and recent history separate from detail pagination caches', () => {
    const playerId = 'player-id';

    expect(statisticsQueryKeys.summary(playerId)).not.toEqual(
      statisticsQueryKeys.player(playerId),
    );
    expect(statisticsQueryKeys.recentHistory(playerId)).not.toEqual(
      statisticsQueryKeys.history(playerId),
    );
  });
});

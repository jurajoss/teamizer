import { describe, expect, it, vi } from 'vitest';

import { refreshUpcomingMatchesAfterCreation } from './admin-match-query-keys';
import { matchQueryKeys } from './match-query-keys';

describe('ADMIN Match cache updates', () => {
  it('refetches Home discovery after one-off or scheduled creation', async () => {
    const queryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await refreshUpcomingMatchesAfterCreation(queryClient);

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: matchQueryKeys.upcoming,
      refetchType: 'all',
    });
  });
});

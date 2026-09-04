import type { QueryClient } from '@tanstack/react-query';

import { matchQueryKeys } from './match-query-keys';

export const adminMatchQueryKeys = {
  root: ['admin', 'match-management'] as const,
  sports: ['admin', 'match-management', 'sports'] as const,
  schedule: ['admin', 'match-management', 'schedule'] as const,
};

type AdminMatchQueryClient = Pick<QueryClient, 'invalidateQueries'>;

export async function refreshUpcomingMatchesAfterCreation(
  queryClient: AdminMatchQueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: matchQueryKeys.upcoming,
    refetchType: 'all',
  });
}

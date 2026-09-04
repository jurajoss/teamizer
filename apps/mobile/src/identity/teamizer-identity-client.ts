import type { QueryClient } from '@tanstack/react-query';

import { ApiClientError } from '../api/authenticated-api-client';
import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { CurrentUser, OnboardingInput } from '../api/contracts';
import { matchQueryKeys } from '../matches/match-query-keys';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';

export interface TeamizerIdentityClient {
  getCurrentUser(firebaseUid: string): Promise<CurrentUser>;
  onboard(firebaseUid: string, input: OnboardingInput): Promise<CurrentUser>;
  clear(firebaseUid: string): void;
}

export class QueryTeamizerIdentityClient implements TeamizerIdentityClient {
  constructor(
    private readonly queryClient: QueryClient,
    private readonly apiClient: AuthenticatedApiClient,
  ) {}

  getCurrentUser(firebaseUid: string): Promise<CurrentUser> {
    return this.queryClient.fetchQuery({
      queryKey: this.currentUserQueryKey(firebaseUid),
      queryFn: () => this.apiClient.getCurrentUser(),
      retry: false,
      staleTime: 0,
    });
  }

  async onboard(
    firebaseUid: string,
    input: OnboardingInput,
  ): Promise<CurrentUser> {
    try {
      await this.apiClient.onboard(input);
    } catch (error) {
      if (
        !(error instanceof ApiClientError) ||
        error.code !== 'USER_ALREADY_ONBOARDED'
      ) {
        throw error;
      }
    }

    this.clear(firebaseUid);
    return this.getCurrentUser(firebaseUid);
  }

  clear(firebaseUid: string): void {
    this.queryClient.removeQueries({
      queryKey: this.currentUserQueryKey(firebaseUid),
      exact: true,
    });
    this.queryClient.removeQueries({ queryKey: matchQueryKeys.root });
    this.queryClient.removeQueries({ queryKey: statisticsQueryKeys.root });
  }

  private currentUserQueryKey(firebaseUid: string) {
    return ['teamizer', 'current-user', firebaseUid] as const;
  }
}

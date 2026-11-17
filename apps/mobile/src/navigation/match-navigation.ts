import type { MatchDetail } from '../api/contracts';

export type MatchLifecycleDestination =
  'PRE_MATCH_DETAIL' | 'SCORING' | 'FINISHED_DETAIL' | 'CANCELLED_DETAIL';

export function matchLifecycleDestination(
  status: MatchDetail['status'],
): MatchLifecycleDestination {
  switch (status) {
    case 'OPEN_FOR_REGISTRATION':
      return 'PRE_MATCH_DETAIL';
    case 'IN_PROGRESS':
      return 'SCORING';
    case 'FINISHED':
      return 'FINISHED_DETAIL';
    case 'CANCELLED':
      return 'CANCELLED_DETAIL';
  }
}

export function matchViewportKey(
  matchStatus: string,
  scoringStatus: string | null = null,
): string {
  return `${matchStatus}:${scoringStatus ?? 'AUTHORITATIVE'}`;
}

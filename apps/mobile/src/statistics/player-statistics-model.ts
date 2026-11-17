import type { PlayerMatchHistoryItem } from '../api/contracts';

const recentMatchLimit = 5;

export type RecentPlayerForm = {
  results: PlayerMatchHistoryItem['subjectResult'][];
  wins: number;
};

export function recentPlayerMatches(
  matches: readonly PlayerMatchHistoryItem[],
): PlayerMatchHistoryItem[] {
  return [...matches].sort(compareNewestFirst).slice(0, recentMatchLimit);
}

export function recentPlayerForm(
  matches: readonly PlayerMatchHistoryItem[],
): RecentPlayerForm {
  const chronologicalMatches = recentPlayerMatches(matches).reverse();
  const results = chronologicalMatches.map(
    ({ subjectResult }) => subjectResult,
  );

  return {
    results,
    wins: results.filter((result) => result === 'WIN').length,
  };
}

export function playerHistoryRouteFor(
  playerId: string,
): `/players/${string}/matches` {
  return `/players/${playerId}/matches`;
}

export function formatPlayerPercentage(
  value: number | null,
  locale: 'cs' | 'en',
): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value * 100)} %`;
}

export function formatAttendancePercentage(
  value: number | null,
  locale: 'cs' | 'en',
): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value)} %`;
}

function compareNewestFirst(
  left: PlayerMatchHistoryItem,
  right: PlayerMatchHistoryItem,
): number {
  const startsAtComparison = right.startsAt.localeCompare(left.startsAt);
  return startsAtComparison !== 0
    ? startsAtComparison
    : right.id.localeCompare(left.id);
}

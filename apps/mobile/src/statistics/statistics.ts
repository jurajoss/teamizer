import type { PlayerMatchHistoryPage, RankingsPage } from '../api/contracts';

export type StatisticsViewState = 'loading' | 'error' | 'empty' | 'success';

export function statisticsViewState(
  loading: boolean,
  error: boolean,
  itemCount: number,
): StatisticsViewState {
  if (loading) return 'loading';
  if (error) return 'error';
  return itemCount === 0 ? 'empty' : 'success';
}

export function rankingRows(pages: RankingsPage[] | undefined) {
  return pages?.flatMap(({ items }) => items) ?? [];
}

export function historyRows(pages: PlayerMatchHistoryPage[] | undefined) {
  return pages?.flatMap(({ items }) => items) ?? [];
}

export function formatWinRate(value: number | null, locale = 'en'): string {
  if (value === null) return 'N/A';
  return `${new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value * 100)}%`;
}

export function formatGoalsPerMatch(
  value: number | null,
  locale = 'en',
): string {
  if (value === null) return 'N/A';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

export function playerRouteFor(playerId: string): `/players/${string}` {
  return `/players/${playerId}`;
}

export function statisticsRoute(): '/statistics' {
  return '/statistics';
}

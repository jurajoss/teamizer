import type {
  PlayerMatchHistoryPage,
  RankingRow,
  RankingsPage,
} from '../api/contracts';

export type StatisticsViewState = 'loading' | 'error' | 'empty' | 'success';
export type RankingCriterion = 'winRate' | 'goalsPerMatch' | 'participation';

export const rankingCriteria: readonly RankingCriterion[] = [
  'winRate',
  'goalsPerMatch',
  'participation',
];

const rankingsPageSize = 100;

export function statisticsViewState(
  loading: boolean,
  error: boolean,
  itemCount: number,
): StatisticsViewState {
  if (loading) return 'loading';
  if (error) return 'error';
  return itemCount === 0 ? 'empty' : 'success';
}

export async function fetchAllRankingRows(
  getPage: (options: {
    cursor?: string;
    limit: number;
  }) => Promise<RankingsPage>,
): Promise<RankingRow[]> {
  const rows: RankingRow[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const page = await getPage({
      limit: rankingsPageSize,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...page.items);

    if (page.nextCursor && seenCursors.has(page.nextCursor)) {
      throw new Error('Rankings pagination returned a repeated cursor.');
    }
    if (page.nextCursor) seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);

  return rows;
}

export function rankingRows(
  rows: readonly RankingRow[],
  criterion: RankingCriterion,
): RankingRow[] {
  return [...rows]
    .sort((left, right) => compareRankingRows(left, right, criterion))
    .map((row, index) => ({ ...row, rank: index + 1 }));
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

export function formatRankingStatistic(
  row: RankingRow,
  criterion: RankingCriterion,
  locale: string,
): string {
  if (criterion === 'participation') {
    return row.statistics.attendance.percentage === null
      ? '—'
      : `${new Intl.NumberFormat(locale, {
          maximumFractionDigits: 0,
        }).format(row.statistics.attendance.percentage)} %`;
  }
  if (criterion === 'goalsPerMatch') {
    return row.statistics.goalsPerMatch === null
      ? '—'
      : formatGoalsPerMatch(row.statistics.goalsPerMatch, locale);
  }
  return row.statistics.winRate === null
    ? '—'
    : `${new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      }).format(row.statistics.winRate * 100)} %`;
}

export function playerRouteFor(playerId: string): `/players/${string}` {
  return `/players/${playerId}`;
}

export function playerEditRouteFor(
  playerId: string,
): `/players/${string}/edit` {
  return `/players/${playerId}/edit`;
}

export function rankingsRoute(): '/rankings' {
  return '/rankings';
}

function compareRankingRows(
  left: RankingRow,
  right: RankingRow,
  criterion: RankingCriterion,
): number {
  const comparisons =
    criterion === 'winRate'
      ? [
          compareFractionDescending(
            left.statistics.wins,
            left.statistics.matches,
            right.statistics.wins,
            right.statistics.matches,
          ),
          right.statistics.matches - left.statistics.matches,
          compareFractionDescending(
            left.statistics.goals,
            left.statistics.matches,
            right.statistics.goals,
            right.statistics.matches,
          ),
          right.statistics.goals - left.statistics.goals,
        ]
      : criterion === 'goalsPerMatch'
        ? [
            compareFractionDescending(
              left.statistics.goals,
              left.statistics.matches,
              right.statistics.goals,
              right.statistics.matches,
            ),
            right.statistics.matches - left.statistics.matches,
            compareFractionDescending(
              left.statistics.wins,
              left.statistics.matches,
              right.statistics.wins,
              right.statistics.matches,
            ),
            right.statistics.goals - left.statistics.goals,
          ]
        : [
            compareNullableNumberDescending(
              left.statistics.attendance.percentage,
              right.statistics.attendance.percentage,
            ),
            right.statistics.attendance.playedMatches -
              left.statistics.attendance.playedMatches,
            compareFractionDescending(
              left.statistics.wins,
              left.statistics.matches,
              right.statistics.wins,
              right.statistics.matches,
            ),
            compareFractionDescending(
              left.statistics.goals,
              left.statistics.matches,
              right.statistics.goals,
              right.statistics.matches,
            ),
            right.statistics.goals - left.statistics.goals,
          ];

  for (const comparison of comparisons) {
    if (comparison !== 0) return comparison;
  }

  const nameComparison = left.player.name.localeCompare(
    right.player.name,
    'cs',
    { sensitivity: 'base' },
  );
  return nameComparison || left.player.id.localeCompare(right.player.id);
}

function compareNullableNumberDescending(
  left: number | null,
  right: number | null,
): number {
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? 1 : -1;
  }
  return right - left;
}

function compareFractionDescending(
  leftNumerator: number,
  leftDenominator: number,
  rightNumerator: number,
  rightDenominator: number,
): number {
  if (leftDenominator === 0 || rightDenominator === 0) {
    if (leftDenominator === rightDenominator) return 0;
    return leftDenominator === 0 ? 1 : -1;
  }

  const leftScaled = leftNumerator * rightDenominator;
  const rightScaled = rightNumerator * leftDenominator;
  return rightScaled - leftScaled;
}

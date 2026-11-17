import type {
  Attendance,
  MatchDetail,
  PlayerMatchHistoryItem,
  PlayerStatistics,
  UpcomingMatch,
} from '../api/contracts';
import { primaryUpcomingMatch } from '../matches/match-flow';

const pragueTimeZone = 'Europe/Prague';
const homeHistoryLimit = 10;
const homeGoalXAxisMinimumLabelSpacing = 64;

export type HomeAttendancePresentation =
  | { kind: 'unanswered'; mayEdit: boolean }
  | { kind: 'going' | 'not-going'; mayEdit: boolean };

export type HomeGoalHistoryPoint = {
  goals: number;
  label: string;
  matchId: string;
  startsAt: string;
};

export type HomeStatisticsMetric = {
  key: 'winRate' | 'goalsPerMatch' | 'matches';
  value: string;
};

export function homeFirstName(name: string): string {
  return name.trim().split(/\s+/u)[0] ?? name.trim();
}

export function selectHomeMatch(
  matches: UpcomingMatch[],
): UpcomingMatch | null {
  return primaryUpcomingMatch(matches);
}

export function homeAttendancePresentation(
  attendance: Attendance | null,
  matchStatus: UpcomingMatch['status'],
  playerStatus: 'ACTIVE' | 'INACTIVE',
): HomeAttendancePresentation {
  const mayEdit =
    matchStatus === 'OPEN_FOR_REGISTRATION' && playerStatus === 'ACTIVE';

  if (attendance === 'GOING') return { kind: 'going', mayEdit };
  if (attendance === 'NOT_GOING') return { kind: 'not-going', mayEdit };
  return { kind: 'unanswered', mayEdit };
}

export function formatHomeMatchDate(
  value: string,
  locale: 'cs' | 'en',
): { date: string; time: string } {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'numeric',
      timeZone: pragueTimeZone,
      weekday: 'short',
      year: 'numeric',
    }).format(date),
    time: new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: pragueTimeZone,
    }).format(date),
  };
}

export function homeGoingPlayers(match: MatchDetail | undefined) {
  return match?.participants.going ?? [];
}

export function homeStatisticsMetrics(
  statistics: PlayerStatistics,
  locale: 'cs' | 'en',
): HomeStatisticsMetric[] {
  return [
    {
      key: 'winRate',
      value:
        statistics.winRate === null
          ? 'N/A'
          : `${new Intl.NumberFormat(locale, {
              maximumFractionDigits: 1,
            }).format(statistics.winRate * 100)} %`,
    },
    {
      key: 'goalsPerMatch',
      value:
        statistics.goalsPerMatch === null
          ? 'N/A'
          : new Intl.NumberFormat(locale, {
              maximumFractionDigits: 1,
              minimumFractionDigits: 1,
            }).format(statistics.goalsPerMatch),
    },
    { key: 'matches', value: String(statistics.matches) },
  ];
}

export function homeGoalHistory(
  history: PlayerMatchHistoryItem[],
  locale: 'cs' | 'en',
): HomeGoalHistoryPoint[] {
  return [...history]
    .sort(compareHistoryNewestFirst)
    .slice(0, homeHistoryLimit)
    .reverse()
    .map((match) => ({
      goals: match.subjectGoals,
      label: formatHomeGoalDate(match.startsAt, locale),
      matchId: match.id,
      startsAt: match.startsAt,
    }));
}

export function homeGoalXAxisLabelIndices(
  pointCount: number,
  availableWidth: number,
): number[] {
  if (pointCount <= 0 || availableWidth <= 0) return [];

  const labelCount = Math.min(
    pointCount,
    Math.max(1, Math.floor(availableWidth / homeGoalXAxisMinimumLabelSpacing)),
  );
  if (labelCount === 1) return [0];
  if (labelCount === pointCount) {
    return Array.from({ length: pointCount }, (_, index) => index);
  }

  return Array.from({ length: labelCount }, (_, position) =>
    Math.round((position * (pointCount - 1)) / (labelCount - 1)),
  );
}

export function homeGoalScale(points: HomeGoalHistoryPoint[]): {
  maximum: number;
  ticks: number[];
} {
  const highestValue = Math.max(0, ...points.map(({ goals }) => goals));
  const step = Math.max(1, Math.ceil(Math.max(2, highestValue) / 5));
  const maximum = step * 5;

  return {
    maximum,
    ticks: Array.from({ length: 6 }, (_, index) => maximum - index * step),
  };
}

export function homeUsesTwoColumns(mode: 'phone' | 'tablet'): boolean {
  return mode === 'tablet';
}

function compareHistoryNewestFirst(
  left: PlayerMatchHistoryItem,
  right: PlayerMatchHistoryItem,
): number {
  const startsAtComparison = right.startsAt.localeCompare(left.startsAt);
  return startsAtComparison !== 0
    ? startsAtComparison
    : right.id.localeCompare(left.id);
}

function formatHomeGoalDate(value: string, locale: 'cs' | 'en'): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: pragueTimeZone,
  }).formatToParts(new Date(value));
  const day = parts.find(({ type }) => type === 'day')?.value ?? '';
  const month = parts.find(({ type }) => type === 'month')?.value ?? '';
  return `${day}. ${month}.`;
}

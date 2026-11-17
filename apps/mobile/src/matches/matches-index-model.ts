import type {
  MatchDetail,
  MatchSummary,
  PlayerPublic,
  UpcomingMatch,
} from '../api/contracts';

const pragueTimeZone = 'Europe/Prague';
const widePhoneAvatarThreshold = 375;

export type MatchesFilter = 'all' | 'upcoming' | 'finished';
export const defaultMatchesFilter: MatchesFilter = 'all';
export type MatchesSection =
  | { kind: 'upcoming'; matches: UpcomingMatch[] }
  | { kind: 'finished'; matches: MatchSummary[] };
export type PersonalMatchResult = 'WIN' | 'DRAW' | 'LOSS' | 'DID_NOT_PLAY';
export type MatchListScore = {
  teamA: number;
  teamB: number;
};
export type MatchesEmptyState = 'all' | 'upcoming' | 'finished' | null;

export function matchesIndexSections(
  filter: MatchesFilter,
  upcoming: UpcomingMatch[],
  finished: MatchSummary[],
): MatchesSection[] {
  const sections: MatchesSection[] = [];
  if (filter !== 'finished' && upcoming.length > 0) {
    sections.push({ kind: 'upcoming', matches: upcoming });
  }
  if (filter !== 'upcoming' && finished.length > 0) {
    sections.push({ kind: 'finished', matches: finished });
  }
  return sections;
}

export function matchesIndexEmptyState(
  filter: MatchesFilter,
  upcomingCount: number,
  finishedCount: number,
): MatchesEmptyState {
  if (filter === 'upcoming') return upcomingCount === 0 ? 'upcoming' : null;
  if (filter === 'finished') return finishedCount === 0 ? 'finished' : null;
  return upcomingCount === 0 && finishedCount === 0 ? 'all' : null;
}

export function formatMatchListDate(
  value: string,
  locale: 'cs' | 'en',
): { date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: pragueTimeZone,
    weekday: 'short',
  }).formatToParts(new Date(value));
  const day = parts.find(({ type }) => type === 'day')?.value ?? '';
  const month = parts.find(({ type }) => type === 'month')?.value ?? '';
  const weekday = parts.find(({ type }) => type === 'weekday')?.value ?? '';

  return {
    date: `${day}. ${month}.`,
    weekday: weekday.replace(/\.$/u, '').toLocaleUpperCase(locale),
  };
}

export function matchListPlayers(
  detail: MatchDetail | undefined,
): MatchDetail['participants']['going'] {
  if (!detail) return [];

  return matchListTeamPlayers(
    detail.teams ?? [{ players: detail.participants.going }],
  );
}

export function matchListTeamPlayers(
  teams: ReadonlyArray<{ players: readonly PlayerPublic[] }>,
): PlayerPublic[] {
  const uniquePlayers = new Map<string, PlayerPublic>();
  for (const team of teams) {
    for (const player of team.players) {
      if (!uniquePlayers.has(player.id)) uniquePlayers.set(player.id, player);
    }
  }
  return [...uniquePlayers.values()];
}

export function personalMatchResult(
  detail: MatchDetail | undefined,
  playerId: string,
): PersonalMatchResult | null {
  if (detail?.status !== 'FINISHED' || !detail.result || !detail.teams) {
    return null;
  }

  const team = detail.teams.find(({ players }) =>
    players.some(({ id }) => id === playerId),
  );
  if (!team) return 'DID_NOT_PLAY';

  const { teamA, teamB } = detail.result.score;
  if (teamA === teamB) return 'DRAW';
  const teamAWon = teamA > teamB;
  return (team.side === 'A') === teamAWon ? 'WIN' : 'LOSS';
}

export function matchListScore(
  detail: MatchDetail | undefined,
): MatchListScore | null {
  if (detail?.status !== 'FINISHED' || !detail.result) return null;
  return {
    teamA: detail.result.score.teamA,
    teamB: detail.result.score.teamB,
  };
}

export function personalMatchGoals(
  detail: MatchDetail | undefined,
  playerId: string,
): number | null {
  const result = personalMatchResult(detail, playerId);
  if (
    result === null ||
    result === 'DID_NOT_PLAY' ||
    detail?.status !== 'FINISHED' ||
    !detail.result
  ) {
    return null;
  }

  return (
    detail.result.playerGoals.find((entry) => entry.playerId === playerId)
      ?.goals ?? 0
  );
}

export function matchListAvatarLimit(
  mode: 'phone' | 'tablet',
  kind: MatchesSection['kind'],
  viewportWidth: number,
): number {
  if (mode === 'tablet') return 8;
  if (kind === 'upcoming') return 3;
  return viewportWidth >= widePhoneAvatarThreshold ? 3 : 2;
}

export function canCreateMatch(role: 'PLAYER' | 'ADMIN'): boolean {
  return role === 'ADMIN';
}

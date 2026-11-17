import { Inject, Injectable } from '@nestjs/common';
import {
  MatchStatus,
  PlayerInvitationStatus,
  PlayerStatus,
  Prisma,
  TeamSide,
  UserRole,
} from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AvatarService } from '../avatars/avatar.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminPlayerDetailDto,
  AttendanceStatsDto,
  PaginationQueryDto,
  PlayerDetailDto,
  PlayerMatchHistoryItemDto,
  PlayerMatchHistoryPageDto,
  PlayerMatchResultDto,
  PlayerStatisticsDto,
  PlayerStatisticsSummaryDto,
  RankingsPageDto,
  RankingsQueryDto,
} from './player.dto';
import { mapAdminPlayer, mapPlayerPublic } from './player.mapper';

const DEFAULT_PAGE_SIZE = 25;
const CURSOR_VERSION = 1;

const statisticsPlayerSelect = Prisma.validator<Prisma.PlayerSelect>()({
  id: true,
  name: true,
  type: true,
  status: true,
  speed: true,
  endurance: true,
  defense: true,
  attack: true,
  technique: true,
  avatarStorageKey: true,
  teamMemberships: {
    where: { team: { match: { status: MatchStatus.FINISHED } } },
    select: {
      matchId: true,
      team: {
        select: {
          side: true,
          match: { select: { teamAScore: true, teamBScore: true } },
        },
      },
    },
  },
  matchPlayerStats: {
    where: { match: { status: MatchStatus.FINISHED } },
    select: { matchId: true, goals: true },
  },
});

const adminStatisticsPlayerSelect = Prisma.validator<Prisma.PlayerSelect>()({
  ...statisticsPlayerSelect,
  user: { select: { id: true } },
  invitation: { select: { email: true, status: true } },
});

type StatisticsPlayer = Prisma.PlayerGetPayload<{
  select: typeof statisticsPlayerSelect;
}>;

type AdminStatisticsPlayer = Prisma.PlayerGetPayload<{
  select: typeof adminStatisticsPlayerSelect;
}>;

const historyMembershipSelect = Prisma.validator<Prisma.TeamMembershipSelect>()(
  {
    matchId: true,
    team: {
      select: {
        side: true,
        match: {
          select: {
            id: true,
            startsAt: true,
            location: true,
            teamAScore: true,
            teamBScore: true,
            sport: { select: { id: true, name: true } },
            teams: {
              orderBy: { side: 'asc' },
              select: {
                id: true,
                side: true,
                memberships: {
                  orderBy: [{ player: { name: 'asc' } }, { playerId: 'asc' }],
                  select: {
                    player: {
                      select: {
                        id: true,
                        name: true,
                        type: true,
                        status: true,
                        avatarStorageKey: true,
                      },
                    },
                  },
                },
              },
            },
            matchPlayerStats: {
              orderBy: { playerId: 'asc' },
              select: { playerId: true, goals: true },
            },
          },
        },
      },
    },
  },
);

type HistoryMembership = Prisma.TeamMembershipGetPayload<{
  select: typeof historyMembershipSelect;
}>;

@Injectable()
export class PlayerStatisticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AvatarService) private readonly avatars: AvatarService,
  ) {}

  async detail(
    playerId: string,
    actor: AuthenticatedUser,
  ): Promise<PlayerDetailDto | AdminPlayerDetailDto> {
    if (actor.role === UserRole.ADMIN) {
      const [player, totalMatches] =
        await this.loadAdminStatisticsSnapshot(playerId);
      return {
        ...mapAdminPlayer(player, (key) => this.avatars.urlFor(key)),
        account: adminAccount(player),
        statistics: this.summarize(player, totalMatches),
      };
    }

    const [player, totalMatches] = await this.loadStatisticsSnapshot(playerId);
    return {
      ...mapPlayerPublic(player, (key) => this.avatars.urlFor(key)),
      statistics: this.summarize(player, totalMatches),
    };
  }

  async statistics(playerId: string): Promise<PlayerStatisticsDto> {
    const [player, totalMatches] = await this.loadStatisticsSnapshot(playerId);
    return { playerId, ...this.summarize(player, totalMatches) };
  }

  async rankings(
    query: RankingsQueryDto,
    actor: AuthenticatedUser,
  ): Promise<RankingsPageDto> {
    const includeInactive = query.includeInactive ?? false;
    if (includeInactive && actor.role !== UserRole.ADMIN) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'Only an administrator may include inactive Players in rankings.',
      );
    }

    const offset = this.decodeCursor(
      query.cursor,
      'rankings',
      includeInactive ? 'all' : 'active',
    );
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const [players, totalMatches] = await this.prisma.$transaction(
      [
        this.prisma.player.findMany({
          where: includeInactive ? {} : { status: PlayerStatus.ACTIVE },
          select: statisticsPlayerSelect,
        }),
        this.prisma.match.count({ where: { status: MatchStatus.FINISHED } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const ordered = players
      .map((player) => ({
        player,
        statistics: this.summarize(player, totalMatches),
      }))
      .sort(compareRankingCandidates);
    const page = ordered.slice(offset, offset + limit);

    return {
      items: page.map(({ player, statistics }, index) => ({
        rank: offset + index + 1,
        player: mapPlayerPublic(player, (key) => this.avatars.urlFor(key)),
        statistics,
      })),
      nextCursor:
        offset + limit < ordered.length
          ? this.encodeCursor(
              'rankings',
              includeInactive ? 'all' : 'active',
              offset + limit,
            )
          : null,
    };
  }

  async history(
    playerId: string,
    query: PaginationQueryDto,
  ): Promise<PlayerMatchHistoryPageDto> {
    await this.requirePlayer(playerId);
    const offset = this.decodeCursor(query.cursor, 'history', playerId);
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const memberships = await this.prisma.teamMembership.findMany({
      where: {
        playerId,
        team: { match: { status: MatchStatus.FINISHED } },
      },
      select: historyMembershipSelect,
      orderBy: [{ team: { match: { startsAt: 'desc' } } }, { matchId: 'desc' }],
      skip: offset,
      take: limit + 1,
    });
    const hasNextPage = memberships.length > limit;

    return {
      items: memberships
        .slice(0, limit)
        .map((membership) => this.mapHistory(membership, playerId)),
      nextCursor: hasNextPage
        ? this.encodeCursor('history', playerId, offset + limit)
        : null,
    };
  }

  private async loadStatisticsSnapshot(
    playerId: string,
  ): Promise<[StatisticsPlayer, number]> {
    const [player, totalMatches] = await this.prisma.$transaction(
      [
        this.prisma.player.findUnique({
          where: { id: playerId },
          select: statisticsPlayerSelect,
        }),
        this.prisma.match.count({ where: { status: MatchStatus.FINISHED } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    if (!player) {
      throw this.notFound();
    }

    return [player, totalMatches];
  }

  private async loadAdminStatisticsSnapshot(
    playerId: string,
  ): Promise<[AdminStatisticsPlayer, number]> {
    const [player, totalMatches] = await this.prisma.$transaction(
      [
        this.prisma.player.findUnique({
          where: { id: playerId },
          select: adminStatisticsPlayerSelect,
        }),
        this.prisma.match.count({ where: { status: MatchStatus.FINISHED } }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    if (!player) {
      throw this.notFound();
    }

    return [player, totalMatches];
  }

  private async requirePlayer(playerId: string): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) throw this.notFound();
  }

  private summarize(
    player: StatisticsPlayer,
    totalMatches: number,
  ): PlayerStatisticsSummaryDto {
    const membershipsByMatch = new Map(
      player.teamMemberships.map((membership) => [
        membership.matchId,
        membership,
      ]),
    );
    const matchIds = new Set(membershipsByMatch.keys());
    let wins = 0;
    let draws = 0;
    let losses = 0;

    for (const membership of membershipsByMatch.values()) {
      const { teamAScore, teamBScore } = membership.team.match;
      if (teamAScore === null || teamBScore === null) {
        throw new Error('A FINISHED Match is missing its authoritative score.');
      }
      const result = resultFor(membership.team.side, teamAScore, teamBScore);
      if (result === 'WIN') wins += 1;
      else if (result === 'DRAW') draws += 1;
      else losses += 1;
    }

    const matches = matchIds.size;
    const goals = player.matchPlayerStats.reduce(
      (total, stat) => total + (matchIds.has(stat.matchId) ? stat.goals : 0),
      0,
    );

    return {
      matches,
      wins,
      draws,
      losses,
      winRate: matches === 0 ? null : roundedRate(wins, matches),
      goals,
      goalsPerMatch: matches === 0 ? null : roundedRate(goals, matches),
      attendance: buildAttendanceStats(matchIds, totalMatches),
    };
  }

  private mapHistory(
    membership: HistoryMembership,
    playerId: string,
  ): PlayerMatchHistoryItemDto {
    const { match } = membership.team;
    const { teamAScore, teamBScore } = match;
    if (teamAScore === null || teamBScore === null) {
      throw new Error('A FINISHED Match is missing its authoritative score.');
    }
    const subjectGoals =
      match.matchPlayerStats.find((stat) => stat.playerId === playerId)
        ?.goals ?? 0;

    return {
      id: match.id,
      sport: match.sport,
      startsAt: match.startsAt.toISOString(),
      location: match.location,
      score: { teamA: teamAScore, teamB: teamBScore },
      teams: match.teams.map((team) => ({
        id: team.id,
        side: team.side,
        players: team.memberships.map(({ player }) =>
          mapPlayerPublic(player, (key) => this.avatars.urlFor(key)),
        ),
      })),
      playerGoals: match.matchPlayerStats,
      subjectGoals,
      subjectResult: resultFor(membership.team.side, teamAScore, teamBScore),
    };
  }

  private encodeCursor(kind: string, scope: string, offset: number): string {
    return Buffer.from(
      JSON.stringify({ version: CURSOR_VERSION, kind, scope, offset }),
    ).toString('base64url');
  }

  private decodeCursor(
    cursor: string | undefined,
    kind: string,
    scope: string,
  ): number {
    if (!cursor) return 0;

    try {
      const value: unknown = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      );
      if (
        typeof value === 'object' &&
        value !== null &&
        'version' in value &&
        value.version === CURSOR_VERSION &&
        'kind' in value &&
        value.kind === kind &&
        'scope' in value &&
        value.scope === scope &&
        'offset' in value &&
        Number.isInteger(value.offset) &&
        typeof value.offset === 'number' &&
        value.offset >= 0
      ) {
        return value.offset;
      }
    } catch {
      // Fall through to the stable validation error below.
    }

    throw new ApiError(400, 'VALIDATION_ERROR', 'The cursor is invalid.');
  }

  private notFound(): ApiError {
    return new ApiError(
      404,
      'RESOURCE_NOT_FOUND',
      'The requested Player does not exist.',
    );
  }
}

function adminAccount(
  player: Pick<AdminStatisticsPlayer, 'invitation' | 'user'>,
): AdminPlayerDetailDto['account'] {
  if (
    player.user ||
    player.invitation?.status === PlayerInvitationStatus.ACCEPTED
  ) {
    return { state: 'REGISTERED' };
  }

  if (
    player.invitation?.status === PlayerInvitationStatus.PENDING ||
    player.invitation?.status === PlayerInvitationStatus.SENT
  ) {
    return {
      state: 'INVITED',
      email: player.invitation.email,
      invitationStatus: player.invitation.status,
    };
  }

  return { state: 'UNLINKED' };
}

export function buildAttendanceStats(
  playedMatchIds: Iterable<string>,
  totalMatches: number,
): AttendanceStatsDto {
  const playedMatches = new Set(playedMatchIds).size;
  if (playedMatches > totalMatches) {
    throw new Error(
      'Player attendance cannot exceed the total number of FINISHED Matches.',
    );
  }

  return {
    playedMatches,
    totalMatches,
    percentage:
      totalMatches === 0
        ? null
        : Math.round((playedMatches / totalMatches) * 100),
  };
}

export type RankingCandidate = {
  player: Pick<StatisticsPlayer, 'id' | 'name'>;
  statistics: PlayerStatisticsSummaryDto;
};

export function compareRankingCandidates(
  first: RankingCandidate,
  second: RankingCandidate,
): number {
  const a = first.statistics;
  const b = second.statistics;
  if (a.matches === 0 || b.matches === 0) {
    if (a.matches === 0 && b.matches > 0) return 1;
    if (b.matches === 0 && a.matches > 0) return -1;
  }

  const winRateDifference = b.wins * a.matches - a.wins * b.matches;
  if (winRateDifference !== 0) return winRateDifference;
  if (a.matches !== b.matches) return b.matches - a.matches;

  const goalsPerMatchDifference = b.goals * a.matches - a.goals * b.matches;
  if (goalsPerMatchDifference !== 0) return goalsPerMatchDifference;
  if (a.goals !== b.goals) return b.goals - a.goals;
  if (first.player.name !== second.player.name) {
    return first.player.name < second.player.name ? -1 : 1;
  }
  if (first.player.id === second.player.id) return 0;
  return first.player.id < second.player.id ? -1 : 1;
}

function resultFor(
  side: TeamSide,
  teamAScore: number,
  teamBScore: number,
): PlayerMatchResultDto {
  if (teamAScore === teamBScore) return 'DRAW';
  const winningSide = teamAScore > teamBScore ? TeamSide.A : TeamSide.B;
  return side === winningSide ? 'WIN' : 'LOSS';
}

function roundedRate(numerator: number, denominator: number): number {
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

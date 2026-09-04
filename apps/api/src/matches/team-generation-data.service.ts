import { Injectable } from '@nestjs/common';
import type {
  HistoricalMatch,
  MatchOutcome,
  ReferencePlayer,
  TeamGenerationInput,
} from '@teamizer/algorithm';
import {
  Attendance,
  MatchStatus,
  PlayerStatus,
  TeamSide,
} from '@prisma/client';
import type { Prisma } from '@prisma/client';

type TeamGenerationContext = {
  input: TeamGenerationInput;
  inactiveGoingPlayerIds: string[];
  teamsPerMatch: number;
};

type PlayerStatisticsAccumulator = {
  matches: number;
  wins: number;
  goals: number;
  outcomes: Array<{ startsAt: Date; matchId: string; outcome: MatchOutcome }>;
};

@Injectable()
export class TeamGenerationDataService {
  async load(
    transaction: Prisma.TransactionClient,
    matchId: string,
  ): Promise<TeamGenerationContext> {
    const [match, goingParticipants, referencePlayers] = await Promise.all([
      transaction.match.findUniqueOrThrow({
        where: { id: matchId },
        select: { sport: { select: { teamsPerMatch: true } } },
      }),
      transaction.matchParticipant.findMany({
        where: { matchId, attendance: Attendance.GOING },
        select: { player: { select: { id: true, status: true } } },
        orderBy: { playerId: 'asc' },
      }),
      transaction.player.findMany({
        where: { status: PlayerStatus.ACTIVE },
        select: {
          id: true,
          speed: true,
          endurance: true,
          defense: true,
          attack: true,
          technique: true,
        },
        orderBy: { id: 'asc' },
      }),
    ]);
    const participantIds = goingParticipants.map(({ player }) => player.id);
    const inactiveGoingPlayerIds = goingParticipants
      .filter(({ player }) => player.status !== PlayerStatus.ACTIVE)
      .map(({ player }) => player.id);
    const referencePlayerIds = referencePlayers.map(({ id }) => id);
    const [memberships, playerStats, historicalMatches] = await Promise.all([
      referencePlayerIds.length === 0
        ? Promise.resolve([])
        : transaction.teamMembership.findMany({
            where: {
              playerId: { in: referencePlayerIds },
              team: { match: { status: MatchStatus.FINISHED } },
            },
            select: {
              playerId: true,
              team: {
                select: {
                  side: true,
                  match: {
                    select: {
                      id: true,
                      startsAt: true,
                      teamAScore: true,
                      teamBScore: true,
                    },
                  },
                },
              },
            },
          }),
      referencePlayerIds.length === 0
        ? Promise.resolve([])
        : transaction.matchPlayerStat.findMany({
            where: {
              playerId: { in: referencePlayerIds },
              match: { status: MatchStatus.FINISHED },
            },
            select: { playerId: true, goals: true },
          }),
      participantIds.length === 0
        ? Promise.resolve([])
        : transaction.match.findMany({
            where: {
              status: MatchStatus.FINISHED,
              teams: {
                some: {
                  memberships: { some: { playerId: { in: participantIds } } },
                },
              },
            },
            orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
            take: 5,
            select: {
              teams: {
                orderBy: { side: 'asc' },
                select: {
                  side: true,
                  memberships: {
                    orderBy: { playerId: 'asc' },
                    select: { playerId: true },
                  },
                },
              },
            },
          }),
    ]);
    const statistics = this.buildStatistics(
      referencePlayerIds,
      memberships,
      playerStats,
    );

    return {
      input: {
        participantIds,
        referencePlayers: referencePlayers.map((player) =>
          this.mapReferencePlayer(player, statistics),
        ),
        history: historicalMatches.map(({ teams }) =>
          this.mapHistoricalMatch(teams),
        ),
      },
      inactiveGoingPlayerIds,
      teamsPerMatch: match.sport.teamsPerMatch,
    };
  }

  private buildStatistics(
    playerIds: string[],
    memberships: Array<{
      playerId: string;
      team: {
        side: TeamSide;
        match: {
          id: string;
          startsAt: Date;
          teamAScore: number | null;
          teamBScore: number | null;
        };
      };
    }>,
    playerStats: Array<{ playerId: string; goals: number }>,
  ): Map<string, PlayerStatisticsAccumulator> {
    const result = new Map<string, PlayerStatisticsAccumulator>(
      playerIds.map((playerId) => [
        playerId,
        { matches: 0, wins: 0, goals: 0, outcomes: [] },
      ]),
    );

    for (const membership of memberships) {
      const accumulator = result.get(membership.playerId);
      const { match, side } = membership.team;

      if (
        !accumulator ||
        match.teamAScore === null ||
        match.teamBScore === null
      ) {
        continue;
      }

      const outcome = this.outcome(side, match.teamAScore, match.teamBScore);
      accumulator.matches += 1;

      if (outcome === 1) {
        accumulator.wins += 1;
      }

      accumulator.outcomes.push({
        startsAt: match.startsAt,
        matchId: match.id,
        outcome,
      });
    }

    for (const stat of playerStats) {
      const accumulator = result.get(stat.playerId);

      if (accumulator) {
        accumulator.goals += stat.goals;
      }
    }

    return result;
  }

  private mapReferencePlayer(
    player: {
      id: string;
      speed: number;
      endurance: number;
      defense: number;
      attack: number;
      technique: number;
    },
    statistics: Map<string, PlayerStatisticsAccumulator>,
  ): ReferencePlayer {
    const playerStatistics = statistics.get(player.id);

    if (!playerStatistics) {
      throw new Error(
        `Missing statistics accumulator for Player ${player.id}.`,
      );
    }

    const recentOutcomes = [...playerStatistics.outcomes]
      .sort(
        (left, right) =>
          right.startsAt.getTime() - left.startsAt.getTime() ||
          (left.matchId < right.matchId ? 1 : -1),
      )
      .slice(0, 5)
      .map(({ outcome }) => outcome);

    return {
      id: player.id,
      attributes: {
        speed: player.speed,
        endurance: player.endurance,
        defense: player.defense,
        attack: player.attack,
        technique: player.technique,
      },
      statistics: {
        matches: playerStatistics.matches,
        wins: playerStatistics.wins,
        goals: playerStatistics.goals,
        recentOutcomes,
      },
    };
  }

  private mapHistoricalMatch(
    teams: Array<{
      side: TeamSide;
      memberships: Array<{ playerId: string }>;
    }>,
  ): HistoricalMatch {
    const teamA = teams.find(({ side }) => side === TeamSide.A);
    const teamB = teams.find(({ side }) => side === TeamSide.B);

    return {
      teamAPlayerIds: teamA?.memberships.map(({ playerId }) => playerId) ?? [],
      teamBPlayerIds: teamB?.memberships.map(({ playerId }) => playerId) ?? [],
    };
  }

  private outcome(
    side: TeamSide,
    teamAScore: number,
    teamBScore: number,
  ): MatchOutcome {
    if (teamAScore === teamBScore) {
      return 0;
    }

    const teamAWon = teamAScore > teamBScore;
    return (side === TeamSide.A) === teamAWon ? 1 : -1;
  }
}

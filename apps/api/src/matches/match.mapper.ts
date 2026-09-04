import { MatchStatus } from '@prisma/client';
import type { TeamGenerationMode, TeamSide } from '@prisma/client';

import {
  mapPlayerPublic,
  type AvatarUrlResolver,
} from '../players/player.mapper';
import type { PlayerPublicDto } from '../players/player.dto';
import type {
  MatchDetailDto,
  MatchParticipantDto,
  MatchPlayerProjection,
  MatchSummaryDto,
  SportSummaryDto,
  UpcomingMatchSummaryDto,
} from './match.dto';

export function mapSportSummary(sport: SportSummaryDto): SportSummaryDto {
  return {
    id: sport.id,
    name: sport.name,
    teamsPerMatch: sport.teamsPerMatch,
    playersOnFieldPerTeam: sport.playersOnFieldPerTeam,
  };
}

export function mapMatchSummary(match: {
  id: string;
  sport: SportSummaryDto;
  startsAt: Date;
  location: string | null;
  status: MatchSummaryDto['status'];
  stateVersion: number;
}): MatchSummaryDto {
  return {
    id: match.id,
    sport: mapSportSummary(match.sport),
    startsAt: match.startsAt.toISOString(),
    location: match.location,
    status: match.status,
    stateVersion: match.stateVersion,
  };
}

export function mapUpcomingMatchSummary(match: {
  id: string;
  sport: SportSummaryDto;
  startsAt: Date;
  location: string | null;
  status: MatchSummaryDto['status'];
  stateVersion: number;
  participants: Array<{ attendance: UpcomingMatchSummaryDto['myAttendance'] }>;
}): UpcomingMatchSummaryDto {
  return {
    ...mapMatchSummary(match),
    myAttendance: match.participants[0]?.attendance ?? null,
  };
}

export function mapMatchParticipant(participant: {
  matchId: string;
  playerId: string;
  attendance: MatchParticipantDto['attendance'];
}): MatchParticipantDto {
  return {
    matchId: participant.matchId,
    playerId: participant.playerId,
    attendance: participant.attendance,
  };
}

export function mapMatchDetail(
  match: {
    id: string;
    sport: SportSummaryDto;
    startsAt: Date;
    location: string | null;
    status: MatchDetailDto['status'];
    stateVersion: number;
    teamAScore: number | null;
    teamBScore: number | null;
    teamGenerationMode: TeamGenerationMode | null;
    algorithmVersion: string | null;
    configurationVersion: string | null;
    participants: Array<{
      playerId: string;
      attendance: MatchParticipantDto['attendance'];
      player: MatchPlayerProjection;
    }>;
    teams: Array<{
      id: string;
      side: TeamSide;
      memberships: Array<{ player: MatchPlayerProjection }>;
    }>;
    matchPlayerStats: Array<{ playerId: string; goals: number }>;
  },
  callerPlayerId: string,
  unansweredPlayers: MatchPlayerProjection[],
  avatarUrl: AvatarUrlResolver,
): MatchDetailDto {
  const going: PlayerPublicDto[] = [];
  const notGoing: PlayerPublicDto[] = [];
  let myAttendance: MatchDetailDto['myAttendance'] = null;

  for (const participant of match.participants) {
    const player = mapPlayerPublic(participant.player, avatarUrl);

    if (participant.attendance === 'GOING') {
      going.push(player);
    } else {
      notGoing.push(player);
    }

    if (participant.playerId === callerPlayerId) {
      myAttendance = participant.attendance;
    }
  }

  const hasPersistedTeams = match.teams.length > 0;
  const teams = hasPersistedTeams
    ? match.teams.map((team) => ({
        id: team.id,
        side: team.side,
        players: team.memberships.map(({ player }) =>
          mapPlayerPublic(player, avatarUrl),
        ),
      }))
    : null;
  const provenance =
    match.teamGenerationMode &&
    match.algorithmVersion &&
    match.configurationVersion
      ? {
          mode: match.teamGenerationMode,
          algorithmVersion: match.algorithmVersion,
          configurationVersion: match.configurationVersion,
        }
      : null;
  const result =
    match.status === MatchStatus.FINISHED &&
    match.teamAScore !== null &&
    match.teamBScore !== null
      ? {
          score: { teamA: match.teamAScore, teamB: match.teamBScore },
          playerGoals: match.matchPlayerStats.map(({ playerId, goals }) => ({
            playerId,
            goals,
          })),
        }
      : null;

  return {
    ...mapMatchSummary(match),
    myAttendance,
    participants: {
      going,
      notGoing,
      unanswered: unansweredPlayers.map((player) =>
        mapPlayerPublic(player, avatarUrl),
      ),
    },
    teams,
    provenance,
    result,
  };
}

import { Type } from 'class-transformer';
import {
  IsEnum,
  IsArray,
  IsDefined,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  Attendance,
  MatchStatus,
  PlayerStatus,
  PlayerType,
  TeamGenerationMode,
  TeamSide,
} from '@prisma/client';
import {
  Attendance as AttendanceEnum,
  MatchStatus as MatchStatusEnum,
} from '@prisma/client';

import { PlayerAttributesInput } from '../players/player.dto';
import type { PlayerPublicDto } from '../players/player.dto';

export class MatchListQueryDto {
  @IsOptional()
  @IsEnum(MatchStatusEnum)
  status?: MatchStatus;

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cursor?: string;
}

export class AttendanceRequestDto {
  @IsEnum(AttendanceEnum)
  attendance!: Attendance;
}

export class GuestInputDto {
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name!: string;

  @ValidateNested()
  @Type(() => PlayerAttributesInput)
  attributes!: PlayerAttributesInput;
}

export class AddParticipantRequestDto {
  @IsOptional()
  @IsUUID()
  playerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuestInputDto)
  guest?: GuestInputDto;
}

export class EmptyRequestDto {}

export class StartMatchRequestDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  teamAPlayerIds!: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  teamBPlayerIds!: string[];

  @IsString()
  @IsNotEmpty()
  proposalReceipt!: string;
}

export class CompleteMatchScoreDto {
  @IsDefined()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  teamA!: number;

  @IsDefined()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  teamB!: number;
}

export class CompleteMatchPlayerGoalsDto {
  @IsUUID()
  playerId!: string;

  @IsDefined()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  goals!: number;
}

export class CompleteMatchRequestDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => CompleteMatchScoreDto)
  score!: CompleteMatchScoreDto;

  @IsDefined()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteMatchPlayerGoalsDto)
  playerGoals!: CompleteMatchPlayerGoalsDto[];
}

export type SportSummaryDto = {
  id: string;
  name: string;
  teamsPerMatch: number;
  playersOnFieldPerTeam: number;
};

export type MatchSummaryDto = {
  id: string;
  sport: SportSummaryDto;
  startsAt: string;
  location: string | null;
  status: MatchStatus;
  stateVersion: number;
};

export type UpcomingMatchSummaryDto = MatchSummaryDto & {
  myAttendance: Attendance | null;
};

export type PaginatedMatchesDto = {
  items: MatchSummaryDto[];
  nextCursor: string | null;
};

export type MatchParticipantDto = {
  matchId: string;
  playerId: string;
  attendance: Attendance;
};

export type AddParticipantResponseDto = {
  participant: MatchParticipantDto;
  player?: PlayerPublicDto;
};

export type TeamProposalDto = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  balance: {
    balanceScore: number;
    historyScore: number;
  };
  algorithmVersion: string;
  configurationVersion: string;
  proposalReceipt: string;
};

export type MatchParticipantsDto = {
  going: PlayerPublicDto[];
  notGoing: PlayerPublicDto[];
  unanswered: PlayerPublicDto[];
};

export type TeamDto = {
  id: string;
  side: TeamSide;
  players: PlayerPublicDto[];
};

export type MatchProvenanceDto = {
  mode: TeamGenerationMode;
  algorithmVersion: string;
  configurationVersion: string;
};

export type MatchResultDto = {
  score: { teamA: number; teamB: number };
  playerGoals: Array<{ playerId: string; goals: number }>;
};

export type MatchDetailDto = MatchSummaryDto & {
  myAttendance: Attendance | null;
  participants: MatchParticipantsDto;
  teams: TeamDto[] | null;
  provenance: MatchProvenanceDto | null;
  result: MatchResultDto | null;
};

export type MatchPlayerProjection = {
  id: string;
  name: string;
  type: PlayerType;
  status: PlayerStatus;
  avatarStorageKey: string | null;
};

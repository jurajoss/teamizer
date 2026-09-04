import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PlayerStatus } from '@prisma/client';
import type { PlayerType, UserRole } from '@prisma/client';

export class PlayerAttributesInput {
  @IsInt()
  @Min(1)
  @Max(10)
  speed!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  endurance!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  defense!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  attack!: number;

  @IsInt()
  @Min(1)
  @Max(10)
  technique!: number;
}

export class OnboardingRequestDto {
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name!: string;

  @ValidateNested()
  @Type(() => PlayerAttributesInput)
  attributes!: PlayerAttributesInput;
}

export class ConvertGuestRequestDto {
  @IsString()
  @MaxLength(255)
  @Matches(/\S/, {
    message: 'authProviderId must contain a non-whitespace character',
  })
  authProviderId!: string;
}

export class UpdatePlayerRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/\S/, { message: 'name must contain a non-whitespace character' })
  name?: string;

  @IsOptional()
  @IsEnum(PlayerStatus)
  status?: PlayerStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => PlayerAttributesInput)
  attributes?: PlayerAttributesInput;
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export const PLAYER_LIST_STATUSES = ['ACTIVE', 'INACTIVE', 'ALL'] as const;
export type PlayerListStatus = (typeof PLAYER_LIST_STATUSES)[number];

export class PlayerListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(PLAYER_LIST_STATUSES)
  status?: PlayerListStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class RankingsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  includeInactive?: boolean;
}

export type PlayerAttributesDto = {
  speed: number;
  endurance: number;
  defense: number;
  attack: number;
  technique: number;
};

export type PlayerPublicDto = {
  id: string;
  name: string;
  type: PlayerType;
  status: PlayerStatus;
  avatarUrl: string | null;
};

export type AdminPlayerDto = PlayerPublicDto & {
  attributes: PlayerAttributesDto;
};

export type UserDto = {
  id: string;
  role: UserRole;
  notificationsEnabled: boolean;
  createdAt: string;
};

export type CurrentUserResponseDto = {
  user: UserDto;
  player: PlayerPublicDto | AdminPlayerDto;
};

export type ConvertedGuestResponseDto = {
  user: UserDto;
  player: AdminPlayerDto;
};

export type PlayerStatisticsSummaryDto = {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number | null;
  goals: number;
  goalsPerMatch: number | null;
};

export type PlayerStatisticsDto = PlayerStatisticsSummaryDto & {
  playerId: string;
};

export type PlayerDetailDto = PlayerPublicDto & {
  statistics: PlayerStatisticsSummaryDto;
};

export type AdminPlayerDetailDto = PlayerDetailDto & {
  attributes: PlayerAttributesDto;
};

export type PlayersPageDto = {
  items: PlayerPublicDto[];
  nextCursor: string | null;
};

export type RankingRowDto = {
  rank: number;
  player: PlayerPublicDto;
  statistics: PlayerStatisticsSummaryDto;
};

export type RankingsPageDto = {
  items: RankingRowDto[];
  nextCursor: string | null;
};

export type PlayerMatchResultDto = 'WIN' | 'DRAW' | 'LOSS';

export type PlayerMatchHistoryItemDto = {
  id: string;
  sport: { id: string; name: string };
  startsAt: string;
  location: string | null;
  score: { teamA: number; teamB: number };
  teams: Array<{
    id: string;
    side: 'A' | 'B';
    players: PlayerPublicDto[];
  }>;
  playerGoals: Array<{ playerId: string; goals: number }>;
  subjectGoals: number;
  subjectResult: PlayerMatchResultDto;
};

export type PlayerMatchHistoryPageDto = {
  items: PlayerMatchHistoryItemDto[];
  nextCursor: string | null;
};

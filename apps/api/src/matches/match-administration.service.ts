import { Inject, Injectable } from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';

import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { RecurrenceService } from '../scheduling/recurrence.service';
import type { CreateManualMatchRequestDto } from './match-administration.dto';
import type { MatchSummaryDto, SportSummaryDto } from './match.dto';
import { mapMatchSummary, mapSportSummary } from './match.mapper';

const MANUAL_MATCH_TIME_ZONE = 'Europe/Prague';

const sportSummarySelect = Prisma.validator<Prisma.SportSelect>()({
  id: true,
  name: true,
  teamsPerMatch: true,
  playersOnFieldPerTeam: true,
});

const matchSummarySelect = Prisma.validator<Prisma.MatchSelect>()({
  id: true,
  startsAt: true,
  location: true,
  status: true,
  stateVersion: true,
  sport: { select: sportSummarySelect },
});

@Injectable()
export class MatchAdministrationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RecurrenceService) private readonly recurrence: RecurrenceService,
  ) {}

  async listSupportedSports(): Promise<SportSummaryDto[]> {
    const sports = await this.prisma.sport.findMany({
      where: { teamsPerMatch: 2 },
      select: sportSummarySelect,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return sports.map(mapSportSummary);
  }

  async createManualMatch(
    request: CreateManualMatchRequestDto,
  ): Promise<MatchSummaryDto> {
    const sport = await this.prisma.sport.findUnique({
      where: { id: request.sportId },
      select: { id: true, teamsPerMatch: true },
    });
    if (!sport || sport.teamsPerMatch !== 2) {
      throw new ApiError(
        422,
        'INVALID_MATCH',
        'A manual Match requires an existing two-team Sport.',
      );
    }

    let startsAt: Date;
    try {
      startsAt = this.recurrence.localDateTimeToInstant(
        request.localDate,
        request.localStartTime,
        MANUAL_MATCH_TIME_ZONE,
      );
    } catch {
      throw new ApiError(
        422,
        'INVALID_MATCH',
        'The local date and time must identify one valid Europe/Prague instant.',
      );
    }

    if (startsAt.getTime() <= Date.now()) {
      throw new ApiError(
        422,
        'INVALID_MATCH',
        'The manual Match start must be in the future.',
      );
    }

    const location = request.location?.trim() || null;
    const match = await this.prisma.match.create({
      data: {
        scheduleId: null,
        sportId: sport.id,
        startsAt,
        location,
        status: MatchStatus.OPEN_FOR_REGISTRATION,
      },
      select: matchSummarySelect,
    });

    return mapMatchSummary(match);
  }
}

export { MANUAL_MATCH_TIME_ZONE };

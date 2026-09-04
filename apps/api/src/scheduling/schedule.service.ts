import { Inject, Injectable, Logger } from '@nestjs/common';
import { MatchStatus, Prisma } from '@prisma/client';
import type { Schedule } from '@prisma/client';

import { ApiError } from '../common/errors/api-error';
import { mapMatchSummary } from '../matches/match.mapper';
import type { MatchSummaryDto } from '../matches/match.dto';
import { PrismaService } from '../prisma/prisma.service';
import { RecurrenceService } from './recurrence.service';
import type { ScheduleDto, UpdateScheduleRequestDto } from './schedule.dto';

const SINGLETON_SCHEDULE_ADVISORY_LOCK = 8_274_311;

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RecurrenceService) private readonly recurrence: RecurrenceService,
  ) {}

  async getConfiguredSchedule(): Promise<ScheduleDto> {
    return this.mapSchedule(await this.requireConfiguredSchedule());
  }

  async updateConfiguredSchedule(
    request: UpdateScheduleRequestDto,
  ): Promise<ScheduleDto> {
    if (!this.recurrence.isValidTimeZone(request.timeZone)) {
      throw new ApiError(422, 'INVALID_SCHEDULE', 'The time zone is invalid.');
    }
    const sport = await this.prisma.sport.findUnique({
      where: { id: request.sportId },
      select: { id: true, teamsPerMatch: true },
    });
    if (!sport || sport.teamsPerMatch !== 2) {
      throw new ApiError(
        422,
        'INVALID_SCHEDULE',
        'The schedule requires an existing two-team Sport.',
      );
    }

    const data = {
      weekday: request.weekday,
      localStartTime: timeForPrisma(request.localStartTime),
      timeZone: request.timeZone,
      enabled: request.enabled,
      sportId: request.sportId,
      location: request.location ?? null,
      generationHorizonDays: request.generationHorizonDays,
      registrationReminderMinutes: request.registrationReminderMinutes,
      finalReminderMinutes: request.finalReminderMinutes,
    };
    const schedule = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(${SINGLETON_SCHEDULE_ADVISORY_LOCK})`;
      const existing = await transaction.schedule.findFirst({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      return existing
        ? transaction.schedule.update({ where: { id: existing.id }, data })
        : transaction.schedule.create({ data });
    });

    return this.mapSchedule(schedule);
  }

  async materializeNext(
    scheduleId: string,
    now = new Date(),
  ): Promise<{ match: MatchSummaryDto; created: boolean }> {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM "Schedule" WHERE id = ${scheduleId}::uuid FOR UPDATE`;
      const schedule = await transaction.schedule.findUnique({
        where: { id: scheduleId },
      });
      if (!schedule || !schedule.enabled) {
        throw new ApiError(
          422,
          'INVALID_SCHEDULE',
          'The enabled schedule does not exist.',
        );
      }

      const existingFutureMatch = await transaction.match.findFirst({
        where: { scheduleId: schedule.id, startsAt: { gt: now } },
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        select: matchSummarySelection,
      });
      if (existingFutureMatch) {
        return { match: existingFutureMatch, created: false };
      }

      const startsAt = this.recurrence.nextOccurrence(
        {
          weekday: schedule.weekday,
          localStartTime: formatLocalTime(schedule.localStartTime),
          timeZone: schedule.timeZone,
        },
        now,
      );
      const opensAt = this.recurrence.creationOpensAt(
        startsAt,
        schedule.timeZone,
        schedule.generationHorizonDays,
      );
      if (now < opensAt) {
        throw new ApiError(
          422,
          'INVALID_SCHEDULE',
          'The next occurrence is not within its generation horizon.',
        );
      }

      const insert = await transaction.match.createMany({
        data: [
          {
            scheduleId: schedule.id,
            sportId: schedule.sportId,
            startsAt,
            location: schedule.location,
            status: MatchStatus.OPEN_FOR_REGISTRATION,
          },
        ],
        skipDuplicates: true,
      });
      const match = await transaction.match.findUniqueOrThrow({
        where: {
          scheduleId_startsAt: { scheduleId: schedule.id, startsAt },
        },
        select: matchSummarySelection,
      });
      return { match, created: insert.count === 1 };
    });

    this.logger.log(
      result.created
        ? `Scheduled Match created: match=${result.match.id} schedule=${scheduleId} startsAt=${result.match.startsAt.toISOString()}.`
        : `Scheduled Match already exists: match=${result.match.id} schedule=${scheduleId} startsAt=${result.match.startsAt.toISOString()}.`,
    );
    return { match: mapMatchSummary(result.match), created: result.created };
  }

  async materializeDue(now = new Date()): Promise<number> {
    const schedules = await this.prisma.schedule.findMany({
      where: { enabled: true },
      select: {
        id: true,
        weekday: true,
        localStartTime: true,
        timeZone: true,
        generationHorizonDays: true,
      },
    });
    let created = 0;
    for (const schedule of schedules) {
      const startsAt = this.recurrence.nextOccurrence(
        {
          weekday: schedule.weekday,
          localStartTime: formatLocalTime(schedule.localStartTime),
          timeZone: schedule.timeZone,
        },
        now,
      );
      const opensAt = this.recurrence.creationOpensAt(
        startsAt,
        schedule.timeZone,
        schedule.generationHorizonDays,
      );
      if (now >= opensAt) {
        const result = await this.materializeNext(schedule.id, now);
        if (result.created) created += 1;
      }
    }
    return created;
  }

  async materializeConfigured(
    now = new Date(),
  ): Promise<{ match: MatchSummaryDto; created: boolean }> {
    const schedule = await this.requireConfiguredSchedule();
    return this.materializeNext(schedule.id, now);
  }

  private async requireConfiguredSchedule(): Promise<Schedule> {
    const schedule = await this.prisma.schedule.findFirst({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (!schedule) {
      throw new ApiError(
        404,
        'RESOURCE_NOT_FOUND',
        'No recurring schedule is configured.',
      );
    }
    return schedule;
  }

  private mapSchedule(schedule: Schedule): ScheduleDto {
    return {
      id: schedule.id,
      weekday: schedule.weekday,
      localStartTime: formatLocalTime(schedule.localStartTime),
      timeZone: schedule.timeZone,
      enabled: schedule.enabled,
      sportId: schedule.sportId,
      location: schedule.location,
      generationHorizonDays: schedule.generationHorizonDays,
      registrationReminderMinutes: schedule.registrationReminderMinutes,
      finalReminderMinutes: schedule.finalReminderMinutes,
    };
  }
}

export function formatLocalTime(value: Date): string {
  return value.toISOString().slice(11, 19);
}

function timeForPrisma(value: string): Date {
  return new Date(`1970-01-01T${value}.000Z`);
}

const matchSummarySelection = Prisma.validator<Prisma.MatchSelect>()({
  id: true,
  startsAt: true,
  location: true,
  status: true,
  stateVersion: true,
  sport: {
    select: {
      id: true,
      name: true,
      teamsPerMatch: true,
      playersOnFieldPerTeam: true,
    },
  },
});

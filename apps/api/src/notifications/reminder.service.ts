import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  Attendance,
  MatchStatus,
  PlayerStatus,
  PlayerType,
  Prisma,
  ReminderDeliveryStatus,
  ReminderType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  PUSH_NOTIFICATION_GATEWAY,
  type PushDeliveryResult,
  type PushNotificationGateway,
} from './push-notification.gateway';

type ReminderMatch = {
  id: string;
  startsAt: Date;
  location: string | null;
  sport: { name: string };
  schedule: {
    timeZone: string;
    registrationReminderMinutes: number;
    finalReminderMinutes: number;
  } | null;
};

type ReminderDevice = {
  id: string;
  provider: 'EXPO' | 'FCM';
  pushToken: string;
};

export const MINIMUM_REMINDER_RETRY_DELAY_MS = 60_000;
export const REMINDER_CLAIM_LEASE_MS = 120_000;

type ReminderClaim = {
  token: string;
};

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PUSH_NOTIFICATION_GATEWAY)
    private readonly notifications: PushNotificationGateway,
  ) {}

  async dispatchDue(now = new Date()): Promise<number> {
    const matches = await this.prisma.match.findMany({
      where: {
        status: MatchStatus.OPEN_FOR_REGISTRATION,
        startsAt: { gt: now },
        schedule: { is: { enabled: true } },
      },
      select: {
        id: true,
        startsAt: true,
        location: true,
        sport: { select: { name: true } },
        schedule: {
          select: {
            timeZone: true,
            registrationReminderMinutes: true,
            finalReminderMinutes: true,
          },
        },
      },
    });
    let delivered = 0;
    for (const match of matches) {
      for (const reminderType of dueReminderTypes(match, now)) {
        delivered += await this.dispatchMatchReminder(match, reminderType, now);
      }
    }
    return delivered;
  }

  private async dispatchMatchReminder(
    match: ReminderMatch,
    reminderType: ReminderType,
    now: Date,
  ): Promise<number> {
    const devices = await this.eligibleDevices(match.id);
    let delivered = 0;
    for (const device of devices) {
      const claim = await this.claim(match.id, device.id, reminderType, now);
      if (!claim) {
        continue;
      }
      if (!(await this.isStillEligible(match.id, device.id, now))) {
        await this.releaseClaim(match.id, device.id, reminderType, claim.token);
        this.logger.debug(
          `Reminder skipped after state recheck: match=${match.id} device=${device.id} type=${reminderType}.`,
        );
        continue;
      }
      const result = await this.notifications.send(device.provider, {
        token: device.pushToken,
        title:
          reminderType === ReminderType.REGISTRATION
            ? 'Upcoming Match'
            : 'Match starts soon',
        body: reminderBody(match),
        data: { type: 'MATCH_ATTENDANCE_REMINDER', matchId: match.id },
      });
      const recorded = await this.recordResult(
        match.id,
        device.id,
        reminderType,
        claim.token,
        result,
        now,
      );
      if (!recorded) {
        this.logger.warn(
          `Ignored a result from an expired reminder claim: match=${match.id} device=${device.id} type=${reminderType}.`,
        );
        continue;
      }
      if (result.outcome === 'DELIVERED') {
        delivered += 1;
        this.logger.log(
          `Reminder delivered: match=${match.id} device=${device.id} type=${reminderType}.`,
        );
      } else if (result.outcome === 'INVALID_TOKEN') {
        this.logger.warn(
          `Reminder permanently failed and device retired: match=${match.id} device=${device.id} type=${reminderType} code=${result.errorCode}.`,
        );
      } else {
        this.logger.warn(
          `Reminder transiently failed: match=${match.id} device=${device.id} type=${reminderType} code=${result.errorCode}.`,
        );
      }
    }
    return delivered;
  }

  private eligibleDevices(matchId: string): Promise<ReminderDevice[]> {
    return this.prisma.pushDevice.findMany({
      where: {
        isActive: true,
        user: {
          notificationsEnabled: true,
          player: {
            type: PlayerType.REGULAR,
            status: PlayerStatus.ACTIVE,
            participants: {
              none: {
                matchId,
                attendance: Attendance.NOT_GOING,
              },
            },
          },
        },
      },
      select: { id: true, provider: true, pushToken: true },
      orderBy: { id: 'asc' },
    });
  }

  private async claim(
    matchId: string,
    pushDeviceId: string,
    reminderType: ReminderType,
    now: Date,
  ): Promise<ReminderClaim | null> {
    const token = randomUUID();
    try {
      await this.prisma.matchReminderDelivery.create({
        data: {
          matchId,
          pushDeviceId,
          reminderType,
          status: ReminderDeliveryStatus.PENDING,
          claimToken: token,
          attemptCount: 1,
          lastAttemptAt: now,
        },
      });
      this.logger.debug(
        `Reminder claimed: match=${matchId} device=${pushDeviceId} type=${reminderType}.`,
      );
      return { token };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    const retryBefore = new Date(
      now.getTime() - MINIMUM_REMINDER_RETRY_DELAY_MS,
    );
    const leaseExpiredBefore = new Date(
      now.getTime() - REMINDER_CLAIM_LEASE_MS,
    );
    const retry = await this.prisma.matchReminderDelivery.updateMany({
      where: {
        matchId,
        pushDeviceId,
        reminderType,
        OR: [
          {
            status: ReminderDeliveryStatus.TRANSIENT_FAILURE,
            lastAttemptAt: { lte: retryBefore },
          },
          {
            status: ReminderDeliveryStatus.PENDING,
            OR: [
              { lastAttemptAt: null },
              { lastAttemptAt: { lte: leaseExpiredBefore } },
            ],
          },
        ],
      },
      data: {
        status: ReminderDeliveryStatus.PENDING,
        claimToken: token,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        errorCode: null,
      },
    });
    if (retry.count === 0) {
      this.logger.debug(
        `Reminder retry deferred or terminal: match=${matchId} device=${pushDeviceId} type=${reminderType}.`,
      );
      return null;
    }
    this.logger.log(
      `Reminder claim recovered: match=${matchId} device=${pushDeviceId} type=${reminderType}.`,
    );
    return { token };
  }

  protected async isStillEligible(
    matchId: string,
    pushDeviceId: string,
    now: Date,
  ): Promise<boolean> {
    const device = await this.prisma.pushDevice.findFirst({
      where: {
        id: pushDeviceId,
        isActive: true,
        user: {
          notificationsEnabled: true,
          player: {
            type: PlayerType.REGULAR,
            status: PlayerStatus.ACTIVE,
            participants: {
              none: { matchId, attendance: Attendance.NOT_GOING },
            },
          },
        },
      },
      select: { id: true },
    });
    if (!device) return false;
    const match = await this.prisma.match.findFirst({
      where: {
        id: matchId,
        status: MatchStatus.OPEN_FOR_REGISTRATION,
        startsAt: { gt: now },
        schedule: { is: { enabled: true } },
      },
      select: { id: true },
    });
    return match !== null;
  }

  private async releaseClaim(
    matchId: string,
    pushDeviceId: string,
    reminderType: ReminderType,
    claimToken: string,
  ): Promise<void> {
    await this.prisma.matchReminderDelivery.deleteMany({
      where: {
        matchId,
        pushDeviceId,
        reminderType,
        status: ReminderDeliveryStatus.PENDING,
        claimToken,
      },
    });
  }

  private async recordResult(
    matchId: string,
    pushDeviceId: string,
    reminderType: ReminderType,
    claimToken: string,
    result: PushDeliveryResult,
    now: Date,
  ): Promise<boolean> {
    if (result.outcome === 'DELIVERED') {
      const transition = await this.prisma.matchReminderDelivery.updateMany({
        where: {
          matchId,
          pushDeviceId,
          reminderType,
          status: ReminderDeliveryStatus.PENDING,
          claimToken,
        },
        data: {
          status: ReminderDeliveryStatus.DELIVERED,
          deliveredAt: now,
          errorCode: null,
        },
      });
      return transition.count === 1;
    }

    const status =
      result.outcome === 'INVALID_TOKEN'
        ? ReminderDeliveryStatus.INVALID_TOKEN
        : ReminderDeliveryStatus.TRANSIENT_FAILURE;
    return this.prisma.$transaction(async (transaction) => {
      const transition = await transaction.matchReminderDelivery.updateMany({
        where: {
          matchId,
          pushDeviceId,
          reminderType,
          status: ReminderDeliveryStatus.PENDING,
          claimToken,
        },
        data: { status, errorCode: result.errorCode.slice(0, 64) },
      });
      if (transition.count === 0) return false;
      if (result.outcome === 'INVALID_TOKEN') {
        await transaction.pushDevice.updateMany({
          where: { id: pushDeviceId },
          data: { isActive: false, invalidatedAt: now },
        });
      }
      return true;
    });
  }
}

export function dueReminderTypes(
  match: ReminderMatch,
  now: Date,
): ReminderType[] {
  if (!match.schedule || match.startsAt <= now) return [];
  const result: ReminderType[] = [];
  const registrationAt = new Date(
    match.startsAt.getTime() -
      match.schedule.registrationReminderMinutes * 60_000,
  );
  const finalAt = new Date(
    match.startsAt.getTime() - match.schedule.finalReminderMinutes * 60_000,
  );
  if (now >= registrationAt) result.push(ReminderType.REGISTRATION);
  if (now >= finalAt) result.push(ReminderType.FINAL);
  return result;
}

function reminderBody(match: ReminderMatch): string {
  const timeZone = match.schedule?.timeZone ?? 'Europe/Prague';
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(match.startsAt);
  return `${match.sport.name} · ${formatted}${match.location ? ` · ${match.location}` : ''}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

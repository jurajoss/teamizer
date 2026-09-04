import {
  Attendance,
  DevicePlatform,
  MatchStatus,
  PlayerStatus,
  PlayerType,
  PushProvider,
  ReminderDeliveryStatus,
  ReminderType,
  Weekday,
} from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type {
  PushDeliveryResult,
  PushMessage,
  PushNotificationGateway,
} from '../src/notifications/push-notification.gateway';
import { PushDeviceService } from '../src/notifications/push-device.service';
import {
  dueReminderTypes,
  REMINDER_CLAIM_LEASE_MS,
  ReminderService,
} from '../src/notifications/reminder.service';
import { RecurrenceService } from '../src/scheduling/recurrence.service';
import { ScheduleService } from '../src/scheduling/schedule.service';
import { PrismaService } from '../src/prisma/prisma.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
const attributes = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

class FakePushGateway implements PushNotificationGateway {
  readonly calls: Array<{ provider: PushProvider; message: PushMessage }> = [];
  results: PushDeliveryResult[] = [];

  async send(
    provider: PushProvider,
    message: PushMessage,
  ): Promise<PushDeliveryResult> {
    this.calls.push({ provider, message });
    return this.results.shift() ?? { outcome: 'DELIVERED' };
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('reminder timing', () => {
  const match = {
    id: 'match',
    startsAt: new Date('2026-09-01T16:00:00.000Z'),
    location: null,
    sport: { name: 'Football' },
    schedule: {
      timeZone: 'Europe/Prague',
      registrationReminderMinutes: 2880,
      finalReminderMinutes: 180,
    },
  };

  it('selects the 48-hour and 3-hour reminders only when due', () => {
    expect(
      dueReminderTypes(match, new Date('2026-08-30T15:59:59.999Z')),
    ).toEqual([]);
    expect(
      dueReminderTypes(match, new Date('2026-08-30T16:00:00.000Z')),
    ).toEqual([ReminderType.REGISTRATION]);
    expect(
      dueReminderTypes(match, new Date('2026-09-01T13:00:00.000Z')),
    ).toEqual([ReminderType.REGISTRATION, ReminderType.FINAL]);
    expect(dueReminderTypes(match, match.startsAt)).toEqual([]);
  });
});

describeWithDatabase('scheduled Match and reminder persistence', () => {
  let prisma: PrismaService;
  let sportId: string;

  beforeAll(() => {
    if (!testDatabaseUrl) return;
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!databaseName.endsWith('_test')) {
      throw new Error(
        'TEST_DATABASE_URL must name a dedicated _test database.',
      );
    }
    prisma = new PrismaService({
      datasources: { db: { url: testDatabaseUrl } },
    });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Player", "Sport" RESTART IDENTITY CASCADE',
    );
    sportId = (
      await prisma.sport.create({
        data: {
          name: 'Football',
          teamsPerMatch: 2,
          playersOnFieldPerTeam: 3,
        },
      })
    ).id;
  });

  afterAll(async () => prisma?.$disconnect());

  async function createSchedule() {
    return prisma.schedule.create({
      data: {
        weekday: Weekday.TUESDAY,
        localStartTime: new Date('1970-01-01T18:00:00.000Z'),
        timeZone: 'Europe/Prague',
        enabled: true,
        sportId,
        location: 'Pitch A',
        generationHorizonDays: 7,
        registrationReminderMinutes: 2880,
        finalReminderMinutes: 180,
      },
    });
  }

  async function createUser(
    name: string,
    status: PlayerStatus = PlayerStatus.ACTIVE,
  ) {
    return prisma.user.create({
      data: {
        authProviderId: `uid-${name}`,
        player: {
          create: {
            name,
            type: PlayerType.REGULAR,
            status,
            ...attributes,
          },
        },
      },
      include: { player: true },
    });
  }

  it('creates one correct upcoming Match under repeated and concurrent execution', async () => {
    const schedule = await createSchedule();
    const service = new ScheduleService(prisma, new RecurrenceService());
    const now = new Date('2026-08-25T16:00:00.000Z');

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        service.materializeNext(schedule.id, now),
      ),
    );

    expect(results.filter(({ created }) => created)).toHaveLength(1);
    const matches = await prisma.match.findMany({
      where: { scheduleId: schedule.id },
      include: { participants: true },
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      startsAt: new Date('2026-09-01T16:00:00.000Z'),
      location: 'Pitch A',
      sportId,
      status: MatchStatus.OPEN_FOR_REGISTRATION,
      participants: [],
    });
  });

  it('catches up a missed tick for the next future occurrence without historical backfill', async () => {
    const schedule = await createSchedule();
    const service = new ScheduleService(prisma, new RecurrenceService());

    await expect(
      service.materializeDue(new Date('2026-08-28T12:00:00.000Z')),
    ).resolves.toBe(1);
    const matches = await prisma.match.findMany({
      where: { scheduleId: schedule.id },
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.startsAt).toEqual(new Date('2026-09-01T16:00:00.000Z'));
    expect(matches[0]?.startsAt.getTime()).toBeGreaterThan(
      new Date('2026-08-28T12:00:00.000Z').getTime(),
    );
  });

  it.each([
    '2026-08-25T16:00:00.000Z',
    '2026-08-25T20:00:00.000Z',
    '2026-08-28T12:00:00.000Z',
    '2026-09-01T17:00:00.000Z',
  ])('converges after downtime at %s without backfilling', async (nowValue) => {
    const schedule = await createSchedule();
    const service = new ScheduleService(prisma, new RecurrenceService());
    const now = new Date(nowValue);

    await expect(service.materializeDue(now)).resolves.toBe(1);
    const matches = await prisma.match.findMany({
      where: { scheduleId: schedule.id },
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.startsAt.getTime()).toBeGreaterThan(now.getTime());
    expect(matches[0]?.status).toBe(MatchStatus.OPEN_FOR_REGISTRATION);
  });

  it('does not create a second future session after schedule time changes', async () => {
    const schedule = await createSchedule();
    const service = new ScheduleService(prisma, new RecurrenceService());
    const now = new Date('2026-08-25T16:00:00.000Z');
    const first = await service.materializeNext(schedule.id, now);
    await prisma.schedule.update({
      where: { id: schedule.id },
      data: { localStartTime: new Date('1970-01-01T19:00:00.000Z') },
    });

    const afterConfigurationChange = await service.materializeNext(
      schedule.id,
      now,
    );

    expect(afterConfigurationChange).toMatchObject({
      created: false,
      match: { id: first.match.id },
    });
    await expect(
      prisma.match.count({ where: { scheduleId: schedule.id } }),
    ).resolves.toBe(1);
  });

  it('registers, safely reassigns, redacts, and owner-invalidates push devices', async () => {
    const first = await createUser('First');
    const second = await createUser('Second');
    const devices = new PushDeviceService(prisma);
    const input = {
      provider: PushProvider.EXPO,
      platform: DevicePlatform.IOS,
      pushToken: 'ExponentPushToken[private-token-123456]',
      deviceLabel: 'Phone',
    };

    const registered = await devices.register(first.id, input);
    const reassigned = await devices.register(second.id, input);

    expect(registered).not.toHaveProperty('pushToken');
    expect(registered.tokenSuffix).toBe('23456]');
    expect(reassigned.id).toBe(registered.id);
    expect(
      (
        await prisma.pushDevice.findUniqueOrThrow({
          where: { id: registered.id },
        })
      ).userId,
    ).toBe(second.id);
    await expect(
      devices.invalidate(first.id, registered.id),
    ).rejects.toMatchObject({ status: 404 });
    await devices.invalidate(second.id, registered.id);
    expect(
      (
        await prisma.pushDevice.findUniqueOrThrow({
          where: { id: registered.id },
        })
      ).isActive,
    ).toBe(false);
  });

  it('keeps a reassigned token active when old-owner invalidation races registration', async () => {
    const first = await createUser('Race First');
    const second = await createUser('Race Second');
    const devices = new PushDeviceService(prisma);
    const input = {
      provider: PushProvider.EXPO,
      platform: DevicePlatform.IOS,
      pushToken: 'racing-owner-token',
    };
    const original = await devices.register(first.id, input);

    await Promise.allSettled([
      devices.invalidate(first.id, original.id),
      devices.register(second.id, input),
    ]);

    await expect(
      prisma.pushDevice.findUniqueOrThrow({ where: { id: original.id } }),
    ).resolves.toMatchObject({ userId: second.id, isActive: true });
  });

  it('filters recipients, prevents duplicates, retries explicit transient failures, and retires invalid tokens', async () => {
    const schedule = await createSchedule();
    const match = await prisma.match.create({
      data: {
        scheduleId: schedule.id,
        sportId,
        startsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    });
    const recipient = await createUser('Recipient');
    const notGoing = await createUser('Not Going');
    const inactive = await createUser('Inactive', PlayerStatus.INACTIVE);
    await prisma.player.create({
      data: { name: 'Guest', type: PlayerType.GUEST, ...attributes },
    });
    await prisma.matchParticipant.create({
      data: {
        matchId: match.id,
        playerId: notGoing.playerId,
        attendance: Attendance.NOT_GOING,
      },
    });
    const deviceService = new PushDeviceService(prisma);
    const register = (userId: string, token: string) =>
      deviceService.register(userId, {
        provider: PushProvider.EXPO,
        platform: DevicePlatform.IOS,
        pushToken: token,
      });
    const recipientDevice = await register(recipient.id, 'recipient-token');
    await register(notGoing.id, 'not-going-token');
    await register(inactive.id, 'inactive-token');
    const gateway = new FakePushGateway();
    gateway.results = [
      { outcome: 'TRANSIENT_FAILURE', errorCode: 'TEMPORARY' },
      { outcome: 'DELIVERED' },
      { outcome: 'INVALID_TOKEN', errorCode: 'DeviceNotRegistered' },
    ];
    const service = new ReminderService(prisma, gateway);
    const registrationTime = new Date('2026-08-30T16:00:00.000Z');

    await Promise.all([
      service.dispatchDue(registrationTime),
      service.dispatchDue(registrationTime),
    ]);
    expect(gateway.calls).toHaveLength(1);
    expect(gateway.calls[0]?.message.data).toEqual({
      type: 'MATCH_ATTENDANCE_REMINDER',
      matchId: match.id,
    });
    expect(JSON.stringify(gateway.calls[0])).not.toContain('speed');

    const restartedService = new ReminderService(prisma, gateway);
    await restartedService.dispatchDue(
      new Date(registrationTime.getTime() + 60_000),
    );
    expect(gateway.calls).toHaveLength(2);
    expect(
      await prisma.matchReminderDelivery.findUniqueOrThrow({
        where: {
          matchId_pushDeviceId_reminderType: {
            matchId: match.id,
            pushDeviceId: recipientDevice.id,
            reminderType: ReminderType.REGISTRATION,
          },
        },
      }),
    ).toMatchObject({
      status: ReminderDeliveryStatus.DELIVERED,
      attemptCount: 2,
    });

    const finalTime = new Date('2026-09-01T13:00:00.000Z');
    await restartedService.dispatchDue(finalTime);
    expect(gateway.calls).toHaveLength(3);
    expect(
      await prisma.pushDevice.findUniqueOrThrow({
        where: { id: recipientDevice.id },
      }),
    ).toMatchObject({ isActive: false });
  });

  it('does not dispatch for FINISHED or CANCELLED Matches', async () => {
    const schedule = await createSchedule();
    const user = await createUser('Terminal');
    await new PushDeviceService(prisma).register(user.id, {
      provider: PushProvider.EXPO,
      platform: DevicePlatform.IOS,
      pushToken: 'terminal-token',
    });
    for (const [index, status] of [
      MatchStatus.FINISHED,
      MatchStatus.CANCELLED,
    ].entries()) {
      await prisma.match.create({
        data: {
          scheduleId: schedule.id,
          sportId,
          startsAt: new Date(
            index === 0
              ? '2026-09-01T16:00:00.000Z'
              : '2026-09-01T15:00:00.000Z',
          ),
          status,
          ...(status === MatchStatus.FINISHED
            ? {
                teamAScore: 0,
                teamBScore: 0,
                completedAt: new Date('2026-08-30T00:00:00.000Z'),
              }
            : { cancelledAt: new Date('2026-08-30T00:00:00.000Z') }),
        },
      });
    }
    const gateway = new FakePushGateway();
    await new ReminderService(prisma, gateway).dispatchDue(
      new Date('2026-08-30T16:00:00.000Z'),
    );
    expect(gateway.calls).toHaveLength(0);
  });

  it('delivers once to each active device owned by an eligible User', async () => {
    const schedule = await createSchedule();
    const match = await prisma.match.create({
      data: {
        scheduleId: schedule.id,
        sportId,
        startsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    });
    const user = await createUser('Multiple Devices');
    const devices = new PushDeviceService(prisma);
    await devices.register(user.id, {
      provider: PushProvider.EXPO,
      platform: DevicePlatform.IOS,
      pushToken: 'multiple-device-one',
    });
    await devices.register(user.id, {
      provider: PushProvider.EXPO,
      platform: DevicePlatform.ANDROID,
      pushToken: 'multiple-device-two',
    });
    const gateway = new FakePushGateway();

    await Promise.all([
      new ReminderService(prisma, gateway).dispatchDue(
        new Date('2026-08-30T16:00:00.000Z'),
      ),
      new ReminderService(prisma, gateway).dispatchDue(
        new Date('2026-08-30T16:00:00.000Z'),
      ),
    ]);

    expect(gateway.calls).toHaveLength(2);
    await expect(
      prisma.matchReminderDelivery.count({ where: { matchId: match.id } }),
    ).resolves.toBe(2);
  });

  it('reclaims one stale PENDING claim after a worker crash', async () => {
    const schedule = await createSchedule();
    const match = await prisma.match.create({
      data: {
        scheduleId: schedule.id,
        sportId,
        startsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    });
    const user = await createUser('Crash Recovery');
    const device = await new PushDeviceService(prisma).register(user.id, {
      provider: PushProvider.EXPO,
      platform: DevicePlatform.IOS,
      pushToken: 'crash-recovery-token',
    });
    const dueAt = new Date('2026-08-30T16:00:00.000Z');
    await prisma.matchReminderDelivery.create({
      data: {
        matchId: match.id,
        pushDeviceId: device.id,
        reminderType: ReminderType.REGISTRATION,
        status: ReminderDeliveryStatus.PENDING,
        claimToken: '00000000-0000-4000-8000-000000000099',
        attemptCount: 1,
        lastAttemptAt: dueAt,
      },
    });
    const gateway = new FakePushGateway();
    const retryAt = new Date(dueAt.getTime() + REMINDER_CLAIM_LEASE_MS);

    await Promise.all([
      new ReminderService(prisma, gateway).dispatchDue(retryAt),
      new ReminderService(prisma, gateway).dispatchDue(retryAt),
    ]);

    expect(gateway.calls).toHaveLength(1);
    await expect(
      prisma.matchReminderDelivery.findUniqueOrThrow({
        where: {
          matchId_pushDeviceId_reminderType: {
            matchId: match.id,
            pushDeviceId: device.id,
            reminderType: ReminderType.REGISTRATION,
          },
        },
      }),
    ).resolves.toMatchObject({
      status: ReminderDeliveryStatus.DELIVERED,
      attemptCount: 2,
    });
  });

  it('fences a late result from a worker whose claim expired', async () => {
    const schedule = await createSchedule();
    const match = await prisma.match.create({
      data: {
        scheduleId: schedule.id,
        sportId,
        startsAt: new Date('2026-09-01T16:00:00.000Z'),
      },
    });
    const user = await createUser('Fenced Worker');
    const device = await new PushDeviceService(prisma).register(user.id, {
      provider: PushProvider.EXPO,
      platform: DevicePlatform.IOS,
      pushToken: 'fenced-worker-token',
    });
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<PushDeliveryResult>();
    let callCount = 0;
    const gateway: PushNotificationGateway = {
      send: async () => {
        callCount += 1;
        if (callCount === 1) {
          firstStarted.resolve();
          return releaseFirst.promise;
        }
        return { outcome: 'DELIVERED' };
      },
    };
    const dueAt = new Date('2026-08-30T16:00:00.000Z');
    const firstRun = new ReminderService(prisma, gateway).dispatchDue(dueAt);
    await firstStarted.promise;

    await new ReminderService(prisma, gateway).dispatchDue(
      new Date(dueAt.getTime() + REMINDER_CLAIM_LEASE_MS),
    );
    releaseFirst.resolve({
      outcome: 'TRANSIENT_FAILURE',
      errorCode: 'LATE_RESULT',
    });
    await firstRun;

    expect(callCount).toBe(2);
    await expect(
      prisma.matchReminderDelivery.findUniqueOrThrow({
        where: {
          matchId_pushDeviceId_reminderType: {
            matchId: match.id,
            pushDeviceId: device.id,
            reminderType: ReminderType.REGISTRATION,
          },
        },
      }),
    ).resolves.toMatchObject({
      status: ReminderDeliveryStatus.DELIVERED,
      attemptCount: 2,
      errorCode: null,
    });
  });

  it.each([MatchStatus.CANCELLED, MatchStatus.FINISHED])(
    'skips a reminder when %s commits after claim but before recheck',
    async (terminalStatus) => {
      const schedule = await createSchedule();
      const match = await prisma.match.create({
        data: {
          scheduleId: schedule.id,
          sportId,
          startsAt: new Date('2026-09-01T16:00:00.000Z'),
        },
      });
      const user = await createUser('Cancellation Race');
      await new PushDeviceService(prisma).register(user.id, {
        provider: PushProvider.EXPO,
        platform: DevicePlatform.IOS,
        pushToken: 'cancellation-race-token',
      });
      const recheckStarted = deferred<void>();
      const continueRecheck = deferred<void>();
      class GatedReminderService extends ReminderService {
        protected override async isStillEligible(
          matchId: string,
          pushDeviceId: string,
          now: Date,
        ): Promise<boolean> {
          recheckStarted.resolve();
          await continueRecheck.promise;
          return super.isStillEligible(matchId, pushDeviceId, now);
        }
      }
      const gateway = new FakePushGateway();
      const dispatch = new GatedReminderService(prisma, gateway).dispatchDue(
        new Date('2026-08-30T16:00:00.000Z'),
      );
      await recheckStarted.promise;
      const transitionTime = new Date('2026-08-30T16:00:00.000Z');
      await prisma.match.update({
        where: { id: match.id },
        data:
          terminalStatus === MatchStatus.CANCELLED
            ? { status: terminalStatus, cancelledAt: transitionTime }
            : {
                status: terminalStatus,
                teamAScore: 0,
                teamBScore: 0,
                completedAt: transitionTime,
              },
      });
      continueRecheck.resolve();
      await dispatch;

      expect(gateway.calls).toHaveLength(0);
      await expect(
        prisma.matchReminderDelivery.count({ where: { matchId: match.id } }),
      ).resolves.toBe(0);
    },
  );
});

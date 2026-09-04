import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Attendance,
  MatchStatus,
  PlayerStatus,
  PlayerType,
  PrismaClient,
  UserRole,
  Weekday,
} from '@prisma/client';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';
import type { VerifiedFirebaseIdentity } from '../src/auth/auth.types';
import { FirebaseTokenVerifier } from '../src/auth/firebase-token-verifier.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const validAttributes = {
  speed: 5,
  endurance: 6,
  defense: 7,
  attack: 8,
  technique: 9,
};

function assertDedicatedTestDatabase(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.slice(1);

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must point to a dedicated database whose name ends in "_test".',
    );
  }
}

describeWithDatabase('Match lifecycle and attendance API', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sportId: string;
  const tokenIdentities = new Map<string, string>();
  const firebaseTokenVerifier = {
    verify: vi.fn(async (token: string): Promise<VerifiedFirebaseIdentity> => {
      const authProviderId = tokenIdentities.get(token);

      if (!authProviderId) {
        throw new Error('Invalid Firebase token');
      }

      return { authProviderId };
    }),
  };

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    assertDedicatedTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.FIREBASE_PROJECT_ID = 'teamizer-test';
    prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });

    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FirebaseTokenVerifier)
      .useValue(firebaseTokenVerifier)
      .compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    tokenIdentities.clear();
    firebaseTokenVerifier.verify.mockClear();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Player", "Sport" RESTART IDENTITY CASCADE',
    );
    const sport = await prisma.sport.create({
      data: {
        name: 'Football',
        teamsPerMatch: 2,
        playersOnFieldPerTeam: 3,
      },
    });
    sportId = sport.id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createUser(
    authProviderId: string,
    options: {
      role?: UserRole;
      status?: PlayerStatus;
      name?: string;
    } = {},
  ) {
    return prisma.user.create({
      data: {
        authProviderId,
        role: options.role ?? UserRole.PLAYER,
        player: {
          create: {
            name: options.name ?? authProviderId,
            type: PlayerType.REGULAR,
            status: options.status ?? PlayerStatus.ACTIVE,
            ...validAttributes,
          },
        },
      },
      include: { player: true },
    });
  }

  async function createPlayer(
    name: string,
    options: {
      type?: PlayerType;
      status?: PlayerStatus;
    } = {},
  ) {
    return prisma.player.create({
      data: {
        name,
        type: options.type ?? PlayerType.REGULAR,
        status: options.status ?? PlayerStatus.ACTIVE,
        ...validAttributes,
      },
    });
  }

  async function createMatch(
    options: {
      status?: MatchStatus;
      startsAt?: Date;
      stateVersion?: number;
      location?: string;
    } = {},
  ) {
    return prisma.match.create({
      data: {
        sportId,
        startsAt: options.startsAt ?? new Date('2099-09-01T18:30:00.000Z'),
        status: options.status ?? MatchStatus.OPEN_FOR_REGISTRATION,
        stateVersion: options.stateVersion ?? 0,
        location: options.location ?? 'Pitch A',
        ...(options.status === MatchStatus.FINISHED
          ? { teamAScore: 0, teamBScore: 0, completedAt: new Date() }
          : {}),
      },
    });
  }

  function authorize(token: string, authProviderId: string): string {
    tokenIdentities.set(token, authProviderId);
    return `Bearer ${token}`;
  }

  it('supports GOING, NOT_GOING, changed response, and absent-row unanswered semantics', async () => {
    const user = await createUser('attendance-user');
    const match = await createMatch();
    const authorization = authorize('attendance-token', user.authProviderId);

    await request(app.getHttpServer())
      .post(`/matches/${match.id}/registration`)
      .set('Authorization', authorization)
      .send({})
      .expect(200, { attendance: 'GOING' });

    await request(app.getHttpServer())
      .patch(`/matches/${match.id}/participants/${user.playerId}`)
      .set('Authorization', authorization)
      .send({ attendance: 'NOT_GOING' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          matchId: match.id,
          playerId: user.playerId,
          attendance: 'NOT_GOING',
        });
      });

    expect(
      await prisma.matchParticipant.findUnique({
        where: {
          matchId_playerId: { matchId: match.id, playerId: user.playerId },
        },
      }),
    ).toMatchObject({ attendance: Attendance.NOT_GOING });

    await request(app.getHttpServer())
      .delete(`/matches/${match.id}/registration`)
      .set('Authorization', authorization)
      .expect(204);

    expect(
      await prisma.matchParticipant.findUnique({
        where: {
          matchId_playerId: { matchId: match.id, playerId: user.playerId },
        },
      }),
    ).toBeNull();
    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(3);
  });

  it('keeps duplicate GOING and unanswered requests idempotent', async () => {
    const user = await createUser('retry-user');
    const match = await createMatch();
    const authorization = authorize('retry-token', user.authProviderId);
    const register = () =>
      request(app.getHttpServer())
        .post(`/matches/${match.id}/registration`)
        .set('Authorization', authorization)
        .send({});

    await register().expect(200);
    await register().expect(200);

    expect(
      await prisma.matchParticipant.count({
        where: { matchId: match.id, playerId: user.playerId },
      }),
    ).toBe(1);
    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(1);

    await request(app.getHttpServer())
      .delete(`/matches/${match.id}/registration`)
      .set('Authorization', authorization)
      .expect(204);
    await request(app.getHttpServer())
      .delete(`/matches/${match.id}/registration`)
      .set('Authorization', authorization)
      .expect(204);

    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(2);
  });

  it('serializes concurrent duplicate registration through the Match row lock', async () => {
    const user = await createUser('concurrent-user');
    const match = await createMatch();
    const authorization = authorize('concurrent-token', user.authProviderId);
    const register = () =>
      request(app.getHttpServer())
        .post(`/matches/${match.id}/registration`)
        .set('Authorization', authorization)
        .send({});

    const responses = await Promise.all([register(), register(), register()]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(
      await prisma.matchParticipant.count({
        where: { matchId: match.id, playerId: user.playerId },
      }),
    ).toBe(1);
    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(1);
  });

  it('serializes competing attendance updates without duplicate rows', async () => {
    const user = await createUser('competing-user');
    const match = await createMatch();
    const authorization = authorize('competing-token', user.authProviderId);
    const patchAttendance = (attendance: Attendance) =>
      request(app.getHttpServer())
        .patch(`/matches/${match.id}/participants/${user.playerId}`)
        .set('Authorization', authorization)
        .send({ attendance });

    const responses = await Promise.all([
      patchAttendance(Attendance.GOING),
      patchAttendance(Attendance.NOT_GOING),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.matchParticipant.count({
        where: { matchId: match.id, playerId: user.playerId },
      }),
    ).toBe(1);
    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(2);
  });

  it('blocks an inactive caller from attendance actions', async () => {
    const user = await createUser('inactive-user', {
      status: PlayerStatus.INACTIVE,
    });
    const match = await createMatch();
    const authorization = authorize('inactive-token', user.authProviderId);

    const response = await request(app.getHttpServer())
      .post(`/matches/${match.id}/registration`)
      .set('Authorization', authorization)
      .send({})
      .expect(403);

    expect(response.body.error.code).toBe('PLAYER_INACTIVE');
    expect(await prisma.matchParticipant.count()).toBe(0);
  });

  it.each([
    MatchStatus.IN_PROGRESS,
    MatchStatus.FINISHED,
    MatchStatus.CANCELLED,
  ])('rejects registration when Match status is %s', async (status) => {
    const user = await createUser(`closed-${status}`);
    const match = await createMatch({ status });
    const authorization = authorize(
      `closed-token-${status}`,
      user.authProviderId,
    );

    const response = await request(app.getHttpServer())
      .patch(`/matches/${match.id}/participants/${user.playerId}`)
      .set('Authorization', authorization)
      .send({ attendance: 'GOING' })
      .expect(409);

    expect(response.body.error.code).toBe('ATTENDANCE_LOCKED');
    expect(await prisma.matchParticipant.count()).toBe(0);
  });

  it('allows an active ADMIN to change another active Player attendance', async () => {
    const admin = await createUser('attendance-admin', {
      role: UserRole.ADMIN,
    });
    const target = await createPlayer('Admin target');
    const addedTarget = await createPlayer('Admin-added target');
    const match = await createMatch();
    const authorization = authorize(
      'attendance-admin-token',
      admin.authProviderId,
    );

    await request(app.getHttpServer())
      .patch(`/matches/${match.id}/participants/${target.id}`)
      .set('Authorization', authorization)
      .send({ attendance: 'NOT_GOING' })
      .expect(200);

    expect(
      await prisma.matchParticipant.findUniqueOrThrow({
        where: {
          matchId_playerId: { matchId: match.id, playerId: target.id },
        },
      }),
    ).toMatchObject({ attendance: Attendance.NOT_GOING });

    const addResponse = await request(app.getHttpServer())
      .post(`/matches/${match.id}/participants`)
      .set('Authorization', authorization)
      .send({ playerId: addedTarget.id })
      .expect(201);

    expect(addResponse.body).toEqual({
      participant: {
        matchId: match.id,
        playerId: addedTarget.id,
        attendance: 'GOING',
      },
    });
  });

  it('prevents a PLAYER from changing another existing Player', async () => {
    const actor = await createUser('normal-actor');
    const target = await createPlayer('Other player');
    const match = await createMatch();
    const authorization = authorize('normal-actor-token', actor.authProviderId);

    const response = await request(app.getHttpServer())
      .patch(`/matches/${match.id}/participants/${target.id}`)
      .set('Authorization', authorization)
      .send({ attendance: 'GOING' })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(await prisma.matchParticipant.count()).toBe(0);
  });

  it('rejects unknown and inactive existing participant targets', async () => {
    const admin = await createUser('target-admin', { role: UserRole.ADMIN });
    const inactive = await createPlayer('Inactive target', {
      status: PlayerStatus.INACTIVE,
    });
    const match = await createMatch();
    const authorization = authorize('target-admin-token', admin.authProviderId);

    for (const targetId of [
      inactive.id,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]) {
      const response = await request(app.getHttpServer())
        .post(`/matches/${match.id}/participants`)
        .set('Authorization', authorization)
        .send({ playerId: targetId })
        .expect(422);

      expect(response.body.error.code).toBe('INACTIVE_PARTICIPANT');
    }
  });

  it('makes adding an existing Player ADMIN-only', async () => {
    const actor = await createUser('existing-actor');
    const target = await createPlayer('Existing target');
    const match = await createMatch();
    const authorization = authorize(
      'existing-actor-token',
      actor.authProviderId,
    );

    const response = await request(app.getHttpServer())
      .post(`/matches/${match.id}/participants`)
      .set('Authorization', authorization)
      .send({ playerId: target.id })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('atomically creates a persistent guest and GOING participant without a User', async () => {
    const actor = await createUser('guest-creator');
    const match = await createMatch();
    const authorization = authorize(
      'guest-creator-token',
      actor.authProviderId,
    );

    const response = await request(app.getHttpServer())
      .post(`/matches/${match.id}/participants`)
      .set('Authorization', authorization)
      .send({
        guest: { name: '  Match Guest  ', attributes: validAttributes },
      })
      .expect(201);

    expect(response.body.participant).toMatchObject({
      matchId: match.id,
      playerId: response.body.player.id,
      attendance: 'GOING',
    });
    expect(response.body.player).toMatchObject({
      name: 'Match Guest',
      type: 'GUEST',
      status: 'ACTIVE',
      avatarUrl: null,
    });
    expect(response.body.player).not.toHaveProperty('attributes');
    const guest = await prisma.player.findUniqueOrThrow({
      where: { id: response.body.player.id },
      include: { user: true, participants: true },
    });
    expect(guest.user).toBeNull();
    expect(guest.participants).toHaveLength(1);
    expect(guest.participants[0]).toMatchObject({
      matchId: match.id,
      attendance: Attendance.GOING,
    });
  });

  it('leaves no orphan guest when guest validation or Match state rejects the request', async () => {
    const actor = await createUser('orphan-check');
    const closedMatch = await createMatch({ status: MatchStatus.CANCELLED });
    const authorization = authorize('orphan-check-token', actor.authProviderId);
    const playerCountBefore = await prisma.player.count();

    await request(app.getHttpServer())
      .post(`/matches/${closedMatch.id}/participants`)
      .set('Authorization', authorization)
      .send({ guest: { name: 'Closed guest', attributes: validAttributes } })
      .expect(409);
    await request(app.getHttpServer())
      .post(`/matches/${closedMatch.id}/participants`)
      .set('Authorization', authorization)
      .send({
        guest: {
          name: 'Invalid guest',
          attributes: { ...validAttributes, speed: 0 },
        },
      })
      .expect(400);

    expect(await prisma.player.count()).toBe(playerCountBefore);
    expect(await prisma.matchParticipant.count()).toBe(0);
  });

  it('rolls back a created guest when participant insertion fails', async () => {
    const actor = await createUser('rollback-check');
    const match = await createMatch();
    const authorization = authorize(
      'rollback-check-token',
      actor.authProviderId,
    );
    const playerCountBefore = await prisma.player.count();
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "MatchParticipant"
      ADD CONSTRAINT "test_reject_going_participant"
      CHECK ("attendance" <> 'GOING')
    `);

    try {
      await request(app.getHttpServer())
        .post(`/matches/${match.id}/participants`)
        .set('Authorization', authorization)
        .send({
          guest: { name: 'Rolled back guest', attributes: validAttributes },
        })
        .expect(500);

      expect(await prisma.player.count()).toBe(playerCountBefore);
      expect(await prisma.matchParticipant.count()).toBe(0);
      expect(
        (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
          .stateVersion,
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "MatchParticipant"
        DROP CONSTRAINT "test_reject_going_participant"
      `);
    }
  });

  it('keeps concurrent guest requests atomic without duplicate participant keys', async () => {
    const actor = await createUser('concurrent-guest-creator');
    const match = await createMatch();
    const authorization = authorize(
      'concurrent-guest-token',
      actor.authProviderId,
    );
    const createGuestRequest = () =>
      request(app.getHttpServer())
        .post(`/matches/${match.id}/participants`)
        .set('Authorization', authorization)
        .send({
          guest: { name: 'Concurrent Guest', attributes: validAttributes },
        });

    const responses = await Promise.all([
      createGuestRequest(),
      createGuestRequest(),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([201, 201]);
    const guestIds = responses.map(({ body }) => body.player.id as string);
    expect(new Set(guestIds).size).toBe(2);
    expect(await prisma.player.count({ where: { id: { in: guestIds } } })).toBe(
      2,
    );
    expect(
      await prisma.matchParticipant.count({
        where: { matchId: match.id, playerId: { in: guestIds } },
      }),
    ).toBe(2);
    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(2);
  });

  it('classifies GOING, NOT_GOING, and unanswered active Players without leaking private fields', async () => {
    const caller = await createUser('read-caller', { name: 'Caller' });
    const going = await createPlayer('Going player');
    const notGoing = await createPlayer('Not going player');
    const unanswered = await createPlayer('Unanswered player');
    await createPlayer('Inactive player', { status: PlayerStatus.INACTIVE });
    const match = await createMatch();
    await prisma.matchParticipant.createMany({
      data: [
        {
          matchId: match.id,
          playerId: caller.playerId,
          attendance: Attendance.GOING,
        },
        {
          matchId: match.id,
          playerId: going.id,
          attendance: Attendance.GOING,
        },
        {
          matchId: match.id,
          playerId: notGoing.id,
          attendance: Attendance.NOT_GOING,
        },
      ],
    });
    const authorization = authorize('read-token', caller.authProviderId);

    const response = await request(app.getHttpServer())
      .get(`/matches/${match.id}`)
      .set('Authorization', authorization)
      .expect(200);

    expect(response.body.myAttendance).toBe('GOING');
    expect(
      response.body.participants.going.map(({ id }: { id: string }) => id),
    ).toEqual([caller.playerId, going.id]);
    expect(
      response.body.participants.notGoing.map(({ id }: { id: string }) => id),
    ).toEqual([notGoing.id]);
    expect(
      response.body.participants.unanswered.map(({ id }: { id: string }) => id),
    ).toEqual([unanswered.id]);
    expect(response.body.teams).toBeNull();
    expect(response.body.provenance).toBeNull();
    expect(response.body.result).toBeNull();
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('authProviderId');
    for (const attribute of Object.keys(validAttributes)) {
      expect(serialized).not.toContain(`"${attribute}"`);
    }
  });

  it('allows inactive onboarded users to read Match history', async () => {
    const caller = await createUser('inactive-reader', {
      status: PlayerStatus.INACTIVE,
    });
    const match = await createMatch({ status: MatchStatus.CANCELLED });
    const authorization = authorize(
      'inactive-reader-token',
      caller.authProviderId,
    );

    await request(app.getHttpServer())
      .get(`/matches/${match.id}`)
      .set('Authorization', authorization)
      .expect(200);
  });

  it('keeps every active Match upcoming while excluding overdue OPEN Matches', async () => {
    const caller = await createUser('upcoming-caller');
    const activePast = await createMatch({
      status: MatchStatus.IN_PROGRESS,
      startsAt: new Date('2000-09-01T18:30:00.000Z'),
    });
    await createMatch({
      status: MatchStatus.OPEN_FOR_REGISTRATION,
      startsAt: new Date('2000-09-02T18:30:00.000Z'),
    });
    const later = await createMatch({
      startsAt: new Date('2099-09-02T18:30:00.000Z'),
    });
    const sooner = await createMatch({
      status: MatchStatus.IN_PROGRESS,
      startsAt: new Date('2099-09-01T18:30:00.000Z'),
    });
    await createMatch({
      status: MatchStatus.CANCELLED,
      startsAt: new Date('2099-08-31T18:30:00.000Z'),
    });
    await prisma.matchParticipant.create({
      data: {
        matchId: later.id,
        playerId: caller.playerId,
        attendance: Attendance.NOT_GOING,
      },
    });
    const authorization = authorize('upcoming-token', caller.authProviderId);

    const response = await request(app.getHttpServer())
      .get('/matches/upcoming')
      .set('Authorization', authorization)
      .expect(200);

    expect(response.body.map(({ id }: { id: string }) => id)).toEqual([
      activePast.id,
      sooner.id,
      later.id,
    ]);
    expect(
      response.body.map(
        ({ myAttendance }: { myAttendance: string | null }) => myAttendance,
      ),
    ).toEqual([null, null, 'NOT_GOING']);
  });

  it('paginates Match summaries and uses descending order for CANCELLED', async () => {
    const caller = await createUser('list-caller');
    const older = await createMatch({
      status: MatchStatus.CANCELLED,
      startsAt: new Date('2099-09-01T18:30:00.000Z'),
    });
    const newer = await createMatch({
      status: MatchStatus.CANCELLED,
      startsAt: new Date('2099-09-02T18:30:00.000Z'),
    });
    const authorization = authorize('list-token', caller.authProviderId);

    const first = await request(app.getHttpServer())
      .get('/matches?status=CANCELLED&limit=1')
      .set('Authorization', authorization)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(
        `/matches?status=CANCELLED&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .set('Authorization', authorization)
      .expect(200);

    expect(first.body.items.map(({ id }: { id: string }) => id)).toEqual([
      newer.id,
    ]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    expect(second.body.items.map(({ id }: { id: string }) => id)).toEqual([
      older.id,
    ]);
    expect(second.body.nextCursor).toBeNull();
  });

  it('creates an independent one-off Match that enters the existing lifecycle', async () => {
    const admin = await createUser('manual-match-admin', {
      role: UserRole.ADMIN,
    });
    await prisma.schedule.create({
      data: {
        weekday: Weekday.TUESDAY,
        localStartTime: new Date('1970-01-01T18:00:00.000Z'),
        timeZone: 'Europe/Prague',
        sportId,
      },
    });
    const authorization = authorize(
      'manual-match-admin-token',
      admin.authProviderId,
    );

    const creation = await request(app.getHttpServer())
      .post('/admin/matches')
      .set('Authorization', authorization)
      .send({
        sportId,
        localDate: '2099-07-20',
        localStartTime: '18:30:00',
        location: '  Pitch B  ',
      })
      .expect(201);

    expect(creation.body).toMatchObject({
      sport: { id: sportId, name: 'Football' },
      startsAt: '2099-07-20T16:30:00.000Z',
      location: 'Pitch B',
      status: 'OPEN_FOR_REGISTRATION',
      stateVersion: 0,
    });
    const persisted = await prisma.match.findUniqueOrThrow({
      where: { id: creation.body.id as string },
      include: { participants: true, teams: true },
    });
    expect(persisted).toMatchObject({
      scheduleId: null,
      status: MatchStatus.OPEN_FOR_REGISTRATION,
      startsAt: new Date('2099-07-20T16:30:00.000Z'),
      location: 'Pitch B',
      participants: [],
      teams: [],
    });

    await request(app.getHttpServer())
      .post(`/matches/${persisted.id}/registration`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post(`/matches/${persisted.id}/participants`)
      .set('Authorization', authorization)
      .send({ guest: { name: 'Guest', attributes: validAttributes } })
      .expect(201);
    const proposal = await request(app.getHttpServer())
      .post(`/matches/${persisted.id}/generate-teams`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    const started = await request(app.getHttpServer())
      .post(`/matches/${persisted.id}/start`)
      .set('Authorization', authorization)
      .send({
        teamAPlayerIds: proposal.body.teamAPlayerIds,
        teamBPlayerIds: proposal.body.teamBPlayerIds,
        proposalReceipt: proposal.body.proposalReceipt,
      })
      .expect(200);

    expect(started.body).toMatchObject({
      id: persisted.id,
      status: 'IN_PROGRESS',
      provenance: { mode: 'ALGORITHM' },
    });
    expect(started.body.participants.going).toHaveLength(2);
    expect(started.body.teams).toHaveLength(2);
  });

  it('authorizes one-off creation and Sport discovery for active ADMINs only', async () => {
    const player = await createUser('manual-match-player');
    const inactiveAdmin = await createUser('manual-match-inactive-admin', {
      role: UserRole.ADMIN,
      status: PlayerStatus.INACTIVE,
    });
    const admin = await createUser('manual-match-sport-admin', {
      role: UserRole.ADMIN,
    });
    const requestBody = {
      sportId,
      localDate: '2099-01-20',
      localStartTime: '18:30:00',
      location: null,
    };

    const playerResponse = await request(app.getHttpServer())
      .post('/admin/matches')
      .set(
        'Authorization',
        authorize('manual-player-token', player.authProviderId),
      )
      .send(requestBody)
      .expect(403);
    expect(playerResponse.body.error.code).toBe('FORBIDDEN');

    const inactiveResponse = await request(app.getHttpServer())
      .post('/admin/matches')
      .set(
        'Authorization',
        authorize('manual-inactive-token', inactiveAdmin.authProviderId),
      )
      .send(requestBody)
      .expect(403);
    expect(inactiveResponse.body.error.code).toBe('PLAYER_INACTIVE');

    const sports = await request(app.getHttpServer())
      .get('/admin/sports')
      .set(
        'Authorization',
        authorize('manual-sports-token', admin.authProviderId),
      )
      .expect(200);
    expect(sports.body).toEqual([
      {
        id: sportId,
        name: 'Football',
        teamsPerMatch: 2,
        playersOnFieldPerTeam: 3,
      },
    ]);
    expect(JSON.stringify(sports.body)).not.toContain('speed');
  });

  it('rejects nonexistent, unsupported, and invalid-time manual Matches', async () => {
    const admin = await createUser('manual-validation-admin', {
      role: UserRole.ADMIN,
    });
    const authorization = authorize(
      'manual-validation-token',
      admin.authProviderId,
    );
    const unsupportedSport = await prisma.sport.create({
      data: {
        name: 'Unsupported',
        teamsPerMatch: 3,
        playersOnFieldPerTeam: 3,
      },
    });
    const baseRequest = {
      localDate: '2099-01-20',
      localStartTime: '18:30:00',
      location: 'Pitch',
    };

    for (const invalidSportId of [
      '00000000-0000-4000-8000-000000000099',
      unsupportedSport.id,
    ]) {
      const response = await request(app.getHttpServer())
        .post('/admin/matches')
        .set('Authorization', authorization)
        .send({ ...baseRequest, sportId: invalidSportId })
        .expect(422);
      expect(response.body.error.code).toBe('INVALID_MATCH');
    }

    const dstResponse = await request(app.getHttpServer())
      .post('/admin/matches')
      .set('Authorization', authorization)
      .send({
        ...baseRequest,
        sportId,
        localDate: '2099-10-25',
        localStartTime: '02:30:00',
      })
      .expect(422);
    expect(dstResponse.body.error.code).toBe('INVALID_MATCH');
    await expect(prisma.match.count()).resolves.toBe(0);
  });

  it('allows only an active ADMIN to cancel an OPEN Match', async () => {
    const player = await createUser('cancel-player');
    const admin = await createUser('cancel-admin', { role: UserRole.ADMIN });
    const inactiveAdmin = await createUser('inactive-cancel-admin', {
      role: UserRole.ADMIN,
      status: PlayerStatus.INACTIVE,
    });
    const match = await createMatch();

    const playerResponse = await request(app.getHttpServer())
      .post(`/matches/${match.id}/cancel`)
      .set(
        'Authorization',
        authorize('cancel-player-token', player.authProviderId),
      )
      .send({})
      .expect(403);
    expect(playerResponse.body.error.code).toBe('FORBIDDEN');

    const inactiveResponse = await request(app.getHttpServer())
      .post(`/matches/${match.id}/cancel`)
      .set(
        'Authorization',
        authorize('inactive-cancel-token', inactiveAdmin.authProviderId),
      )
      .send({})
      .expect(403);
    expect(inactiveResponse.body.error.code).toBe('PLAYER_INACTIVE');

    const adminAuthorization = authorize(
      'cancel-admin-token',
      admin.authProviderId,
    );
    const response = await request(app.getHttpServer())
      .post(`/matches/${match.id}/cancel`)
      .set('Authorization', adminAuthorization)
      .send({})
      .expect(200);

    expect(response.body).toMatchObject({
      id: match.id,
      status: 'CANCELLED',
      stateVersion: 1,
    });
    const persisted = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
    });
    expect(persisted.cancelledByUserId).toBe(admin.id);
    expect(persisted.cancelledAt).not.toBeNull();
  });

  it('preserves attendance on cancellation and rejects later attendance changes', async () => {
    const admin = await createUser('preserve-admin', { role: UserRole.ADMIN });
    const match = await createMatch({ stateVersion: 7 });
    await prisma.matchParticipant.create({
      data: {
        matchId: match.id,
        playerId: admin.playerId,
        attendance: Attendance.GOING,
      },
    });
    const authorization = authorize('preserve-token', admin.authProviderId);

    await request(app.getHttpServer())
      .post(`/matches/${match.id}/cancel`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);

    expect(
      await prisma.matchParticipant.count({ where: { matchId: match.id } }),
    ).toBe(1);
    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(8);
    const registrationResponse = await request(app.getHttpServer())
      .delete(`/matches/${match.id}/registration`)
      .set('Authorization', authorization)
      .expect(409);
    expect(registrationResponse.body.error.code).toBe('ATTENDANCE_LOCKED');
    expect(
      await prisma.matchParticipant.count({ where: { matchId: match.id } }),
    ).toBe(1);
  });

  it('rejects repeated and post-start cancellation with approved conflict codes', async () => {
    const admin = await createUser('conflict-admin', { role: UserRole.ADMIN });
    const openMatch = await createMatch();
    const startedMatch = await createMatch({ status: MatchStatus.IN_PROGRESS });
    const authorization = authorize('conflict-token', admin.authProviderId);

    await request(app.getHttpServer())
      .post(`/matches/${openMatch.id}/cancel`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    const repeated = await request(app.getHttpServer())
      .post(`/matches/${openMatch.id}/cancel`)
      .set('Authorization', authorization)
      .send({})
      .expect(409);
    const postStart = await request(app.getHttpServer())
      .post(`/matches/${startedMatch.id}/cancel`)
      .set('Authorization', authorization)
      .send({})
      .expect(409);

    expect(repeated.body.error.code).toBe('MATCH_CANCELLED');
    expect(postStart.body.error.code).toBe('MATCH_NOT_OPEN');
  });
});

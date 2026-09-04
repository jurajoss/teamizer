import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Attendance,
  MatchStatus,
  PlayerStatus,
  PlayerType,
  PrismaClient,
  TeamGenerationMode,
  TeamSide,
  UserRole,
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
const MAX_LOCK_OBSERVATION_CHECKS = 10_000;
const completionRollbackConstraint = 'test_reject_completion_stat';

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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise = (): void => {
    throw new Error('Deferred promise was not initialized.');
  };
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

async function waitForTransactionsBlockedByBackend(
  prisma: PrismaClient,
  blockingBackendPid: number,
  expectedCount: number,
): Promise<void> {
  for (let check = 0; check < MAX_LOCK_OBSERVATION_CHECKS; check += 1) {
    const [lockState] = await prisma.$queryRaw<Array<{ waitingCount: number }>>`
      SELECT COUNT(*)::integer AS "waitingCount"
      FROM pg_stat_activity
      WHERE ${blockingBackendPid} = ANY(pg_blocking_pids(pid))
    `;

    if ((lockState?.waitingCount ?? 0) >= expectedCount) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    `Expected ${expectedCount} completion transactions to wait for the Match lock.`,
  );
}

describeWithDatabase('Match completion API', () => {
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
    process.env.PROPOSAL_RECEIPT_SECRET =
      'test-proposal-receipt-secret-32-characters';
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
      `ALTER TABLE "MatchPlayerStat" DROP CONSTRAINT IF EXISTS "${completionRollbackConstraint}"`,
    );
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
    if (prisma) {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "MatchPlayerStat" DROP CONSTRAINT IF EXISTS "${completionRollbackConstraint}"`,
      );
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createUser(
    authProviderId: string,
    options: { status?: PlayerStatus; role?: UserRole } = {},
  ) {
    return prisma.user.create({
      data: {
        authProviderId,
        role: options.role ?? UserRole.PLAYER,
        player: {
          create: {
            name: authProviderId,
            type: PlayerType.REGULAR,
            status: options.status ?? PlayerStatus.ACTIVE,
            ...validAttributes,
          },
        },
      },
      include: { player: true },
    });
  }

  async function createPlayers(count: number) {
    return Promise.all(
      Array.from({ length: count }, (_, index) =>
        prisma.player.create({
          data: {
            name: `Final Player ${index + 1}`,
            type: PlayerType.REGULAR,
            ...validAttributes,
          },
        }),
      ),
    );
  }

  async function createInProgressMatch(
    options: { playerCount?: number; stateVersion?: number } = {},
  ) {
    const players = await createPlayers(options.playerCount ?? 4);
    const match = await prisma.match.create({
      data: {
        sportId,
        startsAt: new Date('2099-09-01T18:30:00.000Z'),
        status: MatchStatus.IN_PROGRESS,
        startedAt: new Date('2099-09-01T18:30:00.000Z'),
        stateVersion: options.stateVersion ?? 7,
        teamGenerationMode: TeamGenerationMode.ALGORITHM,
        algorithmVersion: 'v1',
        configurationVersion: 'v1',
      },
    });
    const [teamA, teamB] = await Promise.all([
      prisma.team.create({ data: { matchId: match.id, side: TeamSide.A } }),
      prisma.team.create({ data: { matchId: match.id, side: TeamSide.B } }),
    ]);
    const splitIndex = Math.ceil(players.length / 2);

    await prisma.teamMembership.createMany({
      data: players.map(({ id }, index) => ({
        matchId: match.id,
        playerId: id,
        teamId: index < splitIndex ? teamA.id : teamB.id,
      })),
    });
    await prisma.matchParticipant.createMany({
      data: players.map(({ id }) => ({
        matchId: match.id,
        playerId: id,
        attendance: Attendance.GOING,
      })),
    });

    return { match, players, teamA, teamB };
  }

  function authorize(token: string, authProviderId: string): string {
    tokenIdentities.set(token, authProviderId);
    return `Bearer ${token}`;
  }

  function completeRequest(
    matchId: string,
    authorization: string,
    idempotencyKey: string | undefined,
    body: {
      score: { teamA: number; teamB: number };
      playerGoals: Array<{ playerId: string; goals: number }>;
    },
  ) {
    const completion = request(app.getHttpServer())
      .post(`/matches/${matchId}/complete`)
      .set('Authorization', authorization);

    if (idempotencyKey !== undefined) {
      completion.set('Idempotency-Key', idempotencyKey);
    }

    return completion.send(body);
  }

  function oneGoalBody(playerId: string) {
    return {
      score: { teamA: 1, teamB: 0 },
      playerGoals: [{ playerId, goals: 1 }],
    };
  }

  async function lockMatch(matchId: string) {
    const prepared = deferred();
    const release = deferred();
    let backendPid: number | undefined;
    const transaction = prisma.$transaction(async (transactionClient) => {
      const [backend] = await transactionClient.$queryRaw<
        Array<{ pid: number }>
      >`
        SELECT pg_backend_pid() AS "pid"
      `;

      if (!backend) {
        throw new Error('Could not identify the blocking transaction.');
      }

      backendPid = backend.pid;
      await transactionClient.$queryRaw`
        SELECT "id"
        FROM "Match"
        WHERE "id" = ${matchId}::uuid
        FOR UPDATE
      `;
      prepared.resolve();
      await release.promise;
    });

    await prepared.promise;

    if (backendPid === undefined) {
      throw new Error('Blocking transaction backend PID is missing.');
    }

    return { backendPid, release: release.resolve, transaction };
  }

  it('returns persisted final teams for local scoring without leaking private fields', async () => {
    const caller = await createUser('detail-caller');
    const fixture = await createInProgressMatch();
    const authorization = authorize('detail-token', caller.authProviderId);

    const response = await request(app.getHttpServer())
      .get(`/matches/${fixture.match.id}`)
      .set('Authorization', authorization)
      .expect(200);

    expect(response.body).toMatchObject({
      id: fixture.match.id,
      status: 'IN_PROGRESS',
      result: null,
      provenance: {
        mode: 'ALGORITHM',
        algorithmVersion: 'v1',
        configurationVersion: 'v1',
      },
    });
    expect(response.body.teams).toHaveLength(2);
    expect(
      response.body.teams.flatMap((team: { players: Array<{ id: string }> }) =>
        team.players.map(({ id }) => id),
      ),
    ).toHaveLength(fixture.players.length);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('authProviderId');
    for (const attribute of Object.keys(validAttributes)) {
      expect(serialized).not.toContain(`"${attribute}"`);
    }
  });

  it('atomically persists a valid sparse completion and returns finished detail', async () => {
    const caller = await createUser('completion-caller');
    const fixture = await createInProgressMatch({ stateVersion: 11 });
    const firstPlayer = fixture.players[0];
    const thirdPlayer = fixture.players[2];

    if (!firstPlayer || !thirdPlayer) {
      throw new Error('Expected four final Player fixtures.');
    }

    const response = await completeRequest(
      fixture.match.id,
      authorize('completion-token', caller.authProviderId),
      'valid-completion-key',
      {
        score: { teamA: 3, teamB: 1 },
        playerGoals: [
          { playerId: thirdPlayer.id, goals: 2 },
          { playerId: firstPlayer.id, goals: 2 },
        ],
      },
    ).expect(201);

    expect(response.headers['idempotent-replay']).toBeUndefined();
    expect(response.body).toMatchObject({
      id: fixture.match.id,
      status: 'FINISHED',
      stateVersion: 12,
      result: { score: { teamA: 3, teamB: 1 } },
      provenance: {
        mode: 'ALGORITHM',
        algorithmVersion: 'v1',
        configurationVersion: 'v1',
      },
    });
    expect(response.body.teams).toHaveLength(2);
    expect(response.body.result.playerGoals).toHaveLength(4);
    const persistedMatch = await prisma.match.findUniqueOrThrow({
      where: { id: fixture.match.id },
    });
    const persistedStats = await prisma.matchPlayerStat.findMany({
      where: { matchId: fixture.match.id },
      orderBy: { playerId: 'asc' },
    });

    expect(persistedMatch).toMatchObject({
      status: MatchStatus.FINISHED,
      teamAScore: 3,
      teamBScore: 1,
      stateVersion: 12,
    });
    expect(persistedMatch.completedAt).not.toBeNull();
    expect(persistedStats).toHaveLength(4);
    expect(
      persistedStats.find(({ playerId }) => playerId === firstPlayer.id)?.goals,
    ).toBe(2);
    expect(
      persistedStats.find(({ playerId }) => playerId === thirdPlayer.id)?.goals,
    ).toBe(2);
    expect(persistedStats.filter(({ goals }) => goals === 0)).toHaveLength(2);
    expect(
      await prisma.matchCompletionIdempotency.count({
        where: { matchId: fixture.match.id },
      }),
    ).toBe(1);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('authProviderId');
    for (const attribute of Object.keys(validAttributes)) {
      expect(serialized).not.toContain(`"${attribute}"`);
    }
  });

  it('rejects missing or invalid-length idempotency keys', async () => {
    const caller = await createUser('key-caller');
    const fixture = await createInProgressMatch();
    const player = fixture.players[0];

    if (!player) {
      throw new Error('Expected a final Player fixture.');
    }

    const authorization = authorize('key-token', caller.authProviderId);
    const body = oneGoalBody(player.id);

    for (const idempotencyKey of [undefined, 'short']) {
      const response = await completeRequest(
        fixture.match.id,
        authorization,
        idempotencyKey,
        body,
      ).expect(400);

      expect(response.body.error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    }
    expect(
      await prisma.matchCompletionIdempotency.count({
        where: { matchId: fixture.match.id },
      }),
    ).toBe(0);
  });

  it('rejects invalid completion values without consuming idempotency data', async () => {
    const caller = await createUser('validation-caller', {
      role: UserRole.ADMIN,
    });
    const outsider = await prisma.player.create({
      data: {
        name: 'Outsider',
        type: PlayerType.REGULAR,
        ...validAttributes,
      },
    });
    const authorization = authorize('validation-token', caller.authProviderId);
    const cases = [
      {
        name: 'negative score',
        expectedCode: 'INVALID_SCORE',
        body: (playerId: string) => ({
          score: { teamA: -1, teamB: 0 },
          playerGoals: [{ playerId, goals: 0 }],
        }),
      },
      {
        name: 'fractional score',
        expectedCode: 'INVALID_SCORE',
        body: (playerId: string) => ({
          score: { teamA: 0.5, teamB: 0 },
          playerGoals: [{ playerId, goals: 0 }],
        }),
      },
      {
        name: 'out-of-range score',
        expectedCode: 'INVALID_SCORE',
        body: (playerId: string) => ({
          score: { teamA: 2_147_483_648, teamB: 0 },
          playerGoals: [{ playerId, goals: 0 }],
        }),
      },
      {
        name: 'negative Player goals',
        expectedCode: 'INVALID_PLAYER_GOALS',
        body: (playerId: string) => ({
          score: { teamA: 0, teamB: 0 },
          playerGoals: [{ playerId, goals: -1 }],
        }),
      },
      {
        name: 'fractional Player goals',
        expectedCode: 'INVALID_PLAYER_GOALS',
        body: (playerId: string) => ({
          score: { teamA: 0, teamB: 0 },
          playerGoals: [{ playerId, goals: 0.5 }],
        }),
      },
      {
        name: 'out-of-range Player goals',
        expectedCode: 'INVALID_PLAYER_GOALS',
        body: (playerId: string) => ({
          score: { teamA: 0, teamB: 0 },
          playerGoals: [{ playerId, goals: 2_147_483_648 }],
        }),
      },
      {
        name: 'duplicate Player goals',
        expectedCode: 'INVALID_PLAYER_GOALS',
        body: (playerId: string) => ({
          score: { teamA: 2, teamB: 0 },
          playerGoals: [
            { playerId, goals: 1 },
            { playerId, goals: 1 },
          ],
        }),
      },
      {
        name: 'non-participant Player',
        expectedCode: 'INVALID_PLAYER_GOALS',
        body: () => ({
          score: { teamA: 1, teamB: 0 },
          playerGoals: [{ playerId: outsider.id, goals: 1 }],
        }),
      },
      {
        name: 'goal total mismatch',
        expectedCode: 'GOAL_TOTAL_MISMATCH',
        body: (playerId: string) => ({
          score: { teamA: 2, teamB: 0 },
          playerGoals: [{ playerId, goals: 1 }],
        }),
      },
    ];

    for (const [index, testCase] of cases.entries()) {
      const fixture = await createInProgressMatch();
      const player = fixture.players[0];

      if (!player) {
        throw new Error('Expected a final Player fixture.');
      }

      const response = await completeRequest(
        fixture.match.id,
        authorization,
        `validation-key-${index}`,
        testCase.body(player.id),
      ).expect(422);

      expect(response.body.error.code, testCase.name).toBe(
        testCase.expectedCode,
      );
      expect(
        await prisma.match.findUniqueOrThrow({
          where: { id: fixture.match.id },
        }),
      ).toMatchObject({
        status: MatchStatus.IN_PROGRESS,
        stateVersion: fixture.match.stateVersion,
        teamAScore: null,
        teamBScore: null,
        completedAt: null,
      });
      expect(
        await prisma.matchPlayerStat.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(0);
      expect(
        await prisma.matchCompletionIdempotency.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(0);
    }
  });

  it('rejects completion when persisted final teams are missing', async () => {
    const caller = await createUser('missing-teams-caller');
    const match = await prisma.match.create({
      data: {
        sportId,
        startsAt: new Date('2099-09-02T18:30:00.000Z'),
        status: MatchStatus.IN_PROGRESS,
        startedAt: new Date('2099-09-02T18:30:00.000Z'),
      },
    });

    const response = await completeRequest(
      match.id,
      authorize('missing-teams-token', caller.authProviderId),
      'missing-teams-key',
      { score: { teamA: 0, teamB: 0 }, playerGoals: [] },
    ).expect(422);

    expect(response.body.error.code).toBe('INVALID_PLAYER_GOALS');
    expect(await prisma.matchCompletionIdempotency.count()).toBe(0);
  });

  it('rejects a Match that is not in progress before validating teams', async () => {
    const caller = await createUser('not-in-progress-caller');
    const match = await prisma.match.create({
      data: {
        sportId,
        startsAt: new Date('2099-09-03T18:30:00.000Z'),
        status: MatchStatus.OPEN_FOR_REGISTRATION,
      },
    });

    const response = await completeRequest(
      match.id,
      authorize('not-in-progress-token', caller.authProviderId),
      'not-in-progress-key',
      { score: { teamA: 0, teamB: 0 }, playerGoals: [] },
    ).expect(409);

    expect(response.body.error.code).toBe('MATCH_NOT_IN_PROGRESS');
    expect(await prisma.matchCompletionIdempotency.count()).toBe(0);
  });

  it('requires an active caller but does not require final-team membership', async () => {
    const activeCaller = await createUser('active-outsider');
    const inactiveCaller = await createUser('inactive-outsider', {
      status: PlayerStatus.INACTIVE,
    });
    const inactiveFixture = await createInProgressMatch();
    const inactivePlayer = inactiveFixture.players[0];

    if (!inactivePlayer) {
      throw new Error('Expected a final Player fixture.');
    }

    const rejected = await completeRequest(
      inactiveFixture.match.id,
      authorize('inactive-token', inactiveCaller.authProviderId),
      'inactive-caller-key',
      oneGoalBody(inactivePlayer.id),
    ).expect(403);

    expect(rejected.body.error.code).toBe('PLAYER_INACTIVE');

    const activeFixture = await createInProgressMatch();
    const activePlayer = activeFixture.players[0];

    if (!activePlayer) {
      throw new Error('Expected a final Player fixture.');
    }

    await completeRequest(
      activeFixture.match.id,
      authorize('active-token', activeCaller.authProviderId),
      'active-outsider-key',
      oneGoalBody(activePlayer.id),
    ).expect(201);
  });

  it('normalizes omitted zero totals for safe replay and rejects key reuse', async () => {
    const caller = await createUser('replay-caller');
    const fixture = await createInProgressMatch();
    const scorer = fixture.players[0];

    if (!scorer) {
      throw new Error('Expected a final Player fixture.');
    }

    const authorization = authorize('replay-token', caller.authProviderId);
    const idempotencyKey = 'normalized-replay-key';
    const first = await completeRequest(
      fixture.match.id,
      authorization,
      idempotencyKey,
      {
        score: { teamA: 2, teamB: 0 },
        playerGoals: [{ playerId: scorer.id, goals: 2 }],
      },
    ).expect(201);
    const replay = await completeRequest(
      fixture.match.id,
      authorization,
      idempotencyKey,
      {
        score: { teamA: 2, teamB: 0 },
        playerGoals: [...fixture.players]
          .reverse()
          .map(({ id }) => ({ playerId: id, goals: id === scorer.id ? 2 : 0 })),
      },
    ).expect(200);

    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body).toEqual(first.body);

    const reused = await completeRequest(
      fixture.match.id,
      authorization,
      idempotencyKey,
      oneGoalBody(scorer.id),
    ).expect(409);

    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(
      await prisma.matchPlayerStat.count({
        where: { matchId: fixture.match.id },
      }),
    ).toBe(4);
    expect(
      await prisma.matchCompletionIdempotency.count({
        where: { matchId: fixture.match.id },
      }),
    ).toBe(1);
  });

  it('allows exactly one of two concurrent distinct completions to finish', async () => {
    const caller = await createUser('distinct-race-caller');
    const fixture = await createInProgressMatch({ stateVersion: 4 });
    const firstPlayer = fixture.players[0];
    const secondPlayer = fixture.players[1];

    if (!firstPlayer || !secondPlayer) {
      throw new Error('Expected final Player fixtures.');
    }

    const authorization = authorize(
      'distinct-race-token',
      caller.authProviderId,
    );
    const blocker = await lockMatch(fixture.match.id);
    const responsesPromise = Promise.all([
      completeRequest(fixture.match.id, authorization, 'distinct-race-key-a', {
        score: { teamA: 2, teamB: 0 },
        playerGoals: [{ playerId: firstPlayer.id, goals: 2 }],
      }),
      completeRequest(
        fixture.match.id,
        authorization,
        'distinct-race-key-b',
        oneGoalBody(secondPlayer.id),
      ),
    ]);

    try {
      await waitForTransactionsBlockedByBackend(prisma, blocker.backendPid, 1);
      blocker.release();
      await blocker.transaction;
      const responses = await responsesPromise;

      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(
        responses.find(({ status }) => status === 409)?.body.error.code,
      ).toBe('MATCH_ALREADY_FINISHED');
      const winner = responses.find(({ status }) => status === 201);
      const persisted = await prisma.match.findUniqueOrThrow({
        where: { id: fixture.match.id },
      });

      expect(persisted).toMatchObject({
        status: MatchStatus.FINISHED,
        stateVersion: 5,
        teamAScore: winner?.body.result.score.teamA,
        teamBScore: winner?.body.result.score.teamB,
      });
      expect(
        await prisma.matchCompletionIdempotency.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(1);
      expect(
        await prisma.matchPlayerStat.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(fixture.players.length);
    } finally {
      blocker.release();
      await Promise.allSettled([blocker.transaction, responsesPromise]);
    }
  }, 15_000);

  it('serializes concurrent same-key requests with the same normalized payload', async () => {
    const caller = await createUser('same-race-caller');
    const fixture = await createInProgressMatch();
    const scorer = fixture.players[0];

    if (!scorer) {
      throw new Error('Expected a final Player fixture.');
    }

    const authorization = authorize('same-race-token', caller.authProviderId);
    const blocker = await lockMatch(fixture.match.id);
    const body = oneGoalBody(scorer.id);
    const responsesPromise = Promise.all([
      completeRequest(fixture.match.id, authorization, 'same-race-key', body),
      completeRequest(fixture.match.id, authorization, 'same-race-key', body),
    ]);

    try {
      await waitForTransactionsBlockedByBackend(prisma, blocker.backendPid, 1);
      blocker.release();
      await blocker.transaction;
      const responses = await responsesPromise;

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(
        responses.find(({ status }) => status === 200)?.headers[
          'idempotent-replay'
        ],
      ).toBe('true');
      expect(
        await prisma.matchCompletionIdempotency.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(1);
      expect(
        await prisma.matchPlayerStat.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(fixture.players.length);
    } finally {
      blocker.release();
      await Promise.allSettled([blocker.transaction, responsesPromise]);
    }
  }, 15_000);

  it('serializes concurrent same-key requests with different payloads', async () => {
    const caller = await createUser('reuse-race-caller');
    const fixture = await createInProgressMatch();
    const firstPlayer = fixture.players[0];
    const secondPlayer = fixture.players[1];

    if (!firstPlayer || !secondPlayer) {
      throw new Error('Expected final Player fixtures.');
    }

    const authorization = authorize('reuse-race-token', caller.authProviderId);
    const blocker = await lockMatch(fixture.match.id);
    const responsesPromise = Promise.all([
      completeRequest(
        fixture.match.id,
        authorization,
        'reuse-race-key',
        oneGoalBody(firstPlayer.id),
      ),
      completeRequest(fixture.match.id, authorization, 'reuse-race-key', {
        score: { teamA: 0, teamB: 2 },
        playerGoals: [{ playerId: secondPlayer.id, goals: 2 }],
      }),
    ]);

    try {
      await waitForTransactionsBlockedByBackend(prisma, blocker.backendPid, 1);
      blocker.release();
      await blocker.transaction;
      const responses = await responsesPromise;

      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      expect(
        responses.find(({ status }) => status === 409)?.body.error.code,
      ).toBe('IDEMPOTENCY_KEY_REUSED');
      const winner = responses.find(({ status }) => status === 201);
      const persisted = await prisma.match.findUniqueOrThrow({
        where: { id: fixture.match.id },
      });

      expect(persisted).toMatchObject({
        teamAScore: winner?.body.result.score.teamA,
        teamBScore: winner?.body.result.score.teamB,
      });
      expect(
        await prisma.matchCompletionIdempotency.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(1);
    } finally {
      blocker.release();
      await Promise.allSettled([blocker.transaction, responsesPromise]);
    }
  }, 15_000);

  it('rejects a different key after completion with the approved state conflict', async () => {
    const caller = await createUser('finished-caller');
    const fixture = await createInProgressMatch();
    const scorer = fixture.players[0];

    if (!scorer) {
      throw new Error('Expected a final Player fixture.');
    }

    const authorization = authorize('finished-token', caller.authProviderId);
    await completeRequest(
      fixture.match.id,
      authorization,
      'finished-first-key',
      oneGoalBody(scorer.id),
    ).expect(201);
    const response = await completeRequest(
      fixture.match.id,
      authorization,
      'finished-second-key',
      oneGoalBody(scorer.id),
    ).expect(409);

    expect(response.body.error.code).toBe('MATCH_ALREADY_FINISHED');
  });

  it('rolls back the entire completion and leaves the key reusable after a database failure', async () => {
    const caller = await createUser('rollback-caller');
    const fixture = await createInProgressMatch({ stateVersion: 9 });
    const scorer = fixture.players[0];

    if (!scorer) {
      throw new Error('Expected a final Player fixture.');
    }

    const authorization = authorize('rollback-token', caller.authProviderId);
    const idempotencyKey = 'rollback-completion-key';
    const body = oneGoalBody(scorer.id);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "MatchPlayerStat"
      ADD CONSTRAINT "${completionRollbackConstraint}"
      CHECK ("playerId" <> '${scorer.id}'::uuid)
    `);

    try {
      await completeRequest(
        fixture.match.id,
        authorization,
        idempotencyKey,
        body,
      ).expect(500);

      expect(
        await prisma.match.findUniqueOrThrow({
          where: { id: fixture.match.id },
        }),
      ).toMatchObject({
        status: MatchStatus.IN_PROGRESS,
        stateVersion: 9,
        teamAScore: null,
        teamBScore: null,
        completedAt: null,
      });
      expect(
        await prisma.matchCompletionIdempotency.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(0);
      expect(
        await prisma.matchPlayerStat.count({
          where: { matchId: fixture.match.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "MatchPlayerStat" DROP CONSTRAINT IF EXISTS "${completionRollbackConstraint}"`,
      );
    }

    await completeRequest(
      fixture.match.id,
      authorization,
      idempotencyKey,
      body,
    ).expect(201);
  });
});

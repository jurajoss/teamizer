import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TeamGenerationInput } from '@teamizer/algorithm';
import {
  Attendance,
  MatchStatus,
  PlayerStatus,
  PlayerType,
  PrismaClient,
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
import { TeamGenerationDataService } from '../src/matches/team-generation-data.service';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

const validAttributes = {
  speed: 5,
  endurance: 6,
  defense: 7,
  attack: 8,
  technique: 9,
};

type ProposalResponse = {
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  balance: { balanceScore: number; historyScore: number };
  algorithmVersion: string;
  configurationVersion: string;
  proposalReceipt: string;
};

const MAX_LOCK_OBSERVATION_CHECKS = 10_000;

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

async function waitForBlockedMatchPlayerStatRead(
  prisma: PrismaClient,
): Promise<void> {
  for (let check = 0; check < MAX_LOCK_OBSERVATION_CHECKS; check += 1) {
    const [lockState] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks
        WHERE relation = '"MatchPlayerStat"'::regclass
          AND mode = 'AccessShareLock'
          AND NOT granted
      ) AS "waiting"
    `;

    if (lockState?.waiting) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    'Proposal generation did not reach the blocked MatchPlayerStat read.',
  );
}

async function waitForBlockedMatchPlayerStatWrite(
  prisma: PrismaClient,
): Promise<void> {
  for (let check = 0; check < MAX_LOCK_OBSERVATION_CHECKS; check += 1) {
    const [lockState] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_locks
        WHERE relation = '"MatchPlayerStat"'::regclass
          AND mode = 'RowExclusiveLock'
          AND NOT granted
      ) AS "waiting"
    `;

    if (lockState?.waiting) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error(
    'Match completion did not reach the blocked MatchPlayerStat write.',
  );
}

async function waitForTransactionBlockedByBackend(
  prisma: PrismaClient,
  blockingBackendPid: number,
): Promise<void> {
  for (let check = 0; check < MAX_LOCK_OBSERVATION_CHECKS; check += 1) {
    const [lockState] = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE ${blockingBackendPid} = ANY(pg_blocking_pids(pid))
      ) AS "waiting"
    `;

    if (lockState?.waiting) {
      return;
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  throw new Error('The expected transaction did not reach its row lock wait.');
}

describeWithDatabase('team generation and Match Start API', () => {
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
            name: `Player ${index + 1}`,
            type: PlayerType.REGULAR,
            speed: (index % 10) + 1,
            endurance: ((index + 2) % 10) + 1,
            defense: ((index + 4) % 10) + 1,
            attack: ((index + 6) % 10) + 1,
            technique: ((index + 8) % 10) + 1,
          },
        }),
      ),
    );
  }

  async function createMatch(
    options: {
      status?: MatchStatus;
      stateVersion?: number;
      sport?: string;
    } = {},
  ) {
    return prisma.match.create({
      data: {
        sportId: options.sport ?? sportId,
        startsAt: new Date('2099-09-01T18:30:00.000Z'),
        status: options.status ?? MatchStatus.OPEN_FOR_REGISTRATION,
        stateVersion: options.stateVersion ?? 0,
      },
    });
  }

  async function addGoing(matchId: string, playerIds: string[]): Promise<void> {
    await prisma.matchParticipant.createMany({
      data: playerIds.map((playerId) => ({
        matchId,
        playerId,
        attendance: Attendance.GOING,
      })),
    });
  }

  function authorize(token: string, authProviderId: string): string {
    tokenIdentities.set(token, authProviderId);
    return `Bearer ${token}`;
  }

  async function generate(
    matchId: string,
    authorization: string,
  ): Promise<ProposalResponse> {
    const response = await request(app.getHttpServer())
      .post(`/matches/${matchId}/generate-teams`)
      .set('Authorization', authorization)
      .send({})
      .expect(200);

    return response.body as ProposalResponse;
  }

  function startBody(proposal: ProposalResponse) {
    return {
      teamAPlayerIds: proposal.teamAPlayerIds,
      teamBPlayerIds: proposal.teamBPlayerIds,
      proposalReceipt: proposal.proposalReceipt,
    };
  }

  it.each([0, 1])(
    'rejects generation with %i GOING participants',
    async (goingCount) => {
      const user = await createUser(`few-${goingCount}`);
      const match = await createMatch();
      const players = await createPlayers(goingCount);
      await addGoing(
        match.id,
        players.map(({ id }) => id),
      );
      const authorization = authorize(
        `few-token-${goingCount}`,
        user.authProviderId,
      );

      const response = await request(app.getHttpServer())
        .post(`/matches/${match.id}/generate-teams`)
        .set('Authorization', authorization)
        .send({})
        .expect(422);

      expect(response.body.error.code).toBe('INSUFFICIENT_GOING_PLAYERS');
    },
  );

  it('returns a complete valid proposal without exposing balancing inputs', async () => {
    const user = await createUser('proposal-user');
    const players = await createPlayers(5);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize('proposal-token', user.authProviderId);

    const proposal = await generate(match.id, authorization);
    const proposedIds = [
      ...proposal.teamAPlayerIds,
      ...proposal.teamBPlayerIds,
    ];

    expect(new Set(proposedIds)).toEqual(new Set(players.map(({ id }) => id)));
    expect(new Set(proposedIds).size).toBe(players.length);
    expect(
      Math.abs(proposal.teamAPlayerIds.length - proposal.teamBPlayerIds.length),
    ).toBeLessThanOrEqual(1);
    expect(proposal).toMatchObject({
      algorithmVersion: 'v1',
      configurationVersion: 'v1',
      proposalReceipt: expect.any(String),
      balance: {
        balanceScore: expect.any(Number),
        historyScore: expect.any(Number),
      },
    });
    const serialized = JSON.stringify(proposal);
    for (const attribute of Object.keys(validAttributes)) {
      expect(serialized).not.toContain(`"${attribute}"`);
    }
    expect(serialized).not.toContain('authProviderId');
  });

  it('never persists proposals, including repeated generation', async () => {
    const user = await createUser('non-persistent-user');
    const players = await createPlayers(4);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize(
      'non-persistent-token',
      user.authProviderId,
    );

    const first = await generate(match.id, authorization);
    const second = await generate(match.id, authorization);

    expect(first).toEqual(second);
    expect(await prisma.team.count()).toBe(0);
    expect(await prisma.teamMembership.count()).toBe(0);
    expect(
      (await prisma.match.findUniqueOrThrow({ where: { id: match.id } }))
        .stateVersion,
    ).toBe(0);
  });

  it('uses persisted finished results and recent team history as algorithm input', async () => {
    const user = await createUser('history-user');
    const players = await createPlayers(4);
    const currentMatch = await createMatch();
    await addGoing(
      currentMatch.id,
      players.map(({ id }) => id),
    );
    const historicalMatch = await prisma.match.create({
      data: {
        sportId,
        startsAt: new Date('2099-08-01T18:30:00.000Z'),
        status: MatchStatus.FINISHED,
        teamAScore: 2,
        teamBScore: 2,
        completedAt: new Date('2099-08-01T20:00:00.000Z'),
      },
    });
    const [teamA, teamB] = await Promise.all([
      prisma.team.create({
        data: { matchId: historicalMatch.id, side: TeamSide.A },
      }),
      prisma.team.create({
        data: { matchId: historicalMatch.id, side: TeamSide.B },
      }),
    ]);
    await prisma.teamMembership.createMany({
      data: players.map(({ id }, index) => ({
        matchId: historicalMatch.id,
        playerId: id,
        teamId: index < 2 ? teamA.id : teamB.id,
      })),
    });
    await prisma.matchPlayerStat.createMany({
      data: players.map(({ id }) => ({
        matchId: historicalMatch.id,
        playerId: id,
        goals: 1,
      })),
    });
    const authorization = authorize('history-token', user.authProviderId);

    const proposal = await generate(currentMatch.id, authorization);

    expect(proposal.balance.historyScore).toBeGreaterThan(0);
  });

  it('uses one stable snapshot while another Match completion commits', async () => {
    const user = await createUser('snapshot-user');
    const players = await createPlayers(4);
    const currentMatch = await createMatch();
    await addGoing(
      currentMatch.id,
      players.map(({ id }) => id),
    );
    const historicalMatch = await prisma.match.create({
      data: {
        sportId,
        startsAt: new Date('2099-08-01T18:30:00.000Z'),
        status: MatchStatus.IN_PROGRESS,
        startedAt: new Date('2099-08-01T18:30:00.000Z'),
      },
    });
    const [historicalTeamA, historicalTeamB] = await Promise.all([
      prisma.team.create({
        data: { matchId: historicalMatch.id, side: TeamSide.A },
      }),
      prisma.team.create({
        data: { matchId: historicalMatch.id, side: TeamSide.B },
      }),
    ]);
    await prisma.teamMembership.createMany({
      data: players.map(({ id }, index) => ({
        matchId: historicalMatch.id,
        playerId: id,
        teamId: index < 2 ? historicalTeamA.id : historicalTeamB.id,
      })),
    });
    const authorization = authorize('snapshot-token', user.authProviderId);
    const preCompletionProposal = await generate(
      currentMatch.id,
      authorization,
    );
    const teamGenerationData = app.get(TeamGenerationDataService);
    const originalLoad = teamGenerationData.load.bind(teamGenerationData);
    const observedInputs: TeamGenerationInput[] = [];
    const loadSpy = vi
      .spyOn(teamGenerationData, 'load')
      .mockImplementation(async (transaction, matchId) => {
        const context = await originalLoad(transaction, matchId);
        observedInputs.push(context.input);
        return context;
      });
    const tableLockPrepared = deferred();
    const allowTableUnlock = deferred();
    const tableLock = prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        'LOCK TABLE "MatchPlayerStat" IN ACCESS EXCLUSIVE MODE',
      );
      tableLockPrepared.resolve();
      await allowTableUnlock.promise;
    });

    await tableLockPrepared.promise;
    const firstPlayer = players[0];

    if (!firstPlayer) {
      throw new Error('Expected a historical Player fixture.');
    }

    const completion = request(app.getHttpServer())
      .post(`/matches/${historicalMatch.id}/complete`)
      .set('Authorization', authorization)
      .set('Idempotency-Key', 'snapshot-completion-key')
      .send({
        score: { teamA: 2, teamB: 0 },
        playerGoals: [{ playerId: firstPlayer.id, goals: 2 }],
      })
      .expect(201)
      .then((response) => response);
    let duringCompletion: Promise<ProposalResponse> | undefined;

    try {
      await waitForBlockedMatchPlayerStatWrite(prisma);
      duringCompletion = generate(currentMatch.id, authorization);
      await waitForBlockedMatchPlayerStatRead(prisma);
      allowTableUnlock.resolve();
      await tableLock;
      await completion;

      const duringCompletionProposal = await duringCompletion;
      const postCompletionProposal = await generate(
        currentMatch.id,
        authorization,
      );

      expect(duringCompletionProposal).toEqual(preCompletionProposal);
      expect(postCompletionProposal.balance.historyScore).toBeGreaterThan(0);
      expect(observedInputs).toHaveLength(2);

      const preCompletionInput = observedInputs[0];
      const postCompletionInput = observedInputs[1];

      expect(preCompletionInput?.history).toEqual([]);
      expect(postCompletionInput?.history).toHaveLength(1);

      for (const [index, player] of players.entries()) {
        const before = preCompletionInput?.referencePlayers.find(
          ({ id }) => id === player.id,
        );
        const after = postCompletionInput?.referencePlayers.find(
          ({ id }) => id === player.id,
        );

        expect(before?.statistics).toEqual({
          matches: 0,
          wins: 0,
          goals: 0,
          recentOutcomes: [],
        });
        expect(after?.statistics).toEqual({
          matches: 1,
          wins: index < 2 ? 1 : 0,
          goals: index === 0 ? 2 : 0,
          recentOutcomes: [index < 2 ? 1 : -1],
        });
      }
    } finally {
      allowTableUnlock.resolve();
      await Promise.allSettled([
        tableLock,
        completion,
        ...(duringCompletion ? [duringCompletion] : []),
      ]);
      loadSpy.mockRestore();
    }
  }, 15_000);

  it('retries generation when an attendance commit changes the locked Match', async () => {
    const user = await createUser('generation-retry-user');
    const players = await createPlayers(3);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const changedPlayer = players[0];

    if (!changedPlayer) {
      throw new Error('Expected a Player fixture.');
    }

    const authorization = authorize(
      'generation-retry-token',
      user.authProviderId,
    );
    const attendancePrepared = deferred();
    const allowAttendanceCommit = deferred();
    let blockingBackendPid: number | undefined;
    const attendanceMutation = prisma.$transaction(async (transaction) => {
      const [backend] = await transaction.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS "pid"
      `;

      if (!backend) {
        throw new Error('Could not identify the attendance transaction.');
      }

      blockingBackendPid = backend.pid;
      await transaction.$queryRaw`
        SELECT "id"
        FROM "Match"
        WHERE "id" = ${match.id}::uuid
        FOR UPDATE
      `;
      await transaction.matchParticipant.update({
        where: {
          matchId_playerId: {
            matchId: match.id,
            playerId: changedPlayer.id,
          },
        },
        data: { attendance: Attendance.NOT_GOING },
      });
      await transaction.match.update({
        where: { id: match.id },
        data: { stateVersion: { increment: 1 } },
      });
      attendancePrepared.resolve();
      await allowAttendanceCommit.promise;
    });

    await attendancePrepared.promise;

    if (blockingBackendPid === undefined) {
      throw new Error('Attendance transaction backend PID is missing.');
    }

    const generation = generate(match.id, authorization);

    try {
      await waitForTransactionBlockedByBackend(prisma, blockingBackendPid);
      allowAttendanceCommit.resolve();
      await attendanceMutation;

      const proposal = await generation;
      const proposedIds = [
        ...proposal.teamAPlayerIds,
        ...proposal.teamBPlayerIds,
      ];

      expect(proposedIds).not.toContain(changedPlayer.id);
      expect(new Set(proposedIds)).toEqual(
        new Set(players.slice(1).map(({ id }) => id)),
      );
      expect(
        await prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
      ).toMatchObject({ stateVersion: 1 });
    } finally {
      allowAttendanceCommit.resolve();
      await Promise.allSettled([attendanceMutation, generation]);
    }
  }, 15_000);

  it('rejects generation outside OPEN and for an unsupported MVP Sport shape', async () => {
    const user = await createUser('generation-state-user');
    const players = await createPlayers(2);
    const closedMatch = await createMatch({ status: MatchStatus.IN_PROGRESS });
    const unsupportedSport = await prisma.sport.create({
      data: {
        name: 'Three-team sport',
        teamsPerMatch: 3,
        playersOnFieldPerTeam: 1,
      },
    });
    const unsupportedMatch = await createMatch({ sport: unsupportedSport.id });
    await addGoing(
      unsupportedMatch.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize(
      'generation-state-token',
      user.authProviderId,
    );

    const closedResponse = await request(app.getHttpServer())
      .post(`/matches/${closedMatch.id}/generate-teams`)
      .set('Authorization', authorization)
      .send({})
      .expect(409);
    const unsupportedResponse = await request(app.getHttpServer())
      .post(`/matches/${unsupportedMatch.id}/generate-teams`)
      .set('Authorization', authorization)
      .send({})
      .expect(422);

    expect(closedResponse.body.error.code).toBe('MATCH_NOT_OPEN');
    expect(unsupportedResponse.body.error.code).toBe(
      'INVALID_TEAM_COMPOSITION',
    );
  });

  it('rejects inactive callers and inactive GOING participants', async () => {
    const inactiveUser = await createUser('inactive-generator', {
      status: PlayerStatus.INACTIVE,
    });
    const activeUser = await createUser('active-generator');
    const players = await createPlayers(2);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const inactiveTarget = players[0];

    if (!inactiveTarget) {
      throw new Error('Expected an inactive Player fixture.');
    }

    await prisma.player.update({
      where: { id: inactiveTarget.id },
      data: { status: PlayerStatus.INACTIVE },
    });

    const callerResponse = await request(app.getHttpServer())
      .post(`/matches/${match.id}/generate-teams`)
      .set(
        'Authorization',
        authorize('inactive-generator-token', inactiveUser.authProviderId),
      )
      .send({})
      .expect(403);
    const participantResponse = await request(app.getHttpServer())
      .post(`/matches/${match.id}/generate-teams`)
      .set(
        'Authorization',
        authorize('active-generator-token', activeUser.authProviderId),
      )
      .send({})
      .expect(422);

    expect(callerResponse.body.error.code).toBe('PLAYER_INACTIVE');
    expect(participantResponse.body.error.code).toBe('INACTIVE_PARTICIPANT');
  });

  it('atomically starts with generated provenance and exposes persisted teams', async () => {
    const user = await createUser('start-user');
    const players = await createPlayers(4);
    const match = await createMatch({ stateVersion: 3 });
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize('start-token', user.authProviderId);
    const proposal = await generate(match.id, authorization);

    const response = await request(app.getHttpServer())
      .post(`/matches/${match.id}/start`)
      .set('Authorization', authorization)
      .send(startBody(proposal))
      .expect(200);

    expect(response.body).toMatchObject({
      id: match.id,
      status: 'IN_PROGRESS',
      stateVersion: 4,
      provenance: {
        mode: 'ALGORITHM',
        algorithmVersion: 'v1',
        configurationVersion: 'v1',
      },
      result: null,
    });
    expect(response.body.teams).toHaveLength(2);
    expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(2);
    expect(
      await prisma.teamMembership.count({ where: { matchId: match.id } }),
    ).toBe(4);
    const persisted = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
    });
    expect(persisted.startedAt).not.toBeNull();
    expect(persisted.teamGenerationMode).toBe('ALGORITHM');
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('authProviderId');
    for (const attribute of Object.keys(validAttributes)) {
      expect(serialized).not.toContain(`"${attribute}"`);
    }
  });

  it('accepts valid manual adjustment and retains generated versions', async () => {
    const user = await createUser('manual-user');
    const players = await createPlayers(4);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize('manual-token', user.authProviderId);
    const proposal = await generate(match.id, authorization);
    const adjustedTeamA = [...proposal.teamAPlayerIds];
    const adjustedTeamB = [...proposal.teamBPlayerIds];
    const firstA = adjustedTeamA[0];
    const firstB = adjustedTeamB[0];

    if (!firstA || !firstB) {
      throw new Error('Expected two non-empty generated teams.');
    }

    adjustedTeamA[0] = firstB;
    adjustedTeamB[0] = firstA;
    const response = await request(app.getHttpServer())
      .post(`/matches/${match.id}/start`)
      .set('Authorization', authorization)
      .send({
        teamAPlayerIds: adjustedTeamA,
        teamBPlayerIds: adjustedTeamB,
        proposalReceipt: proposal.proposalReceipt,
      })
      .expect(200);

    expect(response.body.provenance).toEqual({
      mode: 'MANUAL_ADJUSTMENT',
      algorithmVersion: 'v1',
      configurationVersion: 'v1',
    });
  });

  it('rejects duplicate, missing, and non-GOING selected Players without partial teams', async () => {
    const user = await createUser('invalid-team-user');
    const players = await createPlayers(4);
    const nonGoing = await prisma.player.create({
      data: {
        name: 'Not going',
        type: PlayerType.REGULAR,
        ...validAttributes,
      },
    });
    const authorization = authorize('invalid-team-token', user.authProviderId);

    for (const invalidKind of ['duplicate', 'missing', 'non-going'] as const) {
      const match = await createMatch();
      await addGoing(
        match.id,
        players.map(({ id }) => id),
      );
      const proposal = await generate(match.id, authorization);
      const body = startBody(proposal);

      if (invalidKind === 'duplicate') {
        body.teamBPlayerIds[0] = body.teamAPlayerIds[0] ?? '';
      } else if (invalidKind === 'missing') {
        body.teamBPlayerIds.pop();
      } else {
        body.teamBPlayerIds[0] = nonGoing.id;
      }

      const response = await request(app.getHttpServer())
        .post(`/matches/${match.id}/start`)
        .set('Authorization', authorization)
        .send(body)
        .expect(422);

      expect(response.body.error.code).toBe('INVALID_TEAM_COMPOSITION');
      expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(0);
      expect(
        await prisma.teamMembership.count({ where: { matchId: match.id } }),
      ).toBe(0);
    }
  });

  it('rejects stale and forged proposal receipts', async () => {
    const user = await createUser('receipt-user');
    const players = await createPlayers(3);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize('receipt-token', user.authProviderId);
    const proposal = await generate(match.id, authorization);
    await prisma.match.update({
      where: { id: match.id },
      data: { stateVersion: { increment: 1 } },
    });

    const stale = await request(app.getHttpServer())
      .post(`/matches/${match.id}/start`)
      .set('Authorization', authorization)
      .send(startBody(proposal))
      .expect(409);
    const [receiptPayload, receiptSignature] =
      proposal.proposalReceipt.split('.');
    if (!receiptPayload || !receiptSignature || receiptSignature.length < 2) {
      throw new Error('Generated proposal receipt has an invalid test shape.');
    }
    const tamperIndex = receiptSignature.length - 2;
    const tamperedCharacter = receiptSignature[tamperIndex] === 'x' ? 'y' : 'x';
    const forgedReceipt = `${receiptPayload}.${receiptSignature.slice(
      0,
      tamperIndex,
    )}${tamperedCharacter}${receiptSignature.slice(tamperIndex + 1)}`;
    const forged = await request(app.getHttpServer())
      .post(`/matches/${match.id}/start`)
      .set('Authorization', authorization)
      .send({
        ...startBody(proposal),
        proposalReceipt: forgedReceipt,
      })
      .expect(409);

    expect(stale.body.error.code).toBe('CONCURRENT_STATE_CHANGE');
    expect(forged.body.error.code).toBe('PROPOSAL_RECEIPT_INVALID');
    expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(0);
  });

  it('serializes a concurrent attendance change against Start', async () => {
    const user = await createUser('race-user');
    const others = await createPlayers(3);
    const match = await createMatch();
    const goingIds = [user.playerId, ...others.map(({ id }) => id)];
    await addGoing(match.id, goingIds);
    const authorization = authorize('race-token', user.authProviderId);
    const proposal = await generate(match.id, authorization);

    const [startResponse, attendanceResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/matches/${match.id}/start`)
        .set('Authorization', authorization)
        .send(startBody(proposal)),
      request(app.getHttpServer())
        .patch(`/matches/${match.id}/participants/${user.playerId}`)
        .set('Authorization', authorization)
        .send({ attendance: 'NOT_GOING' }),
    ]);

    expect([startResponse.status, attendanceResponse.status].sort()).toEqual([
      200, 409,
    ]);
    const persisted = await prisma.match.findUniqueOrThrow({
      where: { id: match.id },
    });

    if (startResponse.status === 200) {
      expect(persisted.status).toBe(MatchStatus.IN_PROGRESS);
      expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(2);
      expect(attendanceResponse.body.error.code).toBe('ATTENDANCE_LOCKED');
    } else {
      expect(persisted.status).toBe(MatchStatus.OPEN_FOR_REGISTRATION);
      expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(0);
      expect(startResponse.body.error.code).toBe('CONCURRENT_STATE_CHANGE');
    }
  });

  it('serializes Player deactivation before validating final teams at Start', async () => {
    const user = await createUser('deactivation-start-user');
    const players = await createPlayers(4);
    const target = players[0];
    if (!target) {
      throw new Error('Expected a Player fixture.');
    }
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize(
      'deactivation-start-token',
      user.authProviderId,
    );
    const proposal = await generate(match.id, authorization);
    const deactivationPrepared = deferred();
    const allowDeactivationCommit = deferred();
    let deactivationBackendPid: number | undefined;
    const deactivation = prisma.$transaction(async (transaction) => {
      const [backend] = await transaction.$queryRaw<Array<{ pid: number }>>`
        SELECT pg_backend_pid() AS "pid"
      `;
      deactivationBackendPid = backend?.pid;
      await transaction.player.update({
        where: { id: target.id },
        data: { status: PlayerStatus.INACTIVE },
      });
      deactivationPrepared.resolve();
      await allowDeactivationCommit.promise;
    });

    await deactivationPrepared.promise;
    if (deactivationBackendPid === undefined) {
      throw new Error('Expected a PostgreSQL backend PID.');
    }
    const start = request(app.getHttpServer())
      .post(`/matches/${match.id}/start`)
      .set('Authorization', authorization)
      .send(startBody(proposal))
      .then((response) => response);

    try {
      await waitForTransactionBlockedByBackend(prisma, deactivationBackendPid);
      expect(
        await prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
      ).toMatchObject({ status: MatchStatus.OPEN_FOR_REGISTRATION });

      allowDeactivationCommit.resolve();
      await deactivation;
      const response = await start;

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('INACTIVE_PARTICIPANT');
      expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(0);
      expect(
        await prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
      ).toMatchObject({ status: MatchStatus.OPEN_FOR_REGISTRATION });
    } finally {
      allowDeactivationCommit.resolve();
      await Promise.allSettled([deactivation, start]);
    }
  }, 15_000);

  it('allows only one concurrent Start request to persist final teams', async () => {
    const user = await createUser('double-start-user');
    const players = await createPlayers(4);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize('double-start-token', user.authProviderId);
    const proposal = await generate(match.id, authorization);
    const startRequest = () =>
      request(app.getHttpServer())
        .post(`/matches/${match.id}/start`)
        .set('Authorization', authorization)
        .send(startBody(proposal));

    const responses = await Promise.all([startRequest(), startRequest()]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(
      responses.find(({ status }) => status === 409)?.body.error.code,
    ).toBe('MATCH_NOT_OPEN');
    expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(2);
    expect(
      await prisma.teamMembership.count({ where: { matchId: match.id } }),
    ).toBe(4);
  });

  it('rolls back Team rows and lifecycle state when membership persistence fails', async () => {
    const user = await createUser('rollback-start-user');
    const players = await createPlayers(4);
    const match = await createMatch();
    await addGoing(
      match.id,
      players.map(({ id }) => id),
    );
    const authorization = authorize(
      'rollback-start-token',
      user.authProviderId,
    );
    const proposal = await generate(match.id, authorization);
    const rejectedPlayerId = players[0]?.id;

    if (!rejectedPlayerId) {
      throw new Error('Expected a Player fixture.');
    }

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "TeamMembership"
      ADD CONSTRAINT "test_reject_team_membership"
      CHECK ("playerId" <> '${rejectedPlayerId}'::uuid)
    `);

    try {
      await request(app.getHttpServer())
        .post(`/matches/${match.id}/start`)
        .set('Authorization', authorization)
        .send(startBody(proposal))
        .expect(500);

      expect(await prisma.team.count({ where: { matchId: match.id } })).toBe(0);
      expect(
        await prisma.teamMembership.count({ where: { matchId: match.id } }),
      ).toBe(0);
      expect(
        await prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
      ).toMatchObject({
        status: MatchStatus.OPEN_FOR_REGISTRATION,
        stateVersion: 0,
        startedAt: null,
        teamGenerationMode: null,
      });
    } finally {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "TeamMembership"
        DROP CONSTRAINT "test_reject_team_membership"
      `);
    }
  });

  it('locks attendance and team generation after successful Start', async () => {
    const user = await createUser('locked-after-start-user');
    const others = await createPlayers(2);
    const match = await createMatch();
    await addGoing(match.id, [user.playerId, ...others.map(({ id }) => id)]);
    const authorization = authorize(
      'locked-after-start-token',
      user.authProviderId,
    );
    const proposal = await generate(match.id, authorization);
    await request(app.getHttpServer())
      .post(`/matches/${match.id}/start`)
      .set('Authorization', authorization)
      .send(startBody(proposal))
      .expect(200);

    const attendance = await request(app.getHttpServer())
      .delete(`/matches/${match.id}/registration`)
      .set('Authorization', authorization)
      .expect(409);
    const regeneration = await request(app.getHttpServer())
      .post(`/matches/${match.id}/generate-teams`)
      .set('Authorization', authorization)
      .send({})
      .expect(409);

    expect(attendance.body.error.code).toBe('ATTENDANCE_LOCKED');
    expect(regeneration.body.error.code).toBe('MATCH_NOT_OPEN');
  });
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
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

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
const attributes = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

function assertDedicatedTestDatabase(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must name a dedicated _test database.');
  }
}

describeWithDatabase('Player statistics, rankings, and history API', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sportId: string;
  let matchSequence = 0;
  const tokenIdentities = new Map<string, string>();
  const firebaseTokenVerifier = {
    verify: vi.fn(async (token: string): Promise<VerifiedFirebaseIdentity> => {
      const authProviderId = tokenIdentities.get(token);
      if (!authProviderId) throw new Error('Invalid Firebase token');
      return { authProviderId };
    }),
  };

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
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
    matchSequence = 0;
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

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createUser(role: UserRole = UserRole.PLAYER) {
    return prisma.user.create({
      data: {
        authProviderId: `caller-${role.toLowerCase()}`,
        role,
        player: {
          create: {
            name: 'API Caller',
            type: PlayerType.REGULAR,
            ...attributes,
          },
        },
      },
      include: { player: true },
    });
  }

  async function createPlayer(
    name: string,
    options: { type?: PlayerType; status?: PlayerStatus } = {},
  ) {
    return prisma.player.create({
      data: {
        name,
        type: options.type ?? PlayerType.REGULAR,
        status: options.status ?? PlayerStatus.ACTIVE,
        ...attributes,
      },
    });
  }

  async function recordMatch(options: {
    teamA: string[];
    teamB: string[];
    score?: { teamA: number; teamB: number };
    goals?: Record<string, number>;
    status?: MatchStatus;
    startsAt?: Date;
  }) {
    const status = options.status ?? MatchStatus.FINISHED;
    const startsAt =
      options.startsAt ??
      new Date(Date.UTC(2026, 7, 1 + matchSequence++, 18, 0, 0));
    const match = await prisma.match.create({
      data: {
        sportId,
        startsAt,
        status,
        ...(status === MatchStatus.FINISHED
          ? {
              teamAScore: options.score?.teamA ?? 0,
              teamBScore: options.score?.teamB ?? 0,
              startedAt: startsAt,
              completedAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
            }
          : status === MatchStatus.IN_PROGRESS
            ? { startedAt: startsAt }
            : {}),
      },
    });
    const [teamA, teamB] = await Promise.all([
      prisma.team.create({ data: { matchId: match.id, side: TeamSide.A } }),
      prisma.team.create({ data: { matchId: match.id, side: TeamSide.B } }),
    ]);
    const playerIds = [...options.teamA, ...options.teamB];
    await prisma.teamMembership.createMany({
      data: playerIds.map((playerId) => ({
        matchId: match.id,
        playerId,
        teamId: options.teamA.includes(playerId) ? teamA.id : teamB.id,
      })),
    });
    if (status === MatchStatus.FINISHED) {
      await prisma.matchPlayerStat.createMany({
        data: playerIds.map((playerId) => ({
          matchId: match.id,
          playerId,
          goals: options.goals?.[playerId] ?? 0,
        })),
      });
    }
    return match;
  }

  function authorize(token: string, authProviderId: string): string {
    tokenIdentities.set(token, authProviderId);
    return `Bearer ${token}`;
  }

  it('returns N/A-compatible null rates for a zero-Match Player without private data', async () => {
    const caller = await createUser();
    const player = await createPlayer('No Matches');
    const authorization = authorize('zero-token', caller.authProviderId);

    const statistics = await request(app.getHttpServer())
      .get(`/players/${player.id}/statistics`)
      .set('Authorization', authorization)
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/players/${player.id}`)
      .set('Authorization', authorization)
      .expect(200);

    expect(statistics.body).toEqual({
      playerId: player.id,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      goals: 0,
      goalsPerMatch: null,
    });
    expect(detail.body).toMatchObject({
      id: player.id,
      name: 'No Matches',
      statistics: { matches: 0, winRate: null, goalsPerMatch: null },
    });
    const serialized = JSON.stringify([statistics.body, detail.body]);
    expect(serialized).not.toContain('authProviderId');
    for (const attribute of Object.keys(attributes)) {
      expect(serialized).not.toContain(`"${attribute}"`);
    }
  });

  it('derives wins, draws, losses, goals, and rates from final teams and scores', async () => {
    const caller = await createUser();
    const subject = await createPlayer('Subject');
    const opponent = await createPlayer('Opponent', {
      status: PlayerStatus.INACTIVE,
    });
    await recordMatch({
      teamA: [subject.id],
      teamB: [opponent.id],
      score: { teamA: 2, teamB: 0 },
      goals: { [subject.id]: 2 },
    });
    await recordMatch({
      teamA: [opponent.id],
      teamB: [subject.id],
      score: { teamA: 1, teamB: 1 },
    });
    await recordMatch({
      teamA: [subject.id],
      teamB: [opponent.id],
      score: { teamA: 0, teamB: 3 },
    });

    const response = await request(app.getHttpServer())
      .get(`/players/${subject.id}/statistics`)
      .set('Authorization', authorize('summary-token', caller.authProviderId))
      .expect(200);

    expect(response.body).toEqual({
      playerId: subject.id,
      matches: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 0.3333,
      goals: 2,
      goalsPerMatch: 0.6667,
    });
  });

  it('excludes OPEN, IN_PROGRESS, and CANCELLED Matches from every statistic', async () => {
    const caller = await createUser();
    const subject = await createPlayer('Lifecycle Subject');
    const opponent = await createPlayer('Lifecycle Opponent', {
      status: PlayerStatus.INACTIVE,
    });
    for (const status of [
      MatchStatus.OPEN_FOR_REGISTRATION,
      MatchStatus.IN_PROGRESS,
      MatchStatus.CANCELLED,
    ]) {
      await recordMatch({
        teamA: [subject.id],
        teamB: [opponent.id],
        status,
      });
    }

    const response = await request(app.getHttpServer())
      .get(`/players/${subject.id}/statistics`)
      .set('Authorization', authorize('states-token', caller.authProviderId))
      .expect(200);

    expect(response.body).toMatchObject({ matches: 0, goals: 0 });
  });

  it('includes active guests and excludes inactive Players by default while preserving their history', async () => {
    const caller = await createUser(UserRole.ADMIN);
    const guest = await createPlayer('Guest Player', {
      type: PlayerType.GUEST,
    });
    const inactive = await createPlayer('Inactive Veteran', {
      status: PlayerStatus.INACTIVE,
    });
    await recordMatch({
      teamA: [guest.id],
      teamB: [inactive.id],
      score: { teamA: 1, teamB: 0 },
      goals: { [guest.id]: 1 },
    });
    const authorization = authorize('population-token', caller.authProviderId);

    const defaultRanking = await request(app.getHttpServer())
      .get('/rankings?limit=100')
      .set('Authorization', authorization)
      .expect(200);
    const allRanking = await request(app.getHttpServer())
      .get('/rankings?includeInactive=true&limit=100')
      .set('Authorization', authorization)
      .expect(200);
    const inactiveStatistics = await request(app.getHttpServer())
      .get(`/players/${inactive.id}/statistics`)
      .set('Authorization', authorization)
      .expect(200);

    expect(defaultRanking.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          player: expect.objectContaining({ id: guest.id, type: 'GUEST' }),
        }),
      ]),
    );
    expect(defaultRanking.body.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          player: expect.objectContaining({ id: inactive.id }),
        }),
      ]),
    );
    expect(allRanking.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          player: expect.objectContaining({ id: inactive.id }),
        }),
      ]),
    );
    expect(inactiveStatistics.body).toMatchObject({ matches: 1, losses: 1 });
  });

  it('applies every observable ranking rule in deterministic order', async () => {
    const caller = await createUser();
    const dummy = await createPlayer('Hidden Dummy', {
      status: PlayerStatus.INACTIVE,
    });
    const perfect = await createPlayer('Perfect');
    const halfMore = await createPlayer('Half More');
    const halfLess = await createPlayer('Half Less');
    const goalsHigh = await createPlayer('Goals High');
    const goalsLow = await createPlayer('Goals Low');
    const alpha = await createPlayer('Alpha');
    const zulu = await createPlayer('Zulu');
    await createPlayer('Zero Matches');

    await recordMatch({
      teamA: [perfect.id],
      teamB: [dummy.id],
      score: { teamA: 1, teamB: 0 },
    });
    for (const won of [true, false, true, false]) {
      await recordMatch({
        teamA: [halfMore.id],
        teamB: [dummy.id],
        score: won ? { teamA: 1, teamB: 0 } : { teamA: 0, teamB: 1 },
      });
    }
    for (const playerId of [halfLess.id, goalsHigh.id, goalsLow.id]) {
      await recordMatch({
        teamA: [playerId],
        teamB: [dummy.id],
        score: { teamA: 1, teamB: 0 },
        goals:
          playerId === goalsHigh.id
            ? { [playerId]: 3 }
            : playerId === goalsLow.id
              ? { [playerId]: 1 }
              : {},
      });
      await recordMatch({
        teamA: [playerId],
        teamB: [dummy.id],
        score: { teamA: 0, teamB: 1 },
      });
    }
    for (const playerId of [alpha.id, zulu.id]) {
      await recordMatch({
        teamA: [playerId],
        teamB: [dummy.id],
        score: { teamA: 0, teamB: 1 },
      });
    }

    const response = await request(app.getHttpServer())
      .get('/rankings?limit=100')
      .set('Authorization', authorize('ranking-token', caller.authProviderId))
      .expect(200);
    const names = response.body.items.map(
      (row: { player: { name: string } }) => row.player.name,
    );

    expect(names.indexOf('Perfect')).toBeLessThan(names.indexOf('Half More'));
    expect(names.indexOf('Half More')).toBeLessThan(names.indexOf('Half Less'));
    expect(names.indexOf('Goals High')).toBeLessThan(
      names.indexOf('Goals Low'),
    );
    expect(names.indexOf('Alpha')).toBeLessThan(names.indexOf('Zulu'));
    expect(names.indexOf('Zero Matches')).toBe(names.length - 1);
    expect(
      response.body.items.map((row: { rank: number }) => row.rank),
    ).toEqual(Array.from({ length: names.length }, (_, index) => index + 1));
    expect(JSON.stringify(response.body)).not.toContain('attributes');
  });

  it('validates ranking authorization, pagination, and cursor scope', async () => {
    const caller = await createUser();
    await createPlayer('A');
    await createPlayer('B');
    const authorization = authorize('paging-token', caller.authProviderId);

    const forbidden = await request(app.getHttpServer())
      .get('/rankings?includeInactive=true')
      .set('Authorization', authorization)
      .expect(403);
    const first = await request(app.getHttpServer())
      .get('/rankings?limit=1')
      .set('Authorization', authorization)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(
        `/rankings?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .set('Authorization', authorization)
      .expect(200);
    const invalid = await request(app.getHttpServer())
      .get('/rankings?cursor=not-a-cursor')
      .set('Authorization', authorization)
      .expect(400);

    expect(forbidden.body.error.code).toBe('FORBIDDEN');
    expect(first.body.items[0].rank).toBe(1);
    expect(second.body.items[0].rank).toBe(2);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns chronological, paginated finished history with final teams, score, and aggregate goals', async () => {
    const caller = await createUser();
    const subject = await createPlayer('History Subject');
    const teammate = await createPlayer('History Teammate');
    const opponent = await createPlayer('History Opponent');
    const oldMatch = await recordMatch({
      teamA: [subject.id, teammate.id],
      teamB: [opponent.id],
      score: { teamA: 2, teamB: 0 },
      goals: { [subject.id]: 1, [teammate.id]: 1 },
      startsAt: new Date('2026-06-01T18:00:00.000Z'),
    });
    const newMatch = await recordMatch({
      teamA: [opponent.id],
      teamB: [subject.id, teammate.id],
      score: { teamA: 1, teamB: 1 },
      goals: { [subject.id]: 1, [opponent.id]: 1 },
      startsAt: new Date('2026-07-01T18:00:00.000Z'),
    });
    const authorization = authorize('history-token', caller.authProviderId);

    const first = await request(app.getHttpServer())
      .get(`/players/${subject.id}/matches?limit=1`)
      .set('Authorization', authorization)
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(
        `/players/${subject.id}/matches?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`,
      )
      .set('Authorization', authorization)
      .expect(200);

    expect(first.body.items[0]).toMatchObject({
      id: newMatch.id,
      score: { teamA: 1, teamB: 1 },
      subjectGoals: 1,
      subjectResult: 'DRAW',
    });
    expect(first.body.items[0].teams).toHaveLength(2);
    expect(first.body.items[0].playerGoals).toHaveLength(3);
    expect(second.body.items[0]).toMatchObject({
      id: oldMatch.id,
      score: { teamA: 2, teamB: 0 },
      subjectGoals: 1,
      subjectResult: 'WIN',
    });
    expect(second.body.nextCursor).toBeNull();
    const serialized = JSON.stringify([first.body, second.body]);
    expect(serialized).not.toContain('authProviderId');
    for (const attribute of Object.keys(attributes)) {
      expect(serialized).not.toContain(`"${attribute}"`);
    }
  });
});

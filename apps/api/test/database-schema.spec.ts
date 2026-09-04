import {
  Attendance,
  MatchStatus,
  PlayerType,
  PrismaClient,
  TeamSide,
} from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

function assertDedicatedTestDatabase(databaseUrl: string): void {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.slice(1);

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must point to a dedicated database whose name ends in "_test".',
    );
  }
}

describeWithDatabase('PostgreSQL domain schema', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    if (!testDatabaseUrl) {
      return;
    }

    assertDedicatedTestDatabase(testDatabaseUrl);
    prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Player", "Sport" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createPlayer(name: string) {
    return prisma.player.create({
      data: {
        name,
        type: PlayerType.GUEST,
        speed: 5,
        endurance: 5,
        defense: 5,
        attack: 5,
        technique: 5,
      },
    });
  }

  async function createSport(name: string) {
    return prisma.sport.create({
      data: {
        name,
        teamsPerMatch: 2,
        playersOnFieldPerTeam: 3,
      },
    });
  }

  async function createMatch(name: string) {
    const sport = await createSport(name);

    return prisma.match.create({
      data: {
        sportId: sport.id,
        startsAt: new Date('2026-09-01T18:30:00.000Z'),
      },
    });
  }

  it('allows a Player to exist without a User', async () => {
    const player = await createPlayer('Persistent guest');

    const persistedPlayer = await prisma.player.findUniqueOrThrow({
      where: { id: player.id },
      include: { user: true },
    });

    expect(persistedPlayer.user).toBeNull();
  });

  it('enforces User.playerId uniqueness', async () => {
    const player = await createPlayer('Player account');
    await prisma.user.create({
      data: { playerId: player.id, authProviderId: 'firebase-user-one' },
    });

    await expect(
      prisma.user.create({
        data: { playerId: player.id, authProviderId: 'firebase-user-two' },
      }),
    ).rejects.toThrow();
  });

  it('enforces User.authProviderId uniqueness', async () => {
    const firstPlayer = await createPlayer('First account');
    const secondPlayer = await createPlayer('Second account');
    await prisma.user.create({
      data: {
        playerId: firstPlayer.id,
        authProviderId: 'shared-firebase-id',
      },
    });

    await expect(
      prisma.user.create({
        data: {
          playerId: secondPlayer.id,
          authProviderId: 'shared-firebase-id',
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces MatchParticipant uniqueness', async () => {
    const match = await createMatch('Attendance sport');
    const player = await createPlayer('Attendee');
    const participant = {
      matchId: match.id,
      playerId: player.id,
      attendance: Attendance.GOING,
    };
    await prisma.matchParticipant.create({ data: participant });

    await expect(
      prisma.matchParticipant.create({ data: participant }),
    ).rejects.toThrow();
  });

  it('enforces one Team side per Match', async () => {
    const match = await createMatch('Team side sport');
    await prisma.team.create({
      data: { matchId: match.id, side: TeamSide.A },
    });

    await expect(
      prisma.team.create({
        data: { matchId: match.id, side: TeamSide.A },
      }),
    ).rejects.toThrow();
  });

  it('enforces one TeamMembership per Player per Match', async () => {
    const match = await createMatch('Membership sport');
    const player = await createPlayer('Team member');
    const [teamA, teamB] = await Promise.all([
      prisma.team.create({
        data: { matchId: match.id, side: TeamSide.A },
      }),
      prisma.team.create({
        data: { matchId: match.id, side: TeamSide.B },
      }),
    ]);
    await prisma.teamMembership.create({
      data: { matchId: match.id, playerId: player.id, teamId: teamA.id },
    });

    await expect(
      prisma.teamMembership.create({
        data: { matchId: match.id, playerId: player.id, teamId: teamB.id },
      }),
    ).rejects.toThrow();
  });

  it('rejects a TeamMembership whose Team belongs to another Match', async () => {
    const firstMatch = await createMatch('First membership sport');
    const secondMatch = await createMatch('Second membership sport');
    const player = await createPlayer('Cross-match member');
    const team = await prisma.team.create({
      data: { matchId: firstMatch.id, side: TeamSide.A },
    });

    await expect(
      prisma.teamMembership.create({
        data: {
          matchId: secondMatch.id,
          playerId: player.id,
          teamId: team.id,
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces MatchPlayerStat uniqueness', async () => {
    const match = await createMatch('Statistics sport');
    const player = await createPlayer('Scorer');
    const playerStat = { matchId: match.id, playerId: player.id, goals: 1 };
    await prisma.matchPlayerStat.create({ data: playerStat });

    await expect(
      prisma.matchPlayerStat.create({ data: playerStat }),
    ).rejects.toThrow();
  });

  it('enforces MatchCompletionIdempotency uniqueness', async () => {
    const match = await createMatch('Idempotency sport');
    const idempotency = {
      matchId: match.id,
      idempotencyKey: 'completion-request',
      requestHash: 'a'.repeat(64),
    };
    await prisma.matchCompletionIdempotency.create({ data: idempotency });

    await expect(
      prisma.matchCompletionIdempotency.create({ data: idempotency }),
    ).rejects.toThrow();
  });

  it.each([
    ['speed', 0],
    ['endurance', 11],
    ['defense', 0],
    ['attack', 11],
    ['technique', 0],
  ] as const)(
    'rejects an out-of-range Player %s value',
    async (field, value) => {
      const attributes = {
        speed: 5,
        endurance: 5,
        defense: 5,
        attack: 5,
        technique: 5,
        [field]: value,
      };

      await expect(
        prisma.player.create({
          data: {
            name: `Invalid ${field}`,
            type: PlayerType.GUEST,
            ...attributes,
          },
        }),
      ).rejects.toThrow();
    },
  );

  it('rejects an invalid Sport team shape', async () => {
    await expect(
      prisma.sport.create({
        data: {
          name: 'Invalid team count',
          teamsPerMatch: 1,
          playersOnFieldPerTeam: 3,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.sport.create({
        data: {
          name: 'Invalid on-field count',
          teamsPerMatch: 2,
          playersOnFieldPerTeam: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects invalid Schedule intervals', async () => {
    const sport = await createSport('Schedule sport');

    await expect(
      prisma.schedule.create({
        data: {
          sportId: sport.id,
          localStartTime: new Date('1970-01-01T18:30:00.000Z'),
          generationHorizonDays: 0,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.schedule.create({
        data: {
          sportId: sport.id,
          localStartTime: new Date('1970-01-01T18:30:00.000Z'),
          registrationReminderMinutes: -1,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects negative Match scores and incomplete score pairs', async () => {
    const sport = await createSport('Score constraint sport');
    const matchData = {
      sportId: sport.id,
      startsAt: new Date('2026-09-01T18:30:00.000Z'),
    };

    await expect(
      prisma.match.create({
        data: { ...matchData, teamAScore: -1, teamBScore: 0 },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.match.create({ data: { ...matchData, teamAScore: 1 } }),
    ).rejects.toThrow();
  });

  it('requires consistent FINISHED Match result data', async () => {
    const sport = await createSport('Finished constraint sport');
    const matchData = {
      sportId: sport.id,
      startsAt: new Date('2026-09-01T18:30:00.000Z'),
    };

    await expect(
      prisma.match.create({
        data: {
          ...matchData,
          status: MatchStatus.FINISHED,
          teamAScore: 2,
          teamBScore: 1,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.match.create({
        data: { ...matchData, completedAt: new Date() },
      }),
    ).rejects.toThrow();
  });

  it('rejects negative MatchPlayerStat goals', async () => {
    const match = await createMatch('Goal constraint sport');
    const player = await createPlayer('Negative scorer');

    await expect(
      prisma.matchPlayerStat.create({
        data: { matchId: match.id, playerId: player.id, goals: -1 },
      }),
    ).rejects.toThrow();
  });

  it('installs every approved named CHECK constraint', async () => {
    const constraints = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`
      SELECT conname AS name
      FROM pg_constraint
      WHERE conname IN (
        'player_attributes_range',
        'sport_team_shape_positive',
        'schedule_positive_intervals',
        'match_scores_non_negative',
        'match_scores_both_or_neither',
        'match_finished_has_result',
        'match_player_stats_non_negative',
        'match_reminder_attempts_non_negative'
      )
      ORDER BY conname
    `);

    expect(constraints.map(({ name }) => name)).toEqual([
      'match_finished_has_result',
      'match_player_stats_non_negative',
      'match_reminder_attempts_non_negative',
      'match_scores_both_or_neither',
      'match_scores_non_negative',
      'player_attributes_range',
      'schedule_positive_intervals',
      'sport_team_shape_positive',
    ]);
  });
});

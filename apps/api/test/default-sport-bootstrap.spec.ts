import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  bootstrapDefaultSport,
  DEFAULT_SPORT,
} from '../src/bootstrap/default-sport';

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

describeWithDatabase('default Sport bootstrap', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    if (!testDatabaseUrl) return;
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

  it('creates only the approved default Football Sport', async () => {
    const result = await bootstrapDefaultSport(prisma);

    expect(result.created).toBe(true);
    expect(
      await prisma.sport.findUnique({ where: { id: result.sportId } }),
    ).toMatchObject(DEFAULT_SPORT);
    await expectOnlySportExists();
  });

  it('returns the same Sport without duplicating it on repeated runs', async () => {
    const first = await bootstrapDefaultSport(prisma);
    const second = await bootstrapDefaultSport(prisma);

    expect(first).toEqual({ sportId: second.sportId, created: true });
    expect(second.created).toBe(false);
    await expectOnlySportExists();
  });

  it('converges on one Sport under concurrent bootstrap attempts', async () => {
    const results = await Promise.all([
      bootstrapDefaultSport(prisma),
      bootstrapDefaultSport(prisma),
    ]);

    expect(new Set(results.map(({ sportId }) => sportId)).size).toBe(1);
    expect(results.filter(({ created }) => created)).toHaveLength(1);
    await expectOnlySportExists();
  });

  it('rejects a conflicting existing Football Sport without changing it', async () => {
    const conflictingSport = await prisma.sport.create({
      data: {
        name: DEFAULT_SPORT.name,
        teamsPerMatch: DEFAULT_SPORT.teamsPerMatch,
        playersOnFieldPerTeam: 5,
      },
    });

    await expect(bootstrapDefaultSport(prisma)).rejects.toThrow(
      'Refusing to change the existing Sport automatically.',
    );
    expect(
      await prisma.sport.findUniqueOrThrow({
        where: { id: conflictingSport.id },
      }),
    ).toMatchObject({
      id: conflictingSport.id,
      playersOnFieldPerTeam: 5,
    });
    await expectOnlySportExists();
  });

  async function expectOnlySportExists(): Promise<void> {
    const [sports, users, players, schedules, matches] = await Promise.all([
      prisma.sport.count(),
      prisma.user.count(),
      prisma.player.count(),
      prisma.schedule.count(),
      prisma.match.count(),
    ]);

    expect({ sports, users, players, schedules, matches }).toEqual({
      sports: 1,
      users: 0,
      players: 0,
      schedules: 0,
      matches: 0,
    });
  }
});

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  PlayerStatus,
  PlayerType,
  PrismaClient,
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

import { provisionAdmin } from '../src/admin/admin-provisioning';
import { AppModule } from '../src/app.module';
import { configureApplication } from '../src/app.setup';
import type { VerifiedFirebaseIdentity } from '../src/auth/auth.types';
import { FirebaseIdentityLookup } from '../src/auth/firebase-identity-lookup.service';
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
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.slice(1);

  if (!databaseName.endsWith('_test')) {
    throw new Error(
      'TEST_DATABASE_URL must point to a dedicated database whose name ends in "_test".',
    );
  }
}

describeWithDatabase('authentication and Player/User API', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
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
  const firebaseIdentityLookup = {
    exists: vi.fn().mockResolvedValue(true),
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
      .overrideProvider(FirebaseIdentityLookup)
      .useValue(firebaseIdentityLookup)
      .compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    tokenIdentities.clear();
    firebaseTokenVerifier.verify.mockClear();
    firebaseIdentityLookup.exists.mockReset().mockResolvedValue(true);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "Player", "Sport" RESTART IDENTITY CASCADE',
    );
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
      type?: PlayerType;
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
            type: options.type ?? PlayerType.REGULAR,
            status: options.status ?? PlayerStatus.ACTIVE,
            ...validAttributes,
          },
        },
      },
      include: { player: true },
    });
  }

  async function createGuest(name: string) {
    return prisma.player.create({
      data: {
        name,
        type: PlayerType.GUEST,
        ...validAttributes,
      },
      include: { user: true },
    });
  }

  function authorize(token: string, authProviderId: string): void {
    tokenIdentities.set(token, authProviderId);
  }

  function onboardingBody() {
    return { name: 'New Player', attributes: validAttributes };
  }

  it('rejects a missing bearer token', async () => {
    const response = await request(app.getHttpServer()).get('/me').expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
    expect(firebaseTokenVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token', async () => {
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('resolves a valid Firebase identity to its persisted User', async () => {
    await createUser('mapped-user');
    authorize('mapped-token', 'mapped-user');

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer mapped-token')
      .expect(200);

    expect(response.body.user.role).toBe('PLAYER');
    expect(response.body.user).not.toHaveProperty('authProviderId');
    expect(response.body.player.name).toBe('mapped-user');
  });

  it('requires onboarding for a valid but unmapped Firebase identity', async () => {
    authorize('new-token', 'not-onboarded');

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer new-token')
      .expect(403);

    expect(response.body.error.code).toBe('ONBOARDING_REQUIRED');
  });

  it('creates a regular Player and PLAYER User during self-onboarding', async () => {
    authorize('onboarding-token', 'new-firebase-user');

    const response = await request(app.getHttpServer())
      .post('/onboarding')
      .set('Authorization', 'Bearer onboarding-token')
      .send(onboardingBody())
      .expect(201);

    expect(response.body.user.role).toBe('PLAYER');
    expect(response.body.player).toMatchObject({
      name: 'New Player',
      type: 'REGULAR',
      status: 'ACTIVE',
      avatarUrl: null,
    });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.player.count()).toBe(1);
  });

  it('rejects a client-supplied ADMIN role during onboarding', async () => {
    authorize('role-token', 'role-user');

    const response = await request(app.getHttpServer())
      .post('/onboarding')
      .set('Authorization', 'Bearer role-token')
      .send({ ...onboardingBody(), role: 'ADMIN' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.player.count()).toBe(0);
  });

  it('returns a conflict without duplicating a repeated onboarding identity', async () => {
    authorize('repeat-token', 'repeat-user');
    const onboardingRequest = () =>
      request(app.getHttpServer())
        .post('/onboarding')
        .set('Authorization', 'Bearer repeat-token')
        .send(onboardingBody());

    await onboardingRequest().expect(201);
    const repeatedResponse = await onboardingRequest().expect(409);

    expect(repeatedResponse.body.error.code).toBe('USER_ALREADY_ONBOARDED');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.player.count()).toBe(1);
  });

  it('allows only one concurrent onboarding attempt to create the identity', async () => {
    authorize('concurrent-token', 'concurrent-user');
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/onboarding')
        .set('Authorization', 'Bearer concurrent-token')
        .send(onboardingBody()),
      request(app.getHttpServer())
        .post('/onboarding')
        .set('Authorization', 'Bearer concurrent-token')
        .send(onboardingBody()),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.player.count()).toBe(1);
  });

  it('never claims an existing guest during self-onboarding', async () => {
    const guest = await createGuest('New Player');
    authorize('guest-name-token', 'new-regular-user');

    const response = await request(app.getHttpServer())
      .post('/onboarding')
      .set('Authorization', 'Bearer guest-name-token')
      .send(onboardingBody())
      .expect(201);

    expect(response.body.player.id).not.toBe(guest.id);
    expect(await prisma.player.count()).toBe(2);
    const persistedGuest = await prisma.player.findUniqueOrThrow({
      where: { id: guest.id },
      include: { user: true },
    });
    expect(persistedGuest.type).toBe(PlayerType.GUEST);
    expect(persistedGuest.user).toBeNull();
  });

  it('never exposes Player attributes in a PLAYER profile response', async () => {
    await createUser('public-profile');
    authorize('public-token', 'public-profile');

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer public-token')
      .expect(200);

    expect(response.body.player).not.toHaveProperty('attributes');
    for (const attribute of Object.keys(validAttributes)) {
      expect(response.body.player).not.toHaveProperty(attribute);
    }
  });

  it('exposes attributes to ADMIN through the approved current-user DTO', async () => {
    await createUser('admin-profile', { role: UserRole.ADMIN });
    authorize('admin-profile-token', 'admin-profile');

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer admin-profile-token')
      .expect(200);

    expect(response.body.player.attributes).toEqual(validAttributes);
    for (const attribute of Object.keys(validAttributes)) {
      expect(response.body.player).not.toHaveProperty(attribute);
    }
  });

  it('blocks PLAYER from the ADMIN-only guest conversion endpoint', async () => {
    await createUser('normal-player');
    const guest = await createGuest('Unconverted guest');
    authorize('player-token', 'normal-player');

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', 'Bearer player-token')
      .send({ authProviderId: 'future-user' })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an active ADMIN to convert a guest while preserving Player ID', async () => {
    await createUser('conversion-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Converted guest');
    authorize('admin-token', 'conversion-admin');

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', 'Bearer admin-token')
      .send({ authProviderId: '  converted-firebase-user  ' })
      .expect(201);

    expect(response.body.user.role).toBe('PLAYER');
    expect(response.body.player).toMatchObject({
      id: guest.id,
      type: 'REGULAR',
      attributes: validAttributes,
    });
    const convertedPlayer = await prisma.player.findUniqueOrThrow({
      where: { id: guest.id },
      include: { user: true },
    });
    expect(convertedPlayer.id).toBe(guest.id);
    expect(convertedPlayer.type).toBe(PlayerType.REGULAR);
    expect(convertedPlayer.user?.authProviderId).toBe(
      'converted-firebase-user',
    );
    expect(firebaseIdentityLookup.exists).toHaveBeenCalledWith(
      'converted-firebase-user',
    );
  });

  it('rejects a nonexistent Firebase identity without partially converting the guest', async () => {
    await createUser('missing-identity-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Missing identity guest');
    authorize('missing-identity-token', 'missing-identity-admin');
    firebaseIdentityLookup.exists.mockResolvedValueOnce(false);

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', 'Bearer missing-identity-token')
      .send({ authProviderId: 'missing-firebase-user' })
      .expect(422);

    expect(response.body.error.code).toBe('FIREBASE_IDENTITY_NOT_FOUND');
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { type: true, user: true },
      }),
    ).toEqual({ type: PlayerType.GUEST, user: null });
  });

  it('reports Firebase lookup failure without partially converting the guest', async () => {
    await createUser('lookup-failure-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Lookup failure guest');
    authorize('lookup-failure-token', 'lookup-failure-admin');
    firebaseIdentityLookup.exists.mockRejectedValueOnce(
      new Error('private Firebase implementation detail'),
    );

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', 'Bearer lookup-failure-token')
      .send({ authProviderId: 'unverified-firebase-user' })
      .expect(503);

    expect(response.body.error).toEqual(
      expect.objectContaining({
        code: 'IDENTITY_PROVIDER_UNAVAILABLE',
        message: 'Identity validation is temporarily unavailable.',
      }),
    );
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { type: true, user: true },
      }),
    ).toEqual({ type: PlayerType.GUEST, user: null });
  });

  it('blocks an inactive ADMIN from guest conversion', async () => {
    await createUser('inactive-admin', {
      role: UserRole.ADMIN,
      status: PlayerStatus.INACTIVE,
    });
    const guest = await createGuest('Still a guest');
    authorize('inactive-admin-token', 'inactive-admin');

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', 'Bearer inactive-admin-token')
      .send({ authProviderId: 'future-inactive-user' })
      .expect(403);

    expect(response.body.error.code).toBe('PLAYER_INACTIVE');
  });

  it('rejects conversion when the Firebase identity is already linked', async () => {
    await createUser('duplicate-admin', { role: UserRole.ADMIN });
    await createUser('already-linked');
    const guest = await createGuest('Duplicate identity guest');
    authorize('duplicate-admin-token', 'duplicate-admin');

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', 'Bearer duplicate-admin-token')
      .send({ authProviderId: 'already-linked' })
      .expect(409);

    expect(response.body.error.code).toBe('AUTH_PROVIDER_ALREADY_LINKED');
    expect(firebaseIdentityLookup.exists).not.toHaveBeenCalled();
    expect(
      (await prisma.player.findUniqueOrThrow({ where: { id: guest.id } })).type,
    ).toBe(PlayerType.GUEST);
  });

  it('handles an already converted guest as a conflict', async () => {
    const admin = await createUser('retry-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Retry guest');
    authorize('retry-admin-token', admin.authProviderId);
    const conversionRequest = () =>
      request(app.getHttpServer())
        .post(`/players/${guest.id}/convert-to-user`)
        .set('Authorization', 'Bearer retry-admin-token')
        .send({ authProviderId: 'retry-firebase-user' });

    await conversionRequest().expect(201);
    const response = await conversionRequest().expect(409);

    expect(response.body.error.code).toBe('PLAYER_ALREADY_HAS_USER');
    expect(await prisma.user.count({ where: { playerId: guest.id } })).toBe(1);
  });

  it('allows only one concurrent conversion to create a User', async () => {
    await createUser('concurrent-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Concurrent guest');
    authorize('concurrent-admin-token', 'concurrent-admin');
    const conversionRequest = () =>
      request(app.getHttpServer())
        .post(`/players/${guest.id}/convert-to-user`)
        .set('Authorization', 'Bearer concurrent-admin-token')
        .send({ authProviderId: 'concurrent-converted-user' });

    const responses = await Promise.all([
      conversionRequest(),
      conversionRequest(),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.user.count({ where: { playerId: guest.id } })).toBe(1);
    expect(
      (await prisma.player.findUniqueOrThrow({ where: { id: guest.id } })).type,
    ).toBe(PlayerType.REGULAR);
  });

  it('allows a Firebase identity to win only one concurrent guest conversion', async () => {
    await createUser('identity-race-admin', { role: UserRole.ADMIN });
    const firstGuest = await createGuest('First identity-race guest');
    const secondGuest = await createGuest('Second identity-race guest');
    authorize('identity-race-token', 'identity-race-admin');
    const convert = (playerId: string) =>
      request(app.getHttpServer())
        .post(`/players/${playerId}/convert-to-user`)
        .set('Authorization', 'Bearer identity-race-token')
        .send({ authProviderId: 'single-firebase-identity' });

    const responses = await Promise.all([
      convert(firstGuest.id),
      convert(secondGuest.id),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(
      await prisma.user.count({
        where: { authProviderId: 'single-firebase-identity' },
      }),
    ).toBe(1);
    const convertedPlayers = await prisma.player.findMany({
      where: { id: { in: [firstGuest.id, secondGuest.id] } },
      select: { type: true },
    });
    expect(
      convertedPlayers.filter(({ type }) => type === PlayerType.REGULAR),
    ).toHaveLength(1);
    expect(
      convertedPlayers.filter(({ type }) => type === PlayerType.GUEST),
    ).toHaveLength(1);
  });

  it('rejects conversion of a non-guest Player without a User', async () => {
    await createUser('type-admin', { role: UserRole.ADMIN });
    const regularPlayer = await prisma.player.create({
      data: {
        name: 'Unlinked regular',
        type: PlayerType.REGULAR,
        ...validAttributes,
      },
    });
    authorize('type-admin-token', 'type-admin');

    const response = await request(app.getHttpServer())
      .post(`/players/${regularPlayer.id}/convert-to-user`)
      .set('Authorization', 'Bearer type-admin-token')
      .send({ authProviderId: 'should-not-link' })
      .expect(422);

    expect(response.body.error.code).toBe('PLAYER_IS_NOT_GUEST');
  });

  it('promotes an existing onboarded User through the out-of-band mechanism', async () => {
    const user = await createUser('bootstrap-user');

    const firstResult = await provisionAdmin(prisma, user.authProviderId);
    const secondResult = await provisionAdmin(prisma, user.authProviderId);

    expect(firstResult).toEqual({ userId: user.id, alreadyAdmin: false });
    expect(secondResult).toEqual({ userId: user.id, alreadyAdmin: true });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role,
    ).toBe(UserRole.ADMIN);
  });
});

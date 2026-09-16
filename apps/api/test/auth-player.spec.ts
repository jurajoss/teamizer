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
import { InvitationEmailSender } from '../src/invitations/invitation-email.sender';

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
  const tokenIdentities = new Map<string, VerifiedFirebaseIdentity>();
  const firebaseTokenVerifier = {
    verify: vi.fn(async (token: string): Promise<VerifiedFirebaseIdentity> => {
      const identity = tokenIdentities.get(token);

      if (!identity) {
        throw new Error('Invalid Firebase token');
      }

      return identity;
    }),
  };
  const firebaseIdentityLookup = {
    exists: vi.fn().mockResolvedValue(true),
    findByEmail: vi.fn(),
    createEmailPasswordIdentity: vi.fn(),
    generatePasswordSetupLink: vi.fn(),
  };
  const firebaseEmailIdentities = new Map<string, string>();
  let createdFirebaseIdentityCount = 0;
  const invitationEmailSender = {
    requiresGeneratedPasswordSetupLink: true,
    send: vi.fn(),
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
      .overrideProvider(InvitationEmailSender)
      .useValue(invitationEmailSender)
      .compile();

    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    tokenIdentities.clear();
    firebaseTokenVerifier.verify.mockClear();
    firebaseIdentityLookup.exists.mockReset().mockResolvedValue(true);
    firebaseEmailIdentities.clear();
    createdFirebaseIdentityCount = 0;
    firebaseIdentityLookup.findByEmail
      .mockReset()
      .mockImplementation(async (email: string) => {
        const authProviderId = firebaseEmailIdentities.get(email);
        return authProviderId ? { authProviderId } : null;
      });
    firebaseIdentityLookup.createEmailPasswordIdentity
      .mockReset()
      .mockImplementation(async (email: string) => {
        createdFirebaseIdentityCount += 1;
        const authProviderId = `invited-firebase-${createdFirebaseIdentityCount}`;
        firebaseEmailIdentities.set(email, authProviderId);
        return { authProviderId };
      });
    firebaseIdentityLookup.generatePasswordSetupLink
      .mockReset()
      .mockImplementation(
        async () => 'https://teamizer-test.firebaseapp.com/password-setup',
      );
    invitationEmailSender.requiresGeneratedPasswordSetupLink = true;
    invitationEmailSender.send.mockReset().mockResolvedValue(undefined);
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

  function authorize(
    token: string,
    authProviderId: string,
    email?: string,
  ): void {
    tokenIdentities.set(token, {
      authProviderId,
      ...(email ? { email } : {}),
    });
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

  it('allows only an active ADMIN to invite a Guest by a valid email', async () => {
    await createUser('invite-player', { role: UserRole.PLAYER });
    const inactiveAdmin = await createUser('inactive-invite-admin', {
      role: UserRole.ADMIN,
      status: PlayerStatus.INACTIVE,
    });
    const guest = await createGuest('Invitation target');
    authorize('invite-player-token', 'invite-player');
    authorize('inactive-invite-token', inactiveAdmin.authProviderId);

    const playerResponse = await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer invite-player-token')
      .send({ email: 'guest@example.com' })
      .expect(403);
    const inactiveResponse = await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer inactive-invite-token')
      .send({ email: 'guest@example.com' })
      .expect(403);

    expect(playerResponse.body.error.code).toBe('FORBIDDEN');
    expect(inactiveResponse.body.error.code).toBe('PLAYER_INACTIVE');
    expect(firebaseIdentityLookup.findByEmail).not.toHaveBeenCalled();
    expect(invitationEmailSender.send).not.toHaveBeenCalled();
  });

  it('rejects an invalid invitation email before calling Firebase', async () => {
    await createUser('invalid-email-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Invalid email target');
    authorize('invalid-email-token', 'invalid-email-admin');

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer invalid-email-token')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(firebaseIdentityLookup.findByEmail).not.toHaveBeenCalled();
  });

  it('prepares a new Firebase identity and sends an invitation without converting the Guest early', async () => {
    await createUser('new-invite-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('New invited guest');
    authorize('new-invite-token', 'new-invite-admin');

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer new-invite-token')
      .send({ email: '  INVITED@Example.COM ' })
      .expect(201);

    expect(response.body).toEqual({ status: 'SENT' });
    expect(
      firebaseIdentityLookup.createEmailPasswordIdentity,
    ).toHaveBeenCalledWith('invited@example.com', guest.name);
    expect(
      firebaseIdentityLookup.generatePasswordSetupLink,
    ).toHaveBeenCalledWith('invited@example.com');
    expect(invitationEmailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'invited@example.com',
        playerName: guest.name,
        passwordSetupUrl:
          'https://teamizer-test.firebaseapp.com/password-setup',
      }),
    );
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { id: true, type: true, user: true, invitation: true },
      }),
    ).toMatchObject({
      id: guest.id,
      type: PlayerType.GUEST,
      user: null,
      invitation: {
        email: 'invited@example.com',
        authProviderId: 'invited-firebase-1',
        status: 'SENT',
        deliveryAttemptCount: 1,
      },
    });
  });

  it('supports provider-managed password-reset delivery without generating or exposing an action link', async () => {
    await createUser('firebase-email-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Firebase email guest');
    authorize('firebase-email-token', 'firebase-email-admin');
    invitationEmailSender.requiresGeneratedPasswordSetupLink = false;

    await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer firebase-email-token')
      .send({ email: 'firebase-delivery@example.com' })
      .expect(201);

    expect(
      firebaseIdentityLookup.generatePasswordSetupLink,
    ).not.toHaveBeenCalled();
    expect(invitationEmailSender.send).toHaveBeenCalledWith({
      recipientEmail: 'firebase-delivery@example.com',
      playerName: guest.name,
      idempotencyKey: expect.any(String),
    });
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { id: true, type: true, user: true, invitation: true },
      }),
    ).toMatchObject({
      id: guest.id,
      type: PlayerType.GUEST,
      user: null,
      invitation: {
        authProviderId: 'invited-firebase-1',
        status: 'SENT',
      },
    });
  });

  it('reuses an existing unlinked Firebase identity and never creates a duplicate', async () => {
    await createUser('existing-invite-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Existing identity guest');
    authorize('existing-invite-token', 'existing-invite-admin');
    firebaseEmailIdentities.set(
      'existing@example.com',
      'existing-unlinked-firebase-user',
    );

    await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer existing-invite-token')
      .send({ email: 'existing@example.com' })
      .expect(201);

    expect(
      firebaseIdentityLookup.createEmailPasswordIdentity,
    ).not.toHaveBeenCalled();
    expect(
      (
        await prisma.playerInvitation.findUniqueOrThrow({
          where: { playerId: guest.id },
        })
      ).authProviderId,
    ).toBe('existing-unlinked-firebase-user');
  });

  it('never transfers a Firebase identity already linked to another Player', async () => {
    await createUser('linked-invite-admin', { role: UserRole.ADMIN });
    await createUser('already-linked-invite-identity');
    const guest = await createGuest('Linked identity target');
    authorize('linked-invite-token', 'linked-invite-admin');
    firebaseEmailIdentities.set(
      'linked@example.com',
      'already-linked-invite-identity',
    );

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer linked-invite-token')
      .send({ email: 'linked@example.com' })
      .expect(409);

    expect(response.body.error.code).toBe('INVITATION_IDENTITY_ALREADY_LINKED');
    expect(invitationEmailSender.send).not.toHaveBeenCalled();
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { type: true, user: true },
      }),
    ).toEqual({ type: PlayerType.GUEST, user: null });
  });

  it('retries the same durable invitation without duplicate records or Firebase users', async () => {
    await createUser('repeat-invite-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Repeated invitation guest');
    authorize('repeat-invite-token', 'repeat-invite-admin');
    const sendInvitation = () =>
      request(app.getHttpServer())
        .post(`/players/${guest.id}/invite`)
        .set('Authorization', 'Bearer repeat-invite-token')
        .send({ email: 'repeat@example.com' });

    await sendInvitation().expect(201);
    await sendInvitation().expect(201);

    expect(await prisma.playerInvitation.count()).toBe(1);
    expect(
      (
        await prisma.playerInvitation.findUniqueOrThrow({
          where: { playerId: guest.id },
        })
      ).deliveryAttemptCount,
    ).toBe(2);
    expect(
      firebaseIdentityLookup.createEmailPasswordIdentity,
    ).toHaveBeenCalledTimes(1);
    expect(invitationEmailSender.send).toHaveBeenCalledTimes(2);
  });

  it('keeps Firebase and email provider failures retryable without partial conversion', async () => {
    await createUser('provider-failure-admin', { role: UserRole.ADMIN });
    const firebaseFailureGuest = await createGuest('Firebase failure target');
    const emailFailureGuest = await createGuest('Email failure target');
    authorize('provider-failure-token', 'provider-failure-admin');
    firebaseIdentityLookup.findByEmail.mockRejectedValueOnce(
      new Error('private Firebase provider detail'),
    );

    const firebaseResponse = await request(app.getHttpServer())
      .post(`/players/${firebaseFailureGuest.id}/invite`)
      .set('Authorization', 'Bearer provider-failure-token')
      .send({ email: 'firebase-failure@example.com' })
      .expect(503);
    expect(firebaseResponse.body.error.code).toBe(
      'IDENTITY_PROVIDER_UNAVAILABLE',
    );

    invitationEmailSender.send.mockRejectedValueOnce(
      new Error('private email provider detail'),
    );
    const emailResponse = await request(app.getHttpServer())
      .post(`/players/${emailFailureGuest.id}/invite`)
      .set('Authorization', 'Bearer provider-failure-token')
      .send({ email: 'email-failure@example.com' })
      .expect(503);
    expect(emailResponse.body.error.code).toBe('INVITATION_DELIVERY_FAILED');

    await request(app.getHttpServer())
      .post(`/players/${emailFailureGuest.id}/invite`)
      .set('Authorization', 'Bearer provider-failure-token')
      .send({ email: 'email-failure@example.com' })
      .expect(201);

    expect(
      firebaseIdentityLookup.createEmailPasswordIdentity,
    ).toHaveBeenCalledTimes(1);
    for (const playerId of [firebaseFailureGuest.id, emailFailureGuest.id]) {
      expect(
        await prisma.player.findUniqueOrThrow({
          where: { id: playerId },
          select: { type: true, user: true },
        }),
      ).toEqual({ type: PlayerType.GUEST, user: null });
    }
  });

  it('maps Firebase creation failure without sending email or converting the Guest', async () => {
    await createUser('creation-failure-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Creation failure target');
    authorize('creation-failure-token', 'creation-failure-admin');
    firebaseIdentityLookup.createEmailPasswordIdentity.mockRejectedValueOnce(
      new Error('private createUser detail'),
    );

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer creation-failure-token')
      .send({ email: 'create-failure@example.com' })
      .expect(503);

    expect(response.body.error.code).toBe('IDENTITY_PROVIDER_UNAVAILABLE');
    expect(invitationEmailSender.send).not.toHaveBeenCalled();
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { type: true, user: true },
      }),
    ).toEqual({ type: PlayerType.GUEST, user: null });
  });

  it('prevents email reservation collisions and email changes after UID reservation', async () => {
    await createUser('email-conflict-admin', { role: UserRole.ADMIN });
    const firstGuest = await createGuest('First email owner');
    const secondGuest = await createGuest('Second email owner');
    authorize('email-conflict-token', 'email-conflict-admin');
    const invite = (playerId: string, email: string) =>
      request(app.getHttpServer())
        .post(`/players/${playerId}/invite`)
        .set('Authorization', 'Bearer email-conflict-token')
        .send({ email });

    await invite(firstGuest.id, 'reserved@example.com').expect(201);
    const collision = await invite(
      secondGuest.id,
      'reserved@example.com',
    ).expect(409);
    const changedEmail = await invite(
      firstGuest.id,
      'different@example.com',
    ).expect(409);

    expect(collision.body.error.code).toBe('INVITATION_EMAIL_ALREADY_LINKED');
    expect(changedEmail.body.error.code).toBe('INVITATION_EMAIL_MISMATCH');
    expect(await prisma.playerInvitation.count()).toBe(1);
  });

  it('recovers when Firebase creation happened before its UID was recorded', async () => {
    await createUser('recovery-invite-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Crash recovery target');
    authorize('recovery-invite-token', 'recovery-invite-admin');
    firebaseEmailIdentities.set(
      'recovery@example.com',
      'firebase-created-before-db-recording',
    );
    await prisma.playerInvitation.create({
      data: { playerId: guest.id, email: 'recovery@example.com' },
    });

    await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer recovery-invite-token')
      .send({ email: 'recovery@example.com' })
      .expect(201);

    expect(
      firebaseIdentityLookup.createEmailPasswordIdentity,
    ).not.toHaveBeenCalled();
    expect(
      (
        await prisma.playerInvitation.findUniqueOrThrow({
          where: { playerId: guest.id },
        })
      ).authProviderId,
    ).toBe('firebase-created-before-db-recording');
  });

  it('recovers after a database failure that follows Firebase user creation', async () => {
    await createUser('db-recovery-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Database recovery target');
    authorize('db-recovery-token', 'db-recovery-admin');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_invitation_uid_recording()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."email" = 'db-recovery@example.com'
          AND OLD."authProviderId" IS NULL
          AND NEW."authProviderId" IS NOT NULL THEN
          RAISE EXCEPTION 'simulated invitation UID persistence failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_invitation_uid_recording_trigger
      BEFORE UPDATE ON "PlayerInvitation"
      FOR EACH ROW EXECUTE FUNCTION fail_invitation_uid_recording()
    `);

    try {
      const failureResponse = await request(app.getHttpServer())
        .post(`/players/${guest.id}/invite`)
        .set('Authorization', 'Bearer db-recovery-token')
        .send({ email: 'db-recovery@example.com' })
        .expect(503);
      expect(failureResponse.body.error.code).toBe(
        'IDENTITY_PROVIDER_UNAVAILABLE',
      );
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS fail_invitation_uid_recording_trigger ON "PlayerInvitation"',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS fail_invitation_uid_recording()',
      );
    }

    expect(
      firebaseIdentityLookup.createEmailPasswordIdentity,
    ).toHaveBeenCalledTimes(1);
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { type: true, user: true },
      }),
    ).toEqual({ type: PlayerType.GUEST, user: null });
    expect(
      await prisma.playerInvitation.findUniqueOrThrow({
        where: { playerId: guest.id },
      }),
    ).toMatchObject({ authProviderId: null, attemptToken: null });

    await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer db-recovery-token')
      .send({ email: 'db-recovery@example.com' })
      .expect(201);
    expect(
      firebaseIdentityLookup.createEmailPasswordIdentity,
    ).toHaveBeenCalledTimes(1);
    expect(invitationEmailSender.send).toHaveBeenCalledTimes(1);
  });

  it('reclaims an expired invitation lease after a process restart', async () => {
    await createUser('lease-recovery-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Lease recovery target');
    authorize('lease-recovery-token', 'lease-recovery-admin');
    firebaseEmailIdentities.set(
      'lease-recovery@example.com',
      'lease-recovery-firebase-uid',
    );
    await prisma.playerInvitation.create({
      data: {
        playerId: guest.id,
        email: 'lease-recovery@example.com',
        authProviderId: 'lease-recovery-firebase-uid',
        attemptToken: '49b5f177-eeb5-477a-962f-8427af525da8',
        attemptStartedAt: new Date(Date.now() - 10 * 60 * 1_000),
        deliveryAttemptCount: 1,
      },
    });

    await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer lease-recovery-token')
      .send({ email: 'lease-recovery@example.com' })
      .expect(201);

    expect(
      await prisma.playerInvitation.findUniqueOrThrow({
        where: { playerId: guest.id },
      }),
    ).toMatchObject({
      status: 'SENT',
      deliveryAttemptCount: 2,
      attemptToken: null,
      attemptStartedAt: null,
    });
  });

  it('serializes concurrent invitation attempts for one Guest', async () => {
    await createUser('concurrent-invite-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Concurrent invitation target');
    authorize('concurrent-invite-token', 'concurrent-invite-admin');
    let releaseLookup: (() => void) | undefined;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    let announceLookup: (() => void) | undefined;
    const lookupStarted = new Promise<void>((resolve) => {
      announceLookup = resolve;
    });
    firebaseIdentityLookup.findByEmail.mockImplementationOnce(async () => {
      announceLookup?.();
      await lookupGate;
      return null;
    });
    const send = () =>
      request(app.getHttpServer())
        .post(`/players/${guest.id}/invite`)
        .set('Authorization', 'Bearer concurrent-invite-token')
        .send({ email: 'concurrent@example.com' });

    const firstResponsePromise = send().then((response) => response);
    await lookupStarted;
    const secondResponse = await send();
    releaseLookup?.();
    const firstResponse = await firstResponsePromise;

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([
      201, 409,
    ]);
    expect(
      [firstResponse, secondResponse].find(({ status }) => status === 409)?.body
        .error.code,
    ).toBe('INVITATION_IN_PROGRESS');
    expect(invitationEmailSender.send).toHaveBeenCalledTimes(1);
  });

  it('activates the invitation on first sign-in and preserves the existing Player domain record', async () => {
    await createUser('activation-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('History-preserving invitee');
    await prisma.player.update({
      where: { id: guest.id },
      data: {
        avatarStorageKey: `players/${guest.id}/avatar/version.jpg`,
        avatarContentType: 'image/jpeg',
        avatarUpdatedAt: new Date('2026-09-14T12:00:00.000Z'),
      },
    });
    const sport = await prisma.sport.create({
      data: {
        name: 'Invitation history sport',
        teamsPerMatch: 2,
        playersOnFieldPerTeam: 3,
      },
    });
    const match = await prisma.match.create({
      data: {
        sportId: sport.id,
        startsAt: new Date('2026-09-01T18:00:00.000Z'),
        status: 'FINISHED',
        teamAScore: 2,
        teamBScore: 1,
        completedAt: new Date('2026-09-01T20:00:00.000Z'),
      },
    });
    await prisma.matchParticipant.create({
      data: { matchId: match.id, playerId: guest.id, attendance: 'GOING' },
    });
    await prisma.matchPlayerStat.create({
      data: { matchId: match.id, playerId: guest.id, goals: 2 },
    });
    authorize('activation-admin-token', 'activation-admin');

    await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer activation-admin-token')
      .send({ email: 'activation@example.com' })
      .expect(201);
    authorize('invited-player-token', 'invited-firebase-1');

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer invited-player-token')
      .expect(200);

    expect(response.body.player).toMatchObject({
      id: guest.id,
      name: guest.name,
      type: 'REGULAR',
    });
    const activatedPlayer = await prisma.player.findUniqueOrThrow({
      where: { id: guest.id },
      include: {
        user: true,
        invitation: true,
        participants: true,
        matchPlayerStats: true,
      },
    });
    expect(activatedPlayer).toMatchObject({
      id: guest.id,
      type: PlayerType.REGULAR,
      speed: validAttributes.speed,
      endurance: validAttributes.endurance,
      defense: validAttributes.defense,
      attack: validAttributes.attack,
      technique: validAttributes.technique,
      avatarStorageKey: `players/${guest.id}/avatar/version.jpg`,
      user: { authProviderId: 'invited-firebase-1' },
      invitation: { status: 'ACCEPTED' },
    });
    expect(activatedPlayer.participants).toHaveLength(1);
    expect(activatedPlayer.matchPlayerStats).toEqual([
      expect.objectContaining({ goals: 2 }),
    ]);
  });

  it('claims a pending email reservation if an existing Firebase user signs in during preparation', async () => {
    const guest = await createGuest('Existing identity race target');
    await prisma.playerInvitation.create({
      data: { playerId: guest.id, email: 'race@example.com' },
    });
    authorize(
      'existing-race-token',
      'existing-race-firebase-uid',
      'RACE@Example.COM',
    );

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer existing-race-token')
      .expect(200);

    expect(response.body.player).toMatchObject({
      id: guest.id,
      type: 'REGULAR',
    });
    expect(
      await prisma.playerInvitation.findUniqueOrThrow({
        where: { playerId: guest.id },
      }),
    ).toMatchObject({
      authProviderId: 'existing-race-firebase-uid',
      status: 'ACCEPTED',
    });
    expect(await prisma.player.count()).toBe(1);
  });

  it('lets first-login activation win a race with invitation preparation without sending redundant email', async () => {
    await createUser('activation-race-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Activation race target');
    authorize('activation-race-admin-token', 'activation-race-admin');
    firebaseEmailIdentities.set(
      'activation-race@example.com',
      'activation-race-firebase-uid',
    );
    let releaseLookup: (() => void) | undefined;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookup = resolve;
    });
    let announceLookup: (() => void) | undefined;
    const lookupStarted = new Promise<void>((resolve) => {
      announceLookup = resolve;
    });
    firebaseIdentityLookup.findByEmail.mockImplementationOnce(async () => {
      announceLookup?.();
      await lookupGate;
      return { authProviderId: 'activation-race-firebase-uid' };
    });

    const invitationResponsePromise = request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer activation-race-admin-token')
      .send({ email: 'activation-race@example.com' })
      .then((response) => response);
    await lookupStarted;
    authorize(
      'activation-race-player-token',
      'activation-race-firebase-uid',
      'activation-race@example.com',
    );
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer activation-race-player-token')
      .expect(200);
    releaseLookup?.();
    const invitationResponse = await invitationResponsePromise;

    expect(invitationResponse.status).toBe(201);
    expect(invitationResponse.body).toEqual({ status: 'ACCEPTED' });
    expect(invitationEmailSender.send).not.toHaveBeenCalled();
    expect(await prisma.player.count()).toBe(2);
    expect(await prisma.user.count({ where: { playerId: guest.id } })).toBe(1);
  });

  it('creates only one User when the invitee makes concurrent first requests', async () => {
    await createUser('concurrent-activation-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Concurrent activation target');
    authorize(
      'concurrent-activation-admin-token',
      'concurrent-activation-admin',
    );
    await request(app.getHttpServer())
      .post(`/players/${guest.id}/invite`)
      .set('Authorization', 'Bearer concurrent-activation-admin-token')
      .send({ email: 'concurrent-activation@example.com' })
      .expect(201);
    authorize('concurrent-activation-player-token', 'invited-firebase-1');
    const getMe = () =>
      request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer concurrent-activation-player-token');

    const responses = await Promise.all([getMe(), getMe()]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(await prisma.user.count({ where: { playerId: guest.id } })).toBe(1);
    expect(await prisma.player.count()).toBe(2);
    expect(
      (
        await prisma.playerInvitation.findUniqueOrThrow({
          where: { playerId: guest.id },
        })
      ).status,
    ).toBe('ACCEPTED');
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

  it('does not let UID fallback override a different reserved invitation identity', async () => {
    await createUser('fallback-conflict-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Fallback conflict guest');
    authorize('fallback-conflict-token', 'fallback-conflict-admin');
    await prisma.playerInvitation.create({
      data: {
        playerId: guest.id,
        email: 'reserved-fallback@example.com',
        authProviderId: 'reserved-invitation-uid',
        status: 'SENT',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', 'Bearer fallback-conflict-token')
      .send({ authProviderId: 'different-fallback-uid' })
      .expect(409);

    expect(response.body.error.code).toBe('INVITATION_IDENTITY_CONFLICT');
    expect(firebaseIdentityLookup.exists).not.toHaveBeenCalled();
    expect(
      await prisma.player.findUniqueOrThrow({
        where: { id: guest.id },
        select: { type: true, user: true },
      }),
    ).toEqual({ type: PlayerType.GUEST, user: null });
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

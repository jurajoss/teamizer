import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MatchStatus,
  PlayerInvitationStatus,
  PlayerStatus,
  PlayerType,
  PrismaClient,
  TeamSide,
  UserRole,
} from '@prisma/client';
import sharp from 'sharp';
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
import { FirebaseIdentityLookup } from '../src/auth/firebase-identity-lookup.service';
import { FirebaseTokenVerifier } from '../src/auth/firebase-token-verifier.service';
import {
  AVATAR_STORAGE,
  type AvatarStorage,
  type StoredAvatar,
} from '../src/avatars/avatar-storage';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
const attributes = {
  speed: 5,
  endurance: 6,
  defense: 7,
  attack: 8,
  technique: 9,
};

class InMemoryAvatarStorage implements AvatarStorage {
  readonly objects = new Map<string, Buffer>();
  readonly deletedKeys: string[] = [];
  private sequence = 0;

  async store(playerId: string, data: Buffer): Promise<string> {
    const key = `${playerId}-object-${++this.sequence}.jpg`;
    this.objects.set(key, data);
    return key;
  }

  async delete(storageKey: string): Promise<void> {
    this.deletedKeys.push(storageKey);
    this.objects.delete(storageKey);
  }

  publicUrl(storageKey: string): string {
    return `https://avatars.example.test/${encodeURIComponent(storageKey)}?signed=test`;
  }

  async readSigned(): Promise<StoredAvatar | null> {
    return null;
  }

  reset(): void {
    this.objects.clear();
    this.deletedKeys.length = 0;
    this.sequence = 0;
  }
}

function assertDedicatedTestDatabase(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must name a dedicated _test database.');
  }
}

describeWithDatabase('Player profiles, administration, and avatars', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let validJpeg: Buffer;
  let validPng: Buffer;
  const storage = new InMemoryAvatarStorage();
  const tokenIdentities = new Map<string, string>();
  const firebaseTokenVerifier = {
    verify: vi.fn(async (token: string): Promise<VerifiedFirebaseIdentity> => {
      const authProviderId = tokenIdentities.get(token);
      if (!authProviderId) throw new Error('Invalid Firebase token');
      return { authProviderId };
    }),
  };
  const firebaseIdentityLookup = {
    exists: vi.fn().mockResolvedValue(true),
  };

  beforeAll(async () => {
    if (!testDatabaseUrl) return;
    assertDedicatedTestDatabase(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    process.env.FIREBASE_PROJECT_ID = 'teamizer-test';
    process.env.PROPOSAL_RECEIPT_SECRET =
      'test-proposal-receipt-secret-32-characters';
    process.env.AVATAR_MAX_UPLOAD_BYTES = '2048';
    prisma = new PrismaClient({
      datasources: { db: { url: testDatabaseUrl } },
    });
    validPng = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: 32, g: 96, b: 64 },
      },
    })
      .png()
      .toBuffer();
    validJpeg = await sharp({
      create: {
        width: 16,
        height: 24,
        channels: 3,
        background: { r: 96, g: 32, b: 64 },
      },
    })
      .jpeg()
      .toBuffer();

    const moduleReference = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(FirebaseTokenVerifier)
      .useValue(firebaseTokenVerifier)
      .overrideProvider(FirebaseIdentityLookup)
      .useValue(firebaseIdentityLookup)
      .overrideProvider(AVATAR_STORAGE)
      .useValue(storage)
      .compile();
    app = moduleReference.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    tokenIdentities.clear();
    firebaseIdentityLookup.exists.mockReset().mockResolvedValue(true);
    storage.reset();
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
            ...attributes,
          },
        },
      },
      include: { player: true },
    });
  }

  async function createGuest(name: string) {
    return prisma.player.create({
      data: { name, type: PlayerType.GUEST, ...attributes },
    });
  }

  function authorize(token: string, authProviderId: string): string {
    tokenIdentities.set(token, authProviderId);
    return `Bearer ${token}`;
  }

  it('returns and edits the current Player profile without exposing attributes', async () => {
    const caller = await createUser('self-profile', { name: 'Before Name' });
    const authorization = authorize('self-token', caller.authProviderId);

    const current = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', authorization)
      .expect(200);
    const updated = await request(app.getHttpServer())
      .patch(`/players/${caller.player.id}`)
      .set('Authorization', authorization)
      .send({ name: '  After Name  ' })
      .expect(200);

    expect(current.body.player).not.toHaveProperty('attributes');
    expect(updated.body).toMatchObject({
      id: caller.player.id,
      name: 'After Name',
      avatarUrl: null,
    });
    expect(updated.body).not.toHaveProperty('attributes');
  });

  it('forbids a Player from editing attributes or another Player', async () => {
    const caller = await createUser('ordinary-player');
    const other = await createUser('other-player');
    const authorization = authorize('ordinary-token', caller.authProviderId);

    await request(app.getHttpServer())
      .patch(`/players/${caller.player.id}`)
      .set('Authorization', authorization)
      .send({ attributes: { ...attributes, speed: 10 } })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/players/${other.player.id}`)
      .set('Authorization', authorization)
      .send({ name: 'Not Allowed' })
      .expect(403);

    const detail = await request(app.getHttpServer())
      .get(`/players/${other.player.id}`)
      .set('Authorization', authorization)
      .expect(200);
    expect(detail.body).not.toHaveProperty('attributes');
    expect(detail.body).not.toHaveProperty('account');
    expect(detail.body.name).toBe('other-player');
  });

  it('gives active ADMINs public list rows and private editable detail', async () => {
    const admin = await createUser('profile-admin', { role: UserRole.ADMIN });
    const guest = await createGuest('Guest Alpha');
    const invitedGuest = await createGuest('Awaiting Player');
    await prisma.playerInvitation.create({
      data: {
        email: 'invited-guest@example.com',
        playerId: invitedGuest.id,
        status: PlayerInvitationStatus.SENT,
      },
    });
    const authorization = authorize('admin-token', admin.authProviderId);

    const list = await request(app.getHttpServer())
      .get('/players?status=ALL&q=Guest')
      .set('Authorization', authorization)
      .expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/players/${guest.id}`)
      .set('Authorization', authorization)
      .expect(200);
    const invitedDetail = await request(app.getHttpServer())
      .get(`/players/${invitedGuest.id}`)
      .set('Authorization', authorization)
      .expect(200);
    const registeredDetail = await request(app.getHttpServer())
      .get(`/players/${admin.player.id}`)
      .set('Authorization', authorization)
      .expect(200);

    expect(list.body.items).toEqual([
      expect.objectContaining({
        id: guest.id,
        name: 'Guest Alpha',
        type: 'GUEST',
      }),
    ]);
    expect(list.body.items[0]).not.toHaveProperty('attributes');
    expect(detail.body.attributes).toEqual(attributes);
    expect(detail.body.account).toEqual({ state: 'UNLINKED' });
    expect(invitedDetail.body.account).toEqual({
      state: 'INVITED',
      email: 'invited-guest@example.com',
      invitationStatus: 'SENT',
    });
    expect(registeredDetail.body.account).toEqual({ state: 'REGISTERED' });
  });

  it('validates ADMIN attribute edits and enforces active administration', async () => {
    const admin = await createUser('attribute-admin', {
      role: UserRole.ADMIN,
    });
    const inactiveAdmin = await createUser('inactive-admin', {
      role: UserRole.ADMIN,
      status: PlayerStatus.INACTIVE,
    });
    const guest = await createGuest('Rated Guest');

    await request(app.getHttpServer())
      .patch(`/players/${guest.id}`)
      .set('Authorization', authorize('range-token', admin.authProviderId))
      .send({ attributes: { ...attributes, speed: 11 } })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/players/${guest.id}`)
      .set(
        'Authorization',
        authorize('inactive-token', inactiveAdmin.authProviderId),
      )
      .send({ status: 'INACTIVE' })
      .expect(403);

    const updated = await request(app.getHttpServer())
      .patch(`/players/${guest.id}`)
      .set('Authorization', authorize('valid-token', admin.authProviderId))
      .send({ attributes: { ...attributes, speed: 10 } })
      .expect(200);
    expect(updated.body.attributes.speed).toBe(10);
  });

  it('authorizes own and ADMIN avatar uploads but rejects another Player', async () => {
    const owner = await createUser('avatar-owner');
    const other = await createUser('avatar-other');
    const admin = await createUser('avatar-admin', { role: UserRole.ADMIN });

    const ownUpload = await request(app.getHttpServer())
      .post(`/players/${owner.player.id}/avatar`)
      .set('Authorization', authorize('owner-token', owner.authProviderId))
      .attach('file', validPng, {
        filename: '../../client-supplied.png',
        contentType: 'image/png',
      })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/players/${other.player.id}/avatar`)
      .set('Authorization', authorize('forbidden-token', owner.authProviderId))
      .attach('file', validPng, {
        filename: 'other.png',
        contentType: 'image/png',
      })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/players/${other.player.id}/avatar`)
      .set(
        'Authorization',
        authorize('avatar-admin-token', admin.authProviderId),
      )
      .attach('file', validPng, {
        filename: 'admin.png',
        contentType: 'image/png',
      })
      .expect(200);

    expect(ownUpload.body.avatarUrl).toContain(owner.player.id);
    const persisted = await prisma.player.findUniqueOrThrow({
      where: { id: owner.player.id },
    });
    expect(persisted.avatarStorageKey).toMatch(
      new RegExp(`^${owner.player.id}-object-\\d+\\.jpg$`),
    );
    expect(persisted.avatarStorageKey).not.toContain('client-supplied');
    expect(persisted.avatarContentType).toBe('image/jpeg');
    const normalized = await sharp(
      storage.objects.get(persisted.avatarStorageKey ?? ''),
    ).metadata();
    expect(normalized).toMatchObject({
      format: 'jpeg',
      width: 512,
      height: 512,
    });
  });

  it('rejects unsupported, oversized, corrupt, and arbitrary avatar inputs', async () => {
    const owner = await createUser('invalid-avatar-owner');
    const authorization = authorize(
      'invalid-owner-token',
      owner.authProviderId,
    );
    const endpoint = `/players/${owner.player.id}/avatar`;

    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', authorization)
      .attach('file', Buffer.from('not an image'), {
        filename: 'avatar.txt',
        contentType: 'text/plain',
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', authorization)
      .attach('file', Buffer.alloc(2_049), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(413);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', authorization)
      .attach('file', Buffer.from('corrupt'), {
        filename: 'corrupt.png',
        contentType: 'image/png',
      })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/players/${owner.player.id}`)
      .set('Authorization', authorization)
      .send({ avatarUrl: 'https://attacker.example/avatar.jpg' })
      .expect(400);
    expect(storage.objects.size).toBe(0);
  });

  it('uses decoded avatar content when multipart MIME metadata is missing or stale', async () => {
    const owner = await createUser('metadata-avatar-owner');
    const authorization = authorize(
      'metadata-avatar-token',
      owner.authProviderId,
    );

    const response = await request(app.getHttpServer())
      .post(`/players/${owner.player.id}/avatar`)
      .set('Authorization', authorization)
      .attach('file', validJpeg, {
        filename: 'camera-output.heic',
        contentType: 'application/octet-stream',
      })
      .expect(200);

    expect(response.body.avatarUrl).toContain(owner.player.id);
    const persisted = await prisma.player.findUniqueOrThrow({
      where: { id: owner.player.id },
    });
    const normalized = await sharp(
      storage.objects.get(persisted.avatarStorageKey ?? ''),
    ).metadata();
    expect(normalized).toMatchObject({
      format: 'jpeg',
      height: 512,
      width: 512,
    });
  });

  it('safely replaces and removes avatar references and storage objects', async () => {
    const owner = await createUser('replacement-owner');
    const authorization = authorize('replacement-token', owner.authProviderId);
    const endpoint = `/players/${owner.player.id}/avatar`;
    const upload = () =>
      request(app.getHttpServer())
        .post(endpoint)
        .set('Authorization', authorization)
        .attach('file', validPng, {
          filename: 'avatar.png',
          contentType: 'image/png',
        });

    await upload().expect(200);
    const firstKey = (
      await prisma.player.findUniqueOrThrow({ where: { id: owner.player.id } })
    ).avatarStorageKey;
    await upload().expect(200);
    const secondKey = (
      await prisma.player.findUniqueOrThrow({ where: { id: owner.player.id } })
    ).avatarStorageKey;

    expect(secondKey).not.toBe(firstKey);
    expect(storage.deletedKeys).toContain(firstKey);
    expect(storage.objects.has(firstKey ?? '')).toBe(false);
    expect(storage.objects.has(secondKey ?? '')).toBe(true);

    await request(app.getHttpServer())
      .delete(endpoint)
      .set('Authorization', authorization)
      .expect(204);
    const removed = await prisma.player.findUniqueOrThrow({
      where: { id: owner.player.id },
    });
    expect(removed).toMatchObject({
      avatarStorageKey: null,
      avatarContentType: null,
      avatarUpdatedAt: null,
    });
    expect(storage.deletedKeys).toContain(secondKey);
  });

  it('preserves guest ID, history, attributes, and avatar through conversion', async () => {
    const admin = await createUser('conversion-profile-admin', {
      role: UserRole.ADMIN,
    });
    const guest = await createGuest('Historic Guest');
    const sport = await prisma.sport.create({
      data: {
        name: 'Conversion Football',
        teamsPerMatch: 2,
        playersOnFieldPerTeam: 1,
      },
    });
    const match = await prisma.match.create({
      data: {
        sportId: sport.id,
        startsAt: new Date('2026-08-01T18:00:00.000Z'),
        status: MatchStatus.FINISHED,
        teamAScore: 1,
        teamBScore: 0,
        startedAt: new Date('2026-08-01T18:00:00.000Z'),
        completedAt: new Date('2026-08-01T19:00:00.000Z'),
      },
    });
    const team = await prisma.team.create({
      data: { matchId: match.id, side: TeamSide.A },
    });
    await prisma.teamMembership.create({
      data: { matchId: match.id, teamId: team.id, playerId: guest.id },
    });
    await prisma.matchPlayerStat.create({
      data: { matchId: match.id, playerId: guest.id, goals: 1 },
    });
    await prisma.player.update({
      where: { id: guest.id },
      data: {
        avatarStorageKey: `${guest.id}-fixture.jpg`,
        avatarContentType: 'image/jpeg',
        avatarUpdatedAt: new Date('2026-08-02T12:00:00.000Z'),
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/players/${guest.id}/convert-to-user`)
      .set('Authorization', authorize('conversion-token', admin.authProviderId))
      .send({ authProviderId: 'pre-provisioned-firebase-uid' })
      .expect(201);
    const converted = await prisma.player.findUniqueOrThrow({
      where: { id: guest.id },
      include: {
        user: true,
        teamMemberships: true,
        matchPlayerStats: true,
      },
    });

    expect(response.body.player).toMatchObject({
      id: guest.id,
      type: 'REGULAR',
      attributes,
    });
    expect(response.body.player.avatarUrl).toContain(
      encodeURIComponent(`${guest.id}-fixture.jpg`),
    );
    expect(converted).toMatchObject({
      id: guest.id,
      type: PlayerType.REGULAR,
      avatarStorageKey: `${guest.id}-fixture.jpg`,
      ...attributes,
    });
    expect(converted.user).toMatchObject({
      authProviderId: 'pre-provisioned-firebase-uid',
      role: UserRole.PLAYER,
    });
    expect(converted.teamMemberships).toHaveLength(1);
    expect(converted.matchPlayerStats).toEqual([
      expect.objectContaining({ matchId: match.id, goals: 1 }),
    ]);
  });

  it('implements ADMIN-only deactivation without deleting finished history', async () => {
    const admin = await createUser('deactivation-admin', {
      role: UserRole.ADMIN,
    });
    const ordinary = await createUser('deactivation-player');
    const guest = await createGuest('Archived Guest');
    const sport = await prisma.sport.create({
      data: {
        name: 'Deactivation Football',
        teamsPerMatch: 2,
        playersOnFieldPerTeam: 1,
      },
    });
    const match = await prisma.match.create({
      data: {
        sportId: sport.id,
        startsAt: new Date('2026-08-05T18:00:00.000Z'),
        status: MatchStatus.FINISHED,
        teamAScore: 0,
        teamBScore: 0,
        startedAt: new Date('2026-08-05T18:00:00.000Z'),
        completedAt: new Date('2026-08-05T19:00:00.000Z'),
      },
    });
    const team = await prisma.team.create({
      data: { matchId: match.id, side: TeamSide.B },
    });
    await prisma.teamMembership.create({
      data: { matchId: match.id, teamId: team.id, playerId: guest.id },
    });

    await request(app.getHttpServer())
      .patch(`/players/${guest.id}`)
      .set(
        'Authorization',
        authorize('ordinary-deactivate-token', ordinary.authProviderId),
      )
      .send({ status: 'INACTIVE' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/players/${guest.id}`)
      .set(
        'Authorization',
        authorize('admin-deactivate-token', admin.authProviderId),
      )
      .send({ status: 'INACTIVE' })
      .expect(200);

    expect(
      await prisma.player.findUniqueOrThrow({ where: { id: guest.id } }),
    ).toMatchObject({ status: PlayerStatus.INACTIVE });
    expect(
      await prisma.teamMembership.findUnique({
        where: { matchId_playerId: { matchId: match.id, playerId: guest.id } },
      }),
    ).not.toBeNull();
    expect(
      await prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
    ).toMatchObject({ status: MatchStatus.FINISHED });
  });
});

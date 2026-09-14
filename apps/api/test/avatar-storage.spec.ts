import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAvatarStorage } from '../src/avatars/avatar.module';
import {
  type AvatarStorage,
  LocalAvatarStorage,
} from '../src/avatars/avatar-storage';
import { GcsAvatarStorage } from '../src/avatars/gcs-avatar-storage';

describe('LocalAvatarStorage', () => {
  let directory: string;
  let storage: LocalAvatarStorage;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'teamizer-avatar-test-'));
    storage = new LocalAvatarStorage(
      new ConfigService({
        AVATAR_STORAGE_DIRECTORY: directory,
        AVATAR_PUBLIC_BASE_URL: 'https://api.example.test',
        AVATAR_URL_SECRET: 'avatar-url-test-secret-at-least-32-characters',
        AVATAR_URL_TTL_SECONDS: 3_600,
      }),
    );
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('generates isolated server-owned keys and validates its signed URL', async () => {
    const playerId = '00000000-0000-4000-8000-000000000001';
    const key = await storage.store(playerId, Buffer.from('normalized-jpeg'));
    const url = new URL(storage.publicUrl(key));

    expect(key).toMatch(
      new RegExp(
        `^${playerId}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.jpg$`,
        'i',
      ),
    );
    expect(url.origin).toBe('https://api.example.test');
    const avatar = await storage.readSigned(
      key,
      url.searchParams.get('expires') ?? '',
      url.searchParams.get('signature') ?? '',
    );
    expect(avatar).toEqual({
      data: Buffer.from('normalized-jpeg'),
      contentType: 'image/jpeg',
    });
  });

  it('rejects tampered, expired, and traversal storage requests', async () => {
    const key = await storage.store(
      '00000000-0000-4000-8000-000000000002',
      Buffer.from('avatar'),
    );
    const url = new URL(storage.publicUrl(key));
    const expires = url.searchParams.get('expires') ?? '';
    const signature = url.searchParams.get('signature') ?? '';

    await expect(
      storage.readSigned(`${key}-tampered`, expires, signature),
    ).resolves.toBeNull();
    await expect(
      storage.readSigned(key, expires, `${signature}tampered`),
    ).resolves.toBeNull();
    await expect(storage.readSigned(key, '1', signature)).resolves.toBeNull();
    await expect(
      storage.readSigned('../../outside.jpg', expires, signature),
    ).resolves.toBeNull();
  });
});

describe('avatar storage driver selection', () => {
  const commonConfig = {
    AVATAR_STORAGE_DIRECTORY: '.data/avatars',
    AVATAR_GCS_BUCKET_NAME: 'teamizer-test-avatars',
    AVATAR_PUBLIC_BASE_URL: 'https://api.example.test',
    AVATAR_URL_SECRET: 'avatar-url-test-secret-at-least-32-characters',
    AVATAR_URL_TTL_SECONDS: 3_600,
  };

  it.each([
    ['local', LocalAvatarStorage],
    ['gcs', GcsAvatarStorage],
  ] as const)('binds the %s driver', (driver, expectedType) => {
    const storage: AvatarStorage = createAvatarStorage(
      new ConfigService({
        ...commonConfig,
        AVATAR_STORAGE_DRIVER: driver,
      }),
    );

    expect(storage).toBeInstanceOf(expectedType);
  });
});

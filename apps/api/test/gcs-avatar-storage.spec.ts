import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import {
  GcsAvatarStorage,
  type GcsAvatarObjectStore,
} from '../src/avatars/gcs-avatar-storage';

const PLAYER_ID = '00000000-0000-4000-8000-000000000001';

type FakeObject = {
  data: Buffer;
  generation: string;
};

class FakeGcsAvatarObjectStore implements GcsAvatarObjectStore {
  readonly objects = new Map<string, FakeObject>();
  readonly deleted: Array<{
    bucketName: string;
    objectName: string;
    generation: string | undefined;
  }> = [];
  uploadCount = 0;
  failDeletionFor: string | null = null;
  private nextGeneration = 1;

  async upload(
    bucketName: string,
    objectName: string,
    data: Buffer,
  ): Promise<string> {
    this.uploadCount += 1;
    const generation = String(this.nextGeneration++);
    this.objects.set(this.key(bucketName, objectName), { data, generation });
    return generation;
  }

  async delete(
    bucketName: string,
    objectName: string,
    generation?: string,
  ): Promise<void> {
    this.deleted.push({ bucketName, objectName, generation });
    if (this.failDeletionFor === objectName) {
      throw new Error('simulated delete failure');
    }
    const key = this.key(bucketName, objectName);
    const object = this.objects.get(key);
    if (!generation || object?.generation === generation) {
      this.objects.delete(key);
    }
  }

  async download(
    bucketName: string,
    objectName: string,
    generation: string,
  ): Promise<Buffer> {
    const object = this.objects.get(this.key(bucketName, objectName));
    if (!object || object.generation !== generation) {
      throw Object.assign(new Error('not found'), { code: 404 });
    }
    return object.data;
  }

  seed(bucketName: string, objectName: string): void {
    this.objects.set(this.key(bucketName, objectName), {
      data: Buffer.from('orphan'),
      generation: String(this.nextGeneration++),
    });
  }

  private key(bucketName: string, objectName: string): string {
    return `${bucketName}/${objectName}`;
  }
}

function createStorage(objects: GcsAvatarObjectStore): GcsAvatarStorage {
  return new GcsAvatarStorage(
    new ConfigService({
      AVATAR_GCS_BUCKET_NAME: 'teamizer-test-avatars',
      AVATAR_GCS_OBJECT_PREFIX: 'environments/test',
      AVATAR_PUBLIC_BASE_URL: 'https://api.example.test',
      AVATAR_URL_SECRET: 'avatar-url-test-secret-at-least-32-characters',
      AVATAR_URL_TTL_SECONDS: 3_600,
    }),
    objects,
  );
}

describe('GcsAvatarStorage', () => {
  it('stores private-object references in alternating Player slots with generation versions', async () => {
    const objects = new FakeGcsAvatarObjectStore();
    const storage = createStorage(objects);

    const firstKey = await storage.store(
      PLAYER_ID,
      Buffer.from('first normalized jpeg'),
    );
    const secondKey = await storage.store(
      PLAYER_ID,
      Buffer.from('second normalized jpeg'),
      firstKey,
    );
    await storage.delete(firstKey);
    const thirdKey = await storage.store(
      PLAYER_ID,
      Buffer.from('third normalized jpeg'),
      secondKey,
    );
    await storage.delete(secondKey);

    expect(firstKey).toBe(`gcs-v1-${PLAYER_ID}-a-1.jpg`);
    expect(secondKey).toBe(`gcs-v1-${PLAYER_ID}-b-2.jpg`);
    expect(thirdKey).toBe(`gcs-v1-${PLAYER_ID}-a-3.jpg`);
    expect(new Set([firstKey, secondKey, thirdKey]).size).toBe(3);
    expect(objects.objects).toEqual(
      new Map([
        [
          `teamizer-test-avatars/environments/test/players/${PLAYER_ID}/avatar-a.jpg`,
          {
            data: Buffer.from('third normalized jpeg'),
            generation: '3',
          },
        ],
      ]),
    );
    expect(objects.deleted).toContainEqual({
      bucketName: 'teamizer-test-avatars',
      objectName: `environments/test/players/${PLAYER_ID}/avatar-a.jpg`,
      generation: '1',
    });
  });

  it('cleans both bounded slots when no current GCS reference exists', async () => {
    const objects = new FakeGcsAvatarObjectStore();
    const storage = createStorage(objects);
    const firstSlot = `environments/test/players/${PLAYER_ID}/avatar-a.jpg`;
    const secondSlot = `environments/test/players/${PLAYER_ID}/avatar-b.jpg`;
    objects.seed('teamizer-test-avatars', firstSlot);
    objects.seed('teamizer-test-avatars', secondSlot);

    await storage.store(PLAYER_ID, Buffer.from('replacement'));

    expect(objects.objects.size).toBe(1);
    expect(
      objects.objects.get(`teamizer-test-avatars/${firstSlot}`)?.data,
    ).toEqual(Buffer.from('replacement'));
    expect(objects.objects.has(`teamizer-test-avatars/${secondSlot}`)).toBe(
      false,
    );
  });

  it('serves only valid API-signed keys and reads the exact GCS generation', async () => {
    const objects = new FakeGcsAvatarObjectStore();
    const storage = createStorage(objects);
    const key = await storage.store(PLAYER_ID, Buffer.from('avatar'));
    const url = new URL(storage.publicUrl(key));
    const expires = url.searchParams.get('expires') ?? '';
    const signature = url.searchParams.get('signature') ?? '';

    await expect(storage.readSigned(key, expires, signature)).resolves.toEqual({
      data: Buffer.from('avatar'),
      contentType: 'image/jpeg',
    });
    await expect(
      storage.readSigned(key.replace('-a-', '-b-'), expires, signature),
    ).resolves.toBeNull();
    await expect(
      storage.readSigned(key, expires, `${signature}tampered`),
    ).resolves.toBeNull();
    await expect(storage.readSigned(key, '1', signature)).resolves.toBeNull();
    const missingGenerationKey = key.replace('-1.jpg', '-999.jpg');
    const missingGenerationUrl = new URL(
      storage.publicUrl(missingGenerationKey),
    );
    await expect(
      storage.readSigned(
        missingGenerationKey,
        missingGenerationUrl.searchParams.get('expires') ?? '',
        missingGenerationUrl.searchParams.get('signature') ?? '',
      ),
    ).resolves.toBeNull();
  });

  it('does not upload when the inactive bounded slot cannot be cleaned', async () => {
    const objects = new FakeGcsAvatarObjectStore();
    const storage = createStorage(objects);
    objects.failDeletionFor = `environments/test/players/${PLAYER_ID}/avatar-a.jpg`;

    await expect(
      storage.store(PLAYER_ID, Buffer.from('avatar')),
    ).rejects.toThrow('simulated delete failure');
    expect(objects.uploadCount).toBe(0);
  });

  it('rejects malformed server-owned keys for deletion', async () => {
    const storage = createStorage(new FakeGcsAvatarObjectStore());
    await expect(storage.delete('../../outside.jpg')).rejects.toThrow(
      'Invalid server-owned GCS avatar storage key.',
    );
  });
});

import { Storage } from '@google-cloud/storage';
import type { ConfigService } from '@nestjs/config';

import {
  type AvatarStorage,
  AvatarUrlSigner,
  type StoredAvatar,
} from './avatar-storage';

const PLAYER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GCS_STORAGE_KEY_PATTERN =
  /^gcs-v1-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})-([ab])-([1-9][0-9]*)\.jpg$/i;

type AvatarSlot = 'a' | 'b';

type ParsedGcsStorageKey = {
  playerId: string;
  slot: AvatarSlot;
  generation: string;
};

export interface GcsAvatarObjectStore {
  upload(bucketName: string, objectName: string, data: Buffer): Promise<string>;
  delete(
    bucketName: string,
    objectName: string,
    generation?: string,
  ): Promise<void>;
  download(
    bucketName: string,
    objectName: string,
    generation: string,
  ): Promise<Buffer>;
}

class GoogleCloudAvatarObjectStore implements GcsAvatarObjectStore {
  private readonly storage = new Storage();

  async upload(
    bucketName: string,
    objectName: string,
    data: Buffer,
  ): Promise<string> {
    const file = this.storage.bucket(bucketName).file(objectName);
    await file.save(data, {
      contentType: 'image/jpeg',
      metadata: {
        cacheControl: 'private, no-store',
        contentType: 'image/jpeg',
      },
      preconditionOpts: { ifGenerationMatch: 0 },
      resumable: false,
      validation: 'crc32c',
    });
    const [metadata] = await file.getMetadata();
    if (!metadata.generation) {
      throw new Error('GCS did not return an avatar object generation.');
    }
    return String(metadata.generation);
  }

  async delete(
    bucketName: string,
    objectName: string,
    generation?: string,
  ): Promise<void> {
    const file = this.storage
      .bucket(bucketName)
      .file(objectName, generation ? { generation } : undefined);
    await file.delete({ ignoreNotFound: true });
  }

  async download(
    bucketName: string,
    objectName: string,
    generation: string,
  ): Promise<Buffer> {
    const [data] = await this.storage
      .bucket(bucketName)
      .file(objectName, { generation })
      .download({ validation: 'crc32c' });
    return data;
  }
}

export class GcsAvatarStorage implements AvatarStorage {
  private readonly bucketName: string;
  private readonly objectPrefix: string | undefined;
  private readonly urlSigner: AvatarUrlSigner;

  constructor(
    config: ConfigService,
    private readonly objects: GcsAvatarObjectStore = new GoogleCloudAvatarObjectStore(),
  ) {
    this.bucketName = config.getOrThrow<string>('AVATAR_GCS_BUCKET_NAME');
    this.objectPrefix = config.get<string>('AVATAR_GCS_OBJECT_PREFIX');
    this.urlSigner = new AvatarUrlSigner(config);
  }

  async store(
    playerId: string,
    data: Buffer,
    replacingStorageKey?: string | null,
  ): Promise<string> {
    if (!PLAYER_ID_PATTERN.test(playerId)) {
      throw new Error('Invalid Player ID for an avatar object.');
    }

    const previous = replacingStorageKey
      ? this.parseStorageKey(replacingStorageKey)
      : null;
    const previousSlot =
      previous?.playerId.toLowerCase() === playerId.toLowerCase()
        ? previous.slot
        : null;
    const targetSlot: AvatarSlot = previousSlot === 'a' ? 'b' : 'a';

    if (!previousSlot) {
      await this.objects.delete(
        this.bucketName,
        this.objectName(playerId, 'b'),
      );
    }
    const targetObjectName = this.objectName(playerId, targetSlot);
    await this.objects.delete(this.bucketName, targetObjectName);
    const generation = await this.objects.upload(
      this.bucketName,
      targetObjectName,
      data,
    );
    if (!/^[1-9][0-9]*$/.test(generation)) {
      throw new Error('GCS returned an invalid avatar object generation.');
    }

    return `gcs-v1-${playerId}-${targetSlot}-${generation}.jpg`;
  }

  async delete(storageKey: string): Promise<void> {
    const parsed = this.requireStorageKey(storageKey);
    await this.objects.delete(
      this.bucketName,
      this.objectName(parsed.playerId, parsed.slot),
      parsed.generation,
    );
  }

  publicUrl(storageKey: string): string {
    return this.urlSigner.publicUrl(storageKey);
  }

  async readSigned(
    storageKey: string,
    expires: string,
    signature: string,
  ): Promise<StoredAvatar | null> {
    const parsed = this.parseStorageKey(storageKey);
    if (
      !parsed ||
      !this.urlSigner.validRequest(storageKey, expires, signature)
    ) {
      return null;
    }

    try {
      return {
        data: await this.objects.download(
          this.bucketName,
          this.objectName(parsed.playerId, parsed.slot),
          parsed.generation,
        ),
        contentType: 'image/jpeg',
      };
    } catch (error) {
      if (isObjectNotFound(error)) return null;
      throw error;
    }
  }

  private objectName(playerId: string, slot: AvatarSlot): string {
    const relativeName = `players/${playerId}/avatar-${slot}.jpg`;
    return this.objectPrefix
      ? `${this.objectPrefix}/${relativeName}`
      : relativeName;
  }

  private parseStorageKey(storageKey: string): ParsedGcsStorageKey | null {
    const match = GCS_STORAGE_KEY_PATTERN.exec(storageKey);
    const playerId = match?.[1];
    const slot = match?.[2];
    const generation = match?.[3];
    if (!playerId || (slot !== 'a' && slot !== 'b') || !generation) {
      return null;
    }
    return { playerId, slot, generation };
  }

  private requireStorageKey(storageKey: string): ParsedGcsStorageKey {
    const parsed = this.parseStorageKey(storageKey);
    if (!parsed) {
      throw new Error('Invalid server-owned GCS avatar storage key.');
    }
    return parsed;
  }
}

function isObjectNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === 404 || error.code === '404';
}

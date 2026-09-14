import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type StoredAvatar = {
  data: Buffer;
  contentType: 'image/jpeg';
};

export interface AvatarStorage {
  store(
    playerId: string,
    data: Buffer,
    replacingStorageKey?: string | null,
  ): Promise<string>;
  delete(storageKey: string): Promise<void>;
  publicUrl(storageKey: string): string;
  readSigned(
    storageKey: string,
    expires: string,
    signature: string,
  ): Promise<StoredAvatar | null>;
}

export const AVATAR_STORAGE = Symbol('AVATAR_STORAGE');

const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/i;

export class AvatarUrlSigner {
  private readonly publicBaseUrl: string;
  private readonly signingSecret: string;
  private readonly urlTtlSeconds: number;

  constructor(config: ConfigService) {
    this.publicBaseUrl = config.getOrThrow<string>('AVATAR_PUBLIC_BASE_URL');
    this.signingSecret = config.getOrThrow<string>('AVATAR_URL_SECRET');
    this.urlTtlSeconds = config.getOrThrow<number>('AVATAR_URL_TTL_SECONDS');
  }

  publicUrl(storageKey: string): string {
    const expires = Math.floor(Date.now() / 1_000) + this.urlTtlSeconds;
    const signature = this.signature(storageKey, expires);
    const query = new URLSearchParams({
      expires: String(expires),
      signature,
    });
    return `${this.publicBaseUrl}/player-avatars/${encodeURIComponent(storageKey)}?${query}`;
  }

  validRequest(
    storageKey: string,
    expiresValue: string,
    candidateSignature: string,
  ): boolean {
    const expires = Number(expiresValue);
    if (
      !Number.isSafeInteger(expires) ||
      expires < Math.floor(Date.now() / 1_000)
    ) {
      return false;
    }

    const expected = Buffer.from(this.signature(storageKey, expires));
    const received = Buffer.from(candidateSignature);
    return (
      expected.length === received.length && timingSafeEqual(expected, received)
    );
  }

  private signature(storageKey: string, expires: number): string {
    return createHmac('sha256', this.signingSecret)
      .update(`${storageKey}:${expires}`)
      .digest('base64url');
  }
}

@Injectable()
export class LocalAvatarStorage implements AvatarStorage {
  private readonly directory: string;
  private readonly urlSigner: AvatarUrlSigner;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const configuredDirectory = config.getOrThrow<string>(
      'AVATAR_STORAGE_DIRECTORY',
    );
    this.directory = isAbsolute(configuredDirectory)
      ? configuredDirectory
      : resolve(process.cwd(), configuredDirectory);
    this.urlSigner = new AvatarUrlSigner(config);
  }

  async store(playerId: string, data: Buffer): Promise<string> {
    const storageKey = `${playerId}-${randomUUID()}.jpg`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(storageKey), data, { flag: 'wx' });
    return storageKey;
  }

  async delete(storageKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(storageKey));
    } catch (error) {
      if (!isFileNotFound(error)) throw error;
    }
  }

  publicUrl(storageKey: string): string {
    return this.urlSigner.publicUrl(storageKey);
  }

  async readSigned(
    storageKey: string,
    expiresValue: string,
    signature: string,
  ): Promise<StoredAvatar | null> {
    if (
      !STORAGE_KEY_PATTERN.test(storageKey) ||
      !this.urlSigner.validRequest(storageKey, expiresValue, signature)
    ) {
      return null;
    }

    try {
      return {
        data: await readFile(this.pathFor(storageKey)),
        contentType: 'image/jpeg',
      };
    } catch (error) {
      if (isFileNotFound(error)) return null;
      throw error;
    }
  }

  private pathFor(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new Error('Invalid server-owned avatar storage key.');
    }
    return resolve(this.directory, storageKey);
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

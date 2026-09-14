import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  expoFetch: vi.fn(),
  fileConstructor: vi.fn(),
  fileConstructorError: null as Error | null,
  fileMetadata: {
    exists: true,
    size: 125_000,
    type: 'image/jpeg',
  },
}));

vi.mock('expo/fetch', () => ({ fetch: nativeMocks.expoFetch }));
vi.mock('expo-file-system', () => ({
  File: class MockExpoFile {
    readonly uri: string;

    constructor(uri: string) {
      nativeMocks.fileConstructor(uri);
      if (nativeMocks.fileConstructorError) {
        throw nativeMocks.fileConstructorError;
      }
      this.uri = uri;
    }

    get exists() {
      return nativeMocks.fileMetadata.exists;
    }

    get name() {
      return 'normalized-avatar.jpg';
    }

    get size() {
      return nativeMocks.fileMetadata.size;
    }

    get type() {
      return nativeMocks.fileMetadata.type;
    }

    bytes(): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    }
  },
}));

import { createAvatarUploadTransport } from './avatar-upload-transport.native';
import { nativeAvatarUpload } from './avatar-upload';

class TestFormData {
  readonly parts: Array<[string, unknown]> = [];

  append(name: string, value: unknown): void {
    this.parts.push([name, value]);
  }
}

describe('native Expo avatar transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeMocks.fileConstructorError = null;
    nativeMocks.fileMetadata.exists = true;
    nativeMocks.fileMetadata.size = 125_000;
    nativeMocks.fileMetadata.type = 'image/jpeg';
    vi.stubGlobal('FormData', TestFormData);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('appends an existing Expo File directly instead of a URI descriptor', () => {
    const transport = createAvatarUploadTransport();

    const body = transport.prepareBody(
      nativeAvatarUpload('file:///cache/normalized-avatar.jpg'),
    ) as unknown as TestFormData;

    expect(nativeMocks.fileConstructor).toHaveBeenCalledWith(
      'file:///cache/normalized-avatar.jpg',
    );
    expect(body.parts).toHaveLength(1);
    expect(body.parts[0]?.[0]).toBe('file');
    expect(body.parts[0]?.[1]).toMatchObject({
      uri: 'file:///cache/normalized-avatar.jpg',
      exists: true,
      size: 125_000,
      type: 'image/jpeg',
    });
    expect(body.parts[0]?.[1]).not.toEqual({
      uri: 'file:///cache/normalized-avatar.jpg',
      name: 'avatar.jpg',
      type: 'image/jpeg',
    });
    expect(
      vi.mocked(console.info).mock.calls.map(([message]) => message),
    ).toEqual([
      'AVATAR_STAGE=file_created',
      'AVATAR_STAGE=file_verified',
      'AVATAR_STAGE=formdata_started',
      'AVATAR_STAGE=formdata_success',
    ]);
  });

  it('uses expo/fetch without manually setting multipart Content-Type', async () => {
    const response = new Response('{}', { status: 200 });
    nativeMocks.expoFetch.mockResolvedValue(response);
    const transport = createAvatarUploadTransport();
    const body = transport.prepareBody(
      nativeAvatarUpload('file:///cache/normalized-avatar.jpg'),
    );

    const result = await transport.send('https://api.example.test/avatar', {
      method: 'POST',
      headers: { Authorization: 'Bearer safe-test-token' },
      body,
    });

    expect(result).toBe(response);
    expect(nativeMocks.expoFetch).toHaveBeenCalledWith(
      'https://api.example.test/avatar',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer safe-test-token' },
        body,
      },
    );
    const headers = new Headers(
      nativeMocks.expoFetch.mock.calls[0]?.[1]?.headers,
    );
    expect(headers.get('Authorization')).toBe('Bearer safe-test-token');
    expect(headers.get('Content-Type')).toBeNull();
  });

  it.each([
    ['missing', false, 125_000, 'image/jpeg'],
    ['empty', true, 0, 'image/jpeg'],
    ['non-JPEG', true, 125_000, 'image/png'],
  ] as const)(
    'rejects a %s normalized file before transport',
    (_state, exists, size, type) => {
      nativeMocks.fileMetadata.exists = exists;
      nativeMocks.fileMetadata.size = size;
      nativeMocks.fileMetadata.type = type;
      const transport = createAvatarUploadTransport();

      expect(() =>
        transport.prepareBody(
          nativeAvatarUpload('file:///cache/normalized-avatar.jpg'),
        ),
      ).toThrow();
      expect(nativeMocks.expoFetch).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        'AVATAR_TRANSPORT_ERROR=file_verification',
      );
      expect(console.info).not.toHaveBeenCalledWith(
        'AVATAR_STAGE=file_verified',
      );
      expect(console.info).not.toHaveBeenCalledWith(
        'AVATAR_STAGE=request_started',
      );
    },
  );

  it('rejects a file construction failure before transport', () => {
    nativeMocks.fileConstructorError = new Error('unreadable local URI');
    const transport = createAvatarUploadTransport();

    expect(() =>
      transport.prepareBody(
        nativeAvatarUpload('file:///cache/normalized-avatar.jpg'),
      ),
    ).toThrow('unreadable local URI');
    expect(nativeMocks.expoFetch).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      'AVATAR_TRANSPORT_ERROR=file_creation',
    );
    expect(console.info).not.toHaveBeenCalledWith('AVATAR_STAGE=file_created');
  });

  it('reports only a safe category when expo/fetch rejects', async () => {
    nativeMocks.expoFetch.mockRejectedValue(new Error('sensitive details'));
    const transport = createAvatarUploadTransport();

    await expect(
      transport.send('https://api.example.test/avatar', {
        method: 'POST',
      }),
    ).rejects.toThrow('sensitive details');
    expect(console.warn).toHaveBeenCalledWith(
      'AVATAR_TRANSPORT_ERROR=expo_fetch',
    );
  });
});

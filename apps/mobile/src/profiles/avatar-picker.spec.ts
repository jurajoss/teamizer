import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthenticatedApiClient,
  type FetchImplementation,
} from '../api/authenticated-api-client';

const nativeMocks = vi.hoisted(() => ({
  expoFetch: vi.fn(),
  fileConstructor: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  manipulateAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));

vi.mock('expo/fetch', () => ({ fetch: nativeMocks.expoFetch }));
vi.mock('expo-file-system', () => ({
  File: class MockExpoFile {
    readonly exists = true;
    readonly size = 125_000;
    readonly type = 'image/jpeg';
    readonly uri: string;

    constructor(uri: string) {
      nativeMocks.fileConstructor(uri);
      this.uri = uri;
    }

    get name() {
      return 'normalized-avatar.jpg';
    }

    bytes(): Promise<Uint8Array> {
      return Promise.resolve(new Uint8Array([1, 2, 3]));
    }
  },
}));

vi.mock('expo-image-picker', () => ({
  launchCameraAsync: nativeMocks.launchCameraAsync,
  launchImageLibraryAsync: nativeMocks.launchImageLibraryAsync,
  requestCameraPermissionsAsync: nativeMocks.requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync:
    nativeMocks.requestMediaLibraryPermissionsAsync,
}));

vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: nativeMocks.manipulateAsync,
  SaveFormat: { JPEG: 'jpeg' },
}));

import { prepareAvatar } from './avatar-picker.native';
import { runAvatarUploadFlow } from './avatar-upload-flow';
import { createAvatarUploadTransport } from '../api/avatar-upload-transport.native';

describe('native avatar preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    nativeMocks.requestCameraPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    nativeMocks.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
    });
    nativeMocks.manipulateAsync.mockResolvedValue({
      height: 800,
      uri: 'file:///prepared/avatar.jpg',
      width: 800,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('unused'))),
    );
    vi.stubGlobal(
      'Blob',
      class UnsupportedNativeBlob {
        constructor() {
          throw new Error('Native Blob construction must not be used.');
        }
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['CAMERA', 'image/heic', 'IMG_1001.HEIC'],
    ['LIBRARY', 'image/heif', 'IMG_1002.HEIF'],
  ] as const)(
    'normalizes %s input with %s metadata to a native JPEG file',
    async (source, mimeType, fileName) => {
      const result = {
        canceled: false,
        assets: [
          {
            fileName,
            height: 3_024,
            mimeType,
            uri: `file:///source/${fileName}`,
            width: 4_032,
          },
        ],
      };
      if (source === 'CAMERA') {
        nativeMocks.launchCameraAsync.mockResolvedValue(result);
      } else {
        nativeMocks.launchImageLibraryAsync.mockResolvedValue(result);
      }

      const prepared = await prepareAvatar(source);

      expect(nativeMocks.manipulateAsync).toHaveBeenCalledWith(
        `file:///source/${fileName}`,
        [{ resize: { width: 1_280 } }],
        { compress: 0.82, format: 'jpeg' },
      );
      expect(prepared).toEqual({
        kind: 'NATIVE_FILE',
        uri: 'file:///prepared/avatar.jpg',
        fileName: 'avatar.jpg',
        mimeType: 'image/jpeg',
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith('AVATAR_STAGE=picker_started');
      expect(console.info).toHaveBeenCalledWith('AVATAR_STAGE=picker_success');
      expect(console.info).toHaveBeenCalledWith(
        'AVATAR_STAGE=manipulation_started',
      );
      expect(console.info).toHaveBeenCalledWith(
        'AVATAR_STAGE=manipulation_success',
      );
    },
  );

  it('reaches upload with the manipulated JPEG URI', async () => {
    nativeMocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          height: 3_024,
          uri: 'file:///source/library.heic',
          width: 4_032,
        },
      ],
    });
    const upload = vi.fn().mockResolvedValue(undefined);

    const result = await runAvatarUploadFlow('LIBRARY', prepareAvatar, upload);

    expect(result).toEqual({ status: 'UPLOADED' });
    expect(upload).toHaveBeenCalledWith({
      kind: 'NATIVE_FILE',
      uri: 'file:///prepared/avatar.jpg',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs the successful native picker path through the authenticated avatar POST', async () => {
    class NativeFormData {
      readonly parts: Array<[string, unknown]> = [];

      append(name: string, value: unknown): void {
        this.parts.push([name, value]);
      }
    }

    vi.stubGlobal('FormData', NativeFormData);
    nativeMocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          height: 3_024,
          uri: 'file:///source/library.heic',
          width: 4_032,
        },
      ],
    });
    const playerId = '17d13986-b1ab-4ebc-a7b8-ac832e0bdb8b';
    nativeMocks.expoFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: playerId,
          name: 'Gaz',
          type: 'REGULAR',
          status: 'ACTIVE',
          avatarUrl: 'https://avatars.example.test/player.jpg',
          statistics: {
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            winRate: null,
            goals: 0,
            goalsPerMatch: null,
            attendance: {
              playedMatches: 0,
              totalMatches: 0,
              percentage: null,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('fresh-token') },
      fetchImplementation,
      createAvatarUploadTransport(),
    );

    const result = await runAvatarUploadFlow(
      'LIBRARY',
      prepareAvatar,
      async (upload) => {
        await client.uploadOwnPlayerAvatar(playerId, upload);
      },
    );

    expect(result).toEqual({ status: 'UPLOADED' });
    expect(nativeMocks.expoFetch).toHaveBeenCalledOnce();
    expect(fetchImplementation).not.toHaveBeenCalled();
    const [url, init] = nativeMocks.expoFetch.mock.calls[0] ?? [];
    expect(url).toBe(`https://api.example.test/players/${playerId}/avatar`);
    expect(init?.method).toBe('POST');
    const filePart = (init?.body as unknown as NativeFormData).parts[0];
    expect(filePart?.[0]).toBe('file');
    expect(filePart?.[1]).toMatchObject({
      exists: true,
      size: 125_000,
      type: 'image/jpeg',
      uri: 'file:///prepared/avatar.jpg',
    });
    expect(nativeMocks.fileConstructor).toHaveBeenCalledWith(
      'file:///prepared/avatar.jpg',
    );
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer fresh-token',
    );
    expect(new Headers(init?.headers).get('Content-Type')).toBeNull();
    expect(console.info).toHaveBeenCalledTimes(10);
    expect(
      vi.mocked(console.info).mock.calls.map(([message]) => message),
    ).toEqual([
      'AVATAR_STAGE=picker_started',
      'AVATAR_STAGE=picker_success',
      'AVATAR_STAGE=manipulation_started',
      'AVATAR_STAGE=manipulation_success',
      'AVATAR_STAGE=file_created',
      'AVATAR_STAGE=file_verified',
      'AVATAR_STAGE=formdata_started',
      'AVATAR_STAGE=formdata_success',
      'AVATAR_STAGE=request_started',
      'AVATAR_STAGE=response_received',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid normalized image state without constructing a Blob', async () => {
    nativeMocks.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          height: 800,
          uri: 'file:///source/camera.heic',
          width: 600,
        },
      ],
    });
    nativeMocks.manipulateAsync.mockResolvedValue({
      height: 800,
      uri: '',
      width: 600,
    });

    await expect(prepareAvatar('CAMERA')).rejects.toThrow('file URI');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves cancellation without preparing or uploading an image', async () => {
    nativeMocks.launchImageLibraryAsync.mockResolvedValue({
      assets: [],
      canceled: true,
    });

    await expect(prepareAvatar('LIBRARY')).resolves.toBeNull();
    expect(nativeMocks.manipulateAsync).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not upload when native image manipulation fails', async () => {
    nativeMocks.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          height: 800,
          uri: 'file:///source/library.heic',
          width: 600,
        },
      ],
    });
    const manipulationError = new Error('native manipulation failed');
    nativeMocks.manipulateAsync.mockRejectedValue(manipulationError);
    const upload = vi.fn();

    const result = await runAvatarUploadFlow('LIBRARY', prepareAvatar, upload);

    expect(result).toEqual({
      status: 'PREPARATION_FAILED',
      error: manipulationError,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(
      'AVATAR_STAGE=manipulation_started',
    );
    expect(console.info).not.toHaveBeenCalledWith(
      'AVATAR_STAGE=manipulation_success',
    );
  });
});

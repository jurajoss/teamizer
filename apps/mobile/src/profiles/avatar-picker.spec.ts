import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn(),
  manipulateAsync: vi.fn(),
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
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

describe('native avatar preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    },
  );

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
});

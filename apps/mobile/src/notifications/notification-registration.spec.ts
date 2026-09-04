import { describe, expect, it, vi } from 'vitest';

import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import type { NotificationPlatform } from './notification-platform';
import {
  NotificationRegistration,
  type NotificationStorage,
} from './notification-registration';

type MemoryStorage = NotificationStorage & { values: Map<string, string> };

function memoryStorage(): MemoryStorage {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

function apiClient() {
  return {
    registerPushDevice: vi.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000101',
    }),
    invalidatePushDevice: vi.fn().mockResolvedValue(undefined),
  };
}

function platform(): NotificationPlatform {
  return {
    acquireToken: vi.fn().mockResolvedValue({
      token: {
        provider: 'EXPO',
        platform: 'IOS',
        pushToken: 'ExponentPushToken[device]',
      },
      permissionPromptShown: true,
    }),
    subscribeToMatchResponses: vi.fn(() => () => undefined),
  };
}

describe('NotificationRegistration', () => {
  it('registers an authenticated physical device and invalidates it on sign-out', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const api = apiClient();
    const notifications = platform();
    const storage = memoryStorage();
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      notifications,
      storage,
      'eas-project-id',
    );

    await registration.register(userId);
    await registration.unregisterCurrentDevice();

    expect(notifications.acquireToken).toHaveBeenCalledWith({
      easProjectId: 'eas-project-id',
      mayRequestPermission: true,
    });
    expect(api.registerPushDevice).toHaveBeenCalledWith({
      provider: 'EXPO',
      platform: 'IOS',
      pushToken: 'ExponentPushToken[device]',
    });
    expect(api.invalidatePushDevice).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000101',
    );
    expect(storage.values.has(deviceKey(userId))).toBe(false);
    expect(storage.values.has(pendingRevocationKey(userId))).toBe(false);
  });

  it('retains a durable pending revocation after transient invalidation failure', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const deviceId = '00000000-0000-4000-8000-000000000101';
    const api = apiClient();
    api.invalidatePushDevice.mockRejectedValueOnce(
      new ApiClientError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'),
    );
    const storage = memoryStorage();
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      platform(),
      storage,
      'eas-project-id',
    );

    await registration.register(userId);
    await expect(
      registration.unregisterCurrentDevice(),
    ).resolves.toBeUndefined();

    expect(storage.values.get(deviceKey(userId))).toBe(deviceId);
    expect(storage.values.get(pendingRevocationKey(userId))).toBe(deviceId);
  });

  it('retries an authenticated pending revocation after app restart before registering again', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const deviceId = '00000000-0000-4000-8000-000000000101';
    const storage = memoryStorage();
    await storage.setItem(deviceKey(userId), deviceId);
    await storage.setItem(pendingRevocationKey(userId), deviceId);
    const api = apiClient();
    const restarted = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      platform(),
      storage,
      'eas-project-id',
    );

    await restarted.register(userId);

    expect(api.invalidatePushDevice).toHaveBeenCalledWith(deviceId);
    expect(api.invalidatePushDevice.mock.invocationCallOrder[0]).toBeLessThan(
      api.registerPushDevice.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(storage.values.has(pendingRevocationKey(userId))).toBe(false);
    expect(storage.values.get(deviceKey(userId))).toBe(deviceId);
  });

  it('retries only the current account and never revokes A while authenticated as B', async () => {
    const userA = '00000000-0000-4000-8000-000000000001';
    const userB = '00000000-0000-4000-8000-000000000002';
    const api = apiClient();
    api.invalidatePushDevice.mockRejectedValueOnce(
      new ApiClientError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'),
    );
    const storage = memoryStorage();
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      platform(),
      storage,
      'eas-project-id',
    );

    await registration.register(userA);
    await registration.unregisterCurrentDevice();
    await registration.register(userB);

    expect(api.invalidatePushDevice).toHaveBeenCalledTimes(1);
    expect(storage.values.has(pendingRevocationKey(userA))).toBe(true);
    expect(storage.values.has(deviceKey(userB))).toBe(true);
    expect(api.registerPushDevice).toHaveBeenCalledTimes(2);
  });

  it('keeps retry state across repeated transient failures and registers after success', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const deviceId = '00000000-0000-4000-8000-000000000101';
    const storage = memoryStorage();
    await storage.setItem(deviceKey(userId), deviceId);
    await storage.setItem(pendingRevocationKey(userId), deviceId);
    const api = apiClient();
    api.invalidatePushDevice
      .mockRejectedValueOnce(
        new ApiClientError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'),
      )
      .mockRejectedValueOnce(
        new ApiClientError(503, 'SERVICE_UNAVAILABLE', 'Unavailable'),
      );
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      platform(),
      storage,
      'eas-project-id',
    );

    await registration.register(userId);
    await registration.register(userId);
    expect(api.registerPushDevice).not.toHaveBeenCalled();
    expect(storage.values.has(pendingRevocationKey(userId))).toBe(true);

    await registration.register(userId);

    expect(api.invalidatePushDevice).toHaveBeenCalledTimes(3);
    expect(api.registerPushDevice).toHaveBeenCalledTimes(1);
    expect(storage.values.has(pendingRevocationKey(userId))).toBe(false);
  });

  it('cleans pending state after terminal not-found handling', async () => {
    const userId = '00000000-0000-4000-8000-000000000001';
    const deviceId = '00000000-0000-4000-8000-000000000101';
    const storage = memoryStorage();
    await storage.setItem(deviceKey(userId), deviceId);
    await storage.setItem(pendingRevocationKey(userId), deviceId);
    const api = apiClient();
    const replacementDeviceId = '00000000-0000-4000-8000-000000000102';
    api.registerPushDevice.mockResolvedValueOnce({ id: replacementDeviceId });
    api.invalidatePushDevice.mockRejectedValueOnce(
      new ApiClientError(404, 'RESOURCE_NOT_FOUND', 'Missing'),
    );
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      platform(),
      storage,
      'eas-project-id',
    );

    await registration.register(userId);

    expect(storage.values.get(deviceKey(userId))).toBe(replacementDeviceId);
    expect(storage.values.has(pendingRevocationKey(userId))).toBe(false);
    expect(api.registerPushDevice).toHaveBeenCalledTimes(1);
  });

  it('remembers a shown permission prompt and does not request it again', async () => {
    const storage = memoryStorage();
    const firstPlatform = platform();
    const first = new NotificationRegistration(
      apiClient() as unknown as AuthenticatedApiClient,
      firstPlatform,
      storage,
      'eas-project-id',
    );
    await first.register('00000000-0000-4000-8000-000000000001');

    const secondPlatform = platform();
    const second = new NotificationRegistration(
      apiClient() as unknown as AuthenticatedApiClient,
      secondPlatform,
      storage,
      'eas-project-id',
    );
    await second.register('00000000-0000-4000-8000-000000000002');

    expect(secondPlatform.acquireToken).toHaveBeenCalledWith(
      expect.objectContaining({ mayRequestPermission: false }),
    );
  });

  it('treats denied permission as a non-blocking no-push state', async () => {
    const api = apiClient();
    const notifications: NotificationPlatform = {
      acquireToken: vi.fn().mockResolvedValue({
        token: null,
        permissionPromptShown: true,
      }),
      subscribeToMatchResponses: () => () => undefined,
    };
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      notifications,
      memoryStorage(),
      'eas-project-id',
    );

    await expect(
      registration.register('00000000-0000-4000-8000-000000000001'),
    ).resolves.toBeUndefined();
    expect(api.registerPushDevice).not.toHaveBeenCalled();
  });

  it('retires a registration that finishes while sign-out is in progress', async () => {
    const api = apiClient();
    let finishRegistration: (() => void) | undefined;
    api.registerPushDevice.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRegistration = () =>
            resolve({ id: '00000000-0000-4000-8000-000000000101' });
        }),
    );
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      platform(),
      memoryStorage(),
      'eas-project-id',
    );

    const registering = registration.register(
      '00000000-0000-4000-8000-000000000001',
    );
    await vi.waitFor(() => expect(finishRegistration).toBeTypeOf('function'));
    const signingOut = registration.unregisterCurrentDevice();
    finishRegistration?.();
    await Promise.all([registering, signingOut]);

    expect(api.invalidatePushDevice).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000101',
    );
  });

  it('serializes an identity switch so the new registration is final', async () => {
    const api = apiClient();
    const firstRegistration = deferredRegistration();
    api.registerPushDevice
      .mockImplementationOnce(() => firstRegistration.promise)
      .mockResolvedValueOnce({
        id: '00000000-0000-4000-8000-000000000101',
      });
    const registration = new NotificationRegistration(
      api as unknown as AuthenticatedApiClient,
      platform(),
      memoryStorage(),
      'eas-project-id',
    );

    const first = registration.register('00000000-0000-4000-8000-000000000001');
    await vi.waitFor(() =>
      expect(api.registerPushDevice).toHaveBeenCalledTimes(1),
    );
    const second = registration.register(
      '00000000-0000-4000-8000-000000000002',
    );
    expect(api.registerPushDevice).toHaveBeenCalledTimes(1);
    firstRegistration.resolve({
      id: '00000000-0000-4000-8000-000000000101',
    });

    await Promise.all([first, second]);

    expect(api.registerPushDevice).toHaveBeenCalledTimes(2);
    expect(api.invalidatePushDevice).not.toHaveBeenCalled();
  });

  it('delegates notification responses without interpreting arbitrary payloads', () => {
    const notifications = platform();
    const registration = new NotificationRegistration(
      apiClient() as unknown as AuthenticatedApiClient,
      notifications,
      memoryStorage(),
      undefined,
    );
    const onMatch = vi.fn();

    registration.subscribeToMatchResponses(onMatch);

    expect(notifications.subscribeToMatchResponses).toHaveBeenCalledWith(
      onMatch,
    );
  });
});

function deferredRegistration() {
  let resolve!: (value: { id: string }) => void;
  const promise = new Promise<{ id: string }>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function deviceKey(userId: string): string {
  return `teamizer:notifications:device:${userId}`;
}

function pendingRevocationKey(userId: string): string {
  return `teamizer:notifications:pending-revocation:${userId}`;
}

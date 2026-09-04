import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import type { NotificationPlatform } from './notification-platform';

const PERMISSION_ATTEMPTED_KEY = 'teamizer:notifications:permission-attempted';
const DEVICE_KEY_PREFIX = 'teamizer:notifications:device:';
const PENDING_REVOCATION_KEY_PREFIX =
  'teamizer:notifications:pending-revocation:';

export interface NotificationStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class NotificationRegistration {
  private currentUserId: string | null = null;
  private registration: Promise<void> | null = null;
  private operationChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly apiClient: AuthenticatedApiClient,
    private readonly platform: NotificationPlatform,
    private readonly storage: NotificationStorage,
    private readonly easProjectId: string | undefined,
  ) {}

  register(userId: string): Promise<void> {
    if (this.currentUserId === userId && this.registration) {
      return this.registration;
    }
    this.currentUserId = userId;
    const registration = this.enqueue(() => this.performRegistration(userId));
    this.registration = registration;
    void registration.then(() => {
      if (this.registration === registration) {
        this.registration = null;
      }
    });
    return this.registration;
  }

  unregisterCurrentDevice(): Promise<void> {
    const userId = this.currentUserId;
    this.currentUserId = null;
    this.registration = null;
    if (!userId) {
      return Promise.resolve();
    }
    return this.enqueue(() => this.performUnregistration(userId));
  }

  subscribeToMatchResponses(onMatch: (matchId: string) => void): () => void {
    return this.platform.subscribeToMatchResponses(onMatch);
  }

  private async performRegistration(userId: string): Promise<void> {
    if (!(await this.retryPendingRevocation(userId))) {
      return;
    }

    const permissionAttempted =
      (await this.storage.getItem(PERMISSION_ATTEMPTED_KEY)) === 'true';
    const result = await this.platform.acquireToken({
      easProjectId: this.easProjectId,
      mayRequestPermission: !permissionAttempted,
    });
    if (result.permissionPromptShown) {
      await this.storage.setItem(PERMISSION_ATTEMPTED_KEY, 'true');
    }
    if (!result.token || this.currentUserId !== userId) return;
    const device = await this.apiClient.registerPushDevice(result.token);
    if (this.currentUserId === userId || this.currentUserId === null) {
      await this.storage.setItem(this.deviceKey(userId), device.id);
    }
  }

  private async performUnregistration(userId: string): Promise<void> {
    const pendingKey = this.pendingRevocationKey(userId);
    let deviceId = await this.storage.getItem(pendingKey);
    if (!deviceId) {
      deviceId = await this.storage.getItem(this.deviceKey(userId));
      if (!deviceId) {
        return;
      }
      await this.storage.setItem(pendingKey, deviceId);
    }

    await this.retryPendingRevocation(userId);
  }

  private async retryPendingRevocation(userId: string): Promise<boolean> {
    const pendingKey = this.pendingRevocationKey(userId);
    const deviceId = await this.storage.getItem(pendingKey);
    if (!deviceId) {
      return true;
    }

    try {
      await this.apiClient.invalidatePushDevice(deviceId);
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 404) {
        return false;
      }
    }

    const storedDeviceId = await this.storage.getItem(this.deviceKey(userId));
    if (storedDeviceId === deviceId) {
      await this.storage.removeItem(this.deviceKey(userId));
    }
    await this.storage.removeItem(pendingKey);
    return true;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const queued = this.operationChain.then(operation);
    const settled = queued.catch(() => undefined);
    this.operationChain = settled;
    return settled;
  }

  private deviceKey(userId: string): string {
    return `${DEVICE_KEY_PREFIX}${userId}`;
  }

  private pendingRevocationKey(userId: string): string {
    return `${PENDING_REVOCATION_KEY_PREFIX}${userId}`;
  }
}

import type { NotificationPlatform } from './notification-platform';

export function createNotificationPlatform(): NotificationPlatform {
  return {
    acquireToken: async () => ({
      token: null,
      permissionPromptShown: false,
    }),
    subscribeToMatchResponses: () => () => undefined,
  };
}

import { z } from 'zod';

import { matchIdSchema } from '../api/contracts';

export type NotificationToken = {
  provider: 'EXPO';
  platform: 'IOS' | 'ANDROID';
  pushToken: string;
};

export type NotificationPermissionResult = {
  token: NotificationToken | null;
  permissionPromptShown: boolean;
};

export interface NotificationPlatform {
  acquireToken(options: {
    easProjectId: string | undefined;
    mayRequestPermission: boolean;
  }): Promise<NotificationPermissionResult>;
  subscribeToMatchResponses(onMatch: (matchId: string) => void): () => void;
}

const matchNotificationDataSchema = z.object({
  type: z.literal('MATCH_ATTENDANCE_REMINDER'),
  matchId: matchIdSchema,
});

export function matchIdFromNotificationData(data: unknown): string | null {
  const parsed = matchNotificationDataSchema.safeParse(data);
  return parsed.success ? parsed.data.matchId : null;
}

export function createNotificationPlatform(): NotificationPlatform {
  return {
    acquireToken: async () => ({
      token: null,
      permissionPromptShown: false,
    }),
    subscribeToMatchResponses: () => () => undefined,
  };
}

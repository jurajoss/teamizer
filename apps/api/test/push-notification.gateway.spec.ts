import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FirebaseExpoPushNotificationGateway,
  type PushMessage,
} from '../src/notifications/push-notification.gateway';

const message: PushMessage = {
  token: 'private-provider-token',
  title: 'Upcoming Match',
  body: 'Football · Tue, 1 Sep, 18:00',
  data: {
    type: 'MATCH_ATTENDANCE_REMINDER',
    matchId: '00000000-0000-4000-8000-000000000010',
  },
};

function gateway(timeoutMs = 100): FirebaseExpoPushNotificationGateway {
  return new FirebaseExpoPushNotificationGateway(
    new ConfigService({
      FIREBASE_PROJECT_ID: 'teamizer-test',
      PUSH_PROVIDER_TIMEOUT_MS: timeoutMs,
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('push notification gateway', () => {
  it('classifies an Expo invalid-token ticket as permanent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              status: 'error',
              details: { error: 'DeviceNotRegistered' },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(gateway().send('EXPO', message)).resolves.toEqual({
      outcome: 'INVALID_TOKEN',
      errorCode: 'DeviceNotRegistered',
    });
  });

  it('treats a malformed successful Expo response as transient', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ unexpected: true }), { status: 200 }),
        ),
    );

    await expect(gateway().send('EXPO', message)).resolves.toEqual({
      outcome: 'TRANSIENT_FAILURE',
      errorCode: 'EXPO_INVALID_RESPONSE',
    });
  });

  it('bounds an unresponsive Expo provider call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        });
      }),
    );

    await expect(gateway(100).send('EXPO', message)).resolves.toEqual({
      outcome: 'TRANSIENT_FAILURE',
      errorCode: 'EXPO_TIMEOUT',
    });
  });
});

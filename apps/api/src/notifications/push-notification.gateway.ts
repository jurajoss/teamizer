import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getMessaging } from 'firebase-admin/messaging';
import type { PushProvider } from '@prisma/client';

import { getTeamizerFirebaseApp } from '../auth/firebase-app';

export type PushMessage = {
  token: string;
  title: string;
  body: string;
  data: { type: 'MATCH_ATTENDANCE_REMINDER'; matchId: string };
};

export type PushDeliveryResult =
  | { outcome: 'DELIVERED' }
  | { outcome: 'TRANSIENT_FAILURE'; errorCode: string }
  | { outcome: 'INVALID_TOKEN'; errorCode: string };

export interface PushNotificationGateway {
  send(
    provider: PushProvider,
    message: PushMessage,
  ): Promise<PushDeliveryResult>;
}

export const PUSH_NOTIFICATION_GATEWAY = Symbol('PUSH_NOTIFICATION_GATEWAY');

@Injectable()
export class FirebaseExpoPushNotificationGateway implements PushNotificationGateway {
  private readonly firebaseProjectId: string;
  private readonly expoAccessToken: string | undefined;
  private readonly timeoutMs: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.firebaseProjectId = config.getOrThrow('FIREBASE_PROJECT_ID');
    this.expoAccessToken = config.get<string>('EXPO_PUSH_ACCESS_TOKEN');
    this.timeoutMs = config.get<number>('PUSH_PROVIDER_TIMEOUT_MS') ?? 30_000;
  }

  send(
    provider: PushProvider,
    message: PushMessage,
  ): Promise<PushDeliveryResult> {
    return provider === 'EXPO'
      ? this.sendExpo(message)
      : this.sendFirebase(message);
  }

  private async sendExpo(message: PushMessage): Promise<PushDeliveryResult> {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.expoAccessToken
            ? { Authorization: `Bearer ${this.expoAccessToken}` }
            : {}),
        },
        body: JSON.stringify({
          to: message.token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        return {
          outcome: 'TRANSIENT_FAILURE',
          errorCode: `EXPO_HTTP_${response.status}`,
        };
      }
      const payload: unknown = await response.json();
      const ticket = expoTicket(payload);
      if (ticket.status === 'ok') return { outcome: 'DELIVERED' };
      if (ticket.error === 'DeviceNotRegistered') {
        return { outcome: 'INVALID_TOKEN', errorCode: ticket.error };
      }
      return {
        outcome: 'TRANSIENT_FAILURE',
        errorCode: ticket.error ?? 'EXPO_DELIVERY_ERROR',
      };
    } catch (error) {
      return {
        outcome: 'TRANSIENT_FAILURE',
        errorCode:
          error instanceof DOMException && error.name === 'TimeoutError'
            ? 'EXPO_TIMEOUT'
            : 'EXPO_NETWORK_ERROR',
      };
    }
  }

  private async sendFirebase(
    message: PushMessage,
  ): Promise<PushDeliveryResult> {
    try {
      await withTimeout(
        getMessaging(getTeamizerFirebaseApp(this.firebaseProjectId)).send({
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: message.data,
        }),
        this.timeoutMs,
      );
      return { outcome: 'DELIVERED' };
    } catch (error) {
      const code = firebaseErrorCode(error);
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        return { outcome: 'INVALID_TOKEN', errorCode: code };
      }
      return { outcome: 'TRANSIENT_FAILURE', errorCode: code };
    }
  }
}

function expoTicket(payload: unknown): { status: string; error?: string } {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    return { status: 'error', error: 'EXPO_INVALID_RESPONSE' };
  }
  const data = payload.data;
  const ticket = Array.isArray(data) ? data[0] : data;
  if (typeof ticket !== 'object' || ticket === null || !('status' in ticket)) {
    return { status: 'error', error: 'EXPO_INVALID_RESPONSE' };
  }
  const status = String(ticket.status);
  const details = 'details' in ticket ? ticket.details : null;
  const error =
    typeof details === 'object' && details !== null && 'error' in details
      ? String(details.error)
      : undefined;
  return { status, ...(error ? { error } : {}) };
}

function firebaseErrorCode(error: unknown): string {
  if (error instanceof ProviderTimeoutError) return 'FCM_TIMEOUT';
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code).slice(0, 64)
    : 'FCM_DELIVERY_ERROR';
}

class ProviderTimeoutError extends Error {}

async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError()), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

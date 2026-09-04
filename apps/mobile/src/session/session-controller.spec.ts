import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api/authenticated-api-client';
import type { CurrentUser, OnboardingInput } from '../api/contracts';
import type {
  AuthStateListener,
  FirebaseAuthClient,
  FirebaseSessionUser,
} from '../auth/auth-client';
import type { TeamizerIdentityClient } from '../identity/teamizer-identity-client';
import { SessionController, type AppSessionState } from './session-controller';

const currentUser: CurrentUser = {
  user: {
    id: 'b7e72ff0-7ae8-47de-aa2c-d77eefbe02d5',
    role: 'PLAYER',
    notificationsEnabled: true,
    createdAt: '2026-08-28T10:00:00.000Z',
  },
  player: {
    id: '17d13986-b1ab-4ebc-a7b8-ac832e0bdb8b',
    name: 'Gaz',
    type: 'REGULAR',
    status: 'ACTIVE',
    avatarUrl: null,
  },
};

const onboardingInput: OnboardingInput = {
  name: 'Gaz',
  attributes: {
    speed: 5,
    endurance: 5,
    defense: 5,
    attack: 5,
    technique: 5,
  },
};

class FakeAuthClient implements FirebaseAuthClient {
  private listener: AuthStateListener | null = null;
  readonly signIn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  readonly signOut = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  readonly getIdToken = vi
    .fn<() => Promise<string>>()
    .mockResolvedValue('token');

  observeAuthState(listener: AuthStateListener): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  emit(user: FirebaseSessionUser | null): void {
    this.listener?.(user);
  }
}

function createIdentityClient(): TeamizerIdentityClient {
  return {
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    onboard: vi.fn().mockResolvedValue(currentUser),
    clear: vi.fn(),
  };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SessionController', () => {
  it('remains restoring until Firebase reports the restored auth state', () => {
    const controller = new SessionController(
      new FakeAuthClient(),
      createIdentityClient(),
    );

    controller.start();

    expect(controller.currentState).toEqual({ status: 'RESTORING' });
  });

  it('enters signed-out state and delegates email/password sign-in', async () => {
    const authClient = new FakeAuthClient();
    const controller = new SessionController(
      authClient,
      createIdentityClient(),
    );
    controller.start();

    authClient.emit(null);
    await controller.signIn('person@example.test', 'password');

    expect(controller.currentState).toEqual({ status: 'SIGNED_OUT' });
    expect(authClient.signIn).toHaveBeenCalledWith(
      'person@example.test',
      'password',
    );
  });

  it('checks Teamizer identity and exposes the Firebase UID after restoration', async () => {
    const authClient = new FakeAuthClient();
    const identityClient = createIdentityClient();
    const controller = new SessionController(authClient, identityClient);
    const states: AppSessionState[] = [];
    controller.subscribe((state) => states.push(state));
    controller.start();

    authClient.emit({ uid: 'firebase-uid' });
    expect(controller.currentState).toEqual({
      status: 'CHECKING_IDENTITY',
      firebaseUid: 'firebase-uid',
    });
    await settle();

    expect(identityClient.getCurrentUser).toHaveBeenCalledWith('firebase-uid');
    expect(controller.currentState).toEqual({
      status: 'AUTHENTICATED',
      firebaseUid: 'firebase-uid',
      currentUser,
    });
    expect(states.map((state) => state.status)).toEqual([
      'RESTORING',
      'CHECKING_IDENTITY',
      'AUTHENTICATED',
    ]);
  });

  it('routes an authenticated Firebase identity without a User to onboarding', async () => {
    const authClient = new FakeAuthClient();
    const identityClient = createIdentityClient();
    vi.mocked(identityClient.getCurrentUser).mockRejectedValue(
      new ApiClientError(403, 'ONBOARDING_REQUIRED', 'Onboarding required.'),
    );
    const controller = new SessionController(authClient, identityClient);
    controller.start();

    authClient.emit({ uid: 'firebase-uid' });
    await settle();

    expect(controller.currentState).toEqual({
      status: 'ONBOARDING_REQUIRED',
      firebaseUid: 'firebase-uid',
    });
  });

  it('enters the app after onboarding completes and /me is refreshed by the identity client', async () => {
    const authClient = new FakeAuthClient();
    const identityClient = createIdentityClient();
    vi.mocked(identityClient.getCurrentUser).mockRejectedValue(
      new ApiClientError(403, 'ONBOARDING_REQUIRED', 'Onboarding required.'),
    );
    const controller = new SessionController(authClient, identityClient);
    controller.start();
    authClient.emit({ uid: 'firebase-uid' });
    await settle();

    await controller.onboard(onboardingInput);

    expect(identityClient.onboard).toHaveBeenCalledWith(
      'firebase-uid',
      onboardingInput,
    );
    expect(controller.currentState).toEqual({
      status: 'AUTHENTICATED',
      firebaseUid: 'firebase-uid',
      currentUser,
    });
  });

  it('exposes backend and onboarding errors as recoverable states', async () => {
    const authClient = new FakeAuthClient();
    const identityClient = createIdentityClient();
    vi.mocked(identityClient.getCurrentUser).mockRejectedValue(
      new Error('backend unavailable'),
    );
    const controller = new SessionController(authClient, identityClient);
    controller.start();
    authClient.emit({ uid: 'firebase-uid' });
    await settle();

    expect(controller.currentState).toMatchObject({
      status: 'ERROR',
      phase: 'BOOTSTRAP',
    });
    vi.mocked(identityClient.getCurrentUser).mockResolvedValue(currentUser);
    controller.retry();
    await settle();
    expect(controller.currentState.status).toBe('AUTHENTICATED');

    vi.mocked(identityClient.getCurrentUser).mockRejectedValue(
      new ApiClientError(403, 'ONBOARDING_REQUIRED', 'Onboarding required.'),
    );
    authClient.emit({ uid: 'another-uid' });
    await settle();
    vi.mocked(identityClient.onboard).mockRejectedValue(
      new ApiClientError(503, 'NETWORK_ERROR', 'Try again.'),
    );
    await expect(controller.onboard(onboardingInput)).rejects.toBeDefined();
    expect(controller.currentState).toMatchObject({
      status: 'ERROR',
      phase: 'ONBOARDING',
      message: 'Try again.',
    });
    controller.retry();
    expect(controller.currentState.status).toBe('ONBOARDING_REQUIRED');
  });

  it('delegates sign-out and clears identity when Firebase reports signed out', async () => {
    const authClient = new FakeAuthClient();
    const identityClient = createIdentityClient();
    const controller = new SessionController(authClient, identityClient);
    controller.start();
    authClient.emit({ uid: 'firebase-uid' });
    await settle();

    await controller.signOut();
    authClient.emit(null);

    expect(authClient.signOut).toHaveBeenCalledOnce();
    expect(identityClient.clear).toHaveBeenCalledWith('firebase-uid');
    expect(controller.currentState).toEqual({ status: 'SIGNED_OUT' });
  });

  it('refreshes the authenticated profile in place after a profile mutation', async () => {
    const authClient = new FakeAuthClient();
    const identityClient = createIdentityClient();
    const refreshed = {
      ...currentUser,
      player: {
        ...currentUser.player,
        name: 'Updated Gaz',
        avatarUrl: 'https://avatars.example.test/gaz.jpg',
      },
    };
    const controller = new SessionController(authClient, identityClient);
    controller.start();
    authClient.emit({ uid: 'firebase-uid' });
    await settle();
    vi.mocked(identityClient.getCurrentUser).mockResolvedValue(refreshed);

    await controller.refreshCurrentUser();

    expect(identityClient.getCurrentUser).toHaveBeenLastCalledWith(
      'firebase-uid',
    );
    expect(controller.currentState).toEqual({
      status: 'AUTHENTICATED',
      firebaseUid: 'firebase-uid',
      currentUser: refreshed,
    });
  });
});

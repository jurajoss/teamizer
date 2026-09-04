import type { Auth, User } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/auth', () => firebaseMocks);

import { FirebaseSessionRequiredError } from './auth-client';
import { createFirebaseAuthAdapter } from './firebase-auth-adapter';

describe('Firebase auth adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the current ID token from Firebase instead of storing a token', async () => {
    const getIdToken = vi.fn().mockResolvedValue('current-id-token');
    const auth = { currentUser: { getIdToken } } as unknown as Auth;
    const client = createFirebaseAuthAdapter(auth);

    await expect(client.getIdToken()).resolves.toBe('current-id-token');
    expect(getIdToken).toHaveBeenCalledOnce();
  });

  it('rejects token access when Firebase has no authenticated user', async () => {
    const client = createFirebaseAuthAdapter({
      currentUser: null,
    } as unknown as Auth);

    await expect(client.getIdToken()).rejects.toBeInstanceOf(
      FirebaseSessionRequiredError,
    );
  });

  it('delegates email/password sign-in and sign-out to Firebase', async () => {
    firebaseMocks.signInWithEmailAndPassword.mockResolvedValue(undefined);
    firebaseMocks.signOut.mockResolvedValue(undefined);
    const auth = { currentUser: null } as unknown as Auth;
    const client = createFirebaseAuthAdapter(auth);

    await client.signIn(' person@example.test ', 'password');
    await client.signOut();

    expect(firebaseMocks.signInWithEmailAndPassword).toHaveBeenCalledWith(
      auth,
      'person@example.test',
      'password',
    );
    expect(firebaseMocks.signOut).toHaveBeenCalledWith(auth);
  });

  it('maps restored Firebase users to the public session UID', () => {
    const unsubscribe = vi.fn();
    firebaseMocks.onAuthStateChanged.mockImplementation(
      (_auth: Auth, listener: (user: User | null) => void) => {
        listener({ uid: 'firebase-uid' } as User);
        return unsubscribe;
      },
    );
    const listener = vi.fn();
    const client = createFirebaseAuthAdapter({} as Auth);

    const stop = client.observeAuthState(listener);
    stop();

    expect(listener).toHaveBeenCalledWith({ uid: 'firebase-uid' });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

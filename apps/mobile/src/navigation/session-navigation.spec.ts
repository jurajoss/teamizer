import { describe, expect, it } from 'vitest';

import type { CurrentUser } from '../api/contracts';
import {
  destinationForSession,
  mayAccessProtectedRoutes,
} from './session-navigation';

const currentUser = {} as CurrentUser;

describe('session navigation', () => {
  it('never exposes protected routes while restoring or checking identity', () => {
    expect(mayAccessProtectedRoutes({ status: 'RESTORING' })).toBe(false);
    expect(
      mayAccessProtectedRoutes({
        status: 'CHECKING_IDENTITY',
        firebaseUid: 'firebase-uid',
      }),
    ).toBe(false);
    expect(destinationForSession({ status: 'RESTORING' })).toBeNull();
    expect(
      destinationForSession({
        status: 'CHECKING_IDENTITY',
        firebaseUid: 'firebase-uid',
      }),
    ).toBeNull();
  });

  it('redirects signed-out and onboarding states away from protected routes', () => {
    expect(destinationForSession({ status: 'SIGNED_OUT' })).toBe('/sign-in');
    expect(
      destinationForSession({
        status: 'ONBOARDING_REQUIRED',
        firebaseUid: 'firebase-uid',
      }),
    ).toBe('/onboarding');
    expect(mayAccessProtectedRoutes({ status: 'SIGNED_OUT' })).toBe(false);
  });

  it('allows only a fully authenticated Teamizer User into the app', () => {
    const state = {
      status: 'AUTHENTICATED' as const,
      firebaseUid: 'firebase-uid',
      currentUser,
    };

    expect(mayAccessProtectedRoutes(state)).toBe(true);
    expect(destinationForSession(state)).toBe('/home');
  });
});

import type { AppSessionState } from '../session/session-controller';

export type SessionDestination = '/sign-in' | '/onboarding' | '/home';

export function destinationForSession(
  state: AppSessionState,
): SessionDestination | null {
  switch (state.status) {
    case 'SIGNED_OUT':
      return '/sign-in';
    case 'ONBOARDING_REQUIRED':
      return '/onboarding';
    case 'AUTHENTICATED':
      return '/home';
    case 'ERROR':
      return state.phase === 'ONBOARDING' ? '/onboarding' : null;
    case 'RESTORING':
    case 'CHECKING_IDENTITY':
      return null;
  }
}

export function mayAccessProtectedRoutes(state: AppSessionState): boolean {
  return state.status === 'AUTHENTICATED';
}

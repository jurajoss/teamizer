import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { OnboardingInput } from '../api/contracts';
import type { FirebaseAuthClient } from '../auth/auth-client';
import type { TeamizerIdentityClient } from '../identity/teamizer-identity-client';
import { SessionController, type AppSessionState } from './session-controller';

type SessionContextValue = {
  state: AppSessionState;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  onboard(input: OnboardingInput): Promise<void>;
  refreshCurrentUser(): Promise<void>;
  retry(): void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({
  authClient,
  identityClient,
  beforeSignOut,
  children,
}: {
  authClient: FirebaseAuthClient;
  identityClient: TeamizerIdentityClient;
  beforeSignOut?: () => Promise<void>;
  children: ReactNode;
}) {
  const controller = useMemo(
    () => new SessionController(authClient, identityClient),
    [authClient, identityClient],
  );
  const [state, setState] = useState<AppSessionState>(controller.currentState);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    controller.start();

    return () => {
      unsubscribe();
      controller.stop();
    };
  }, [controller]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      signIn: (email, password) => controller.signIn(email, password),
      signOut: async () => {
        try {
          await beforeSignOut?.();
        } finally {
          await controller.signOut();
        }
      },
      onboard: (input) => controller.onboard(input),
      refreshCurrentUser: () => controller.refreshCurrentUser(),
      retry: () => controller.retry(),
    }),
    [beforeSignOut, controller, state],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within SessionProvider.');
  }

  return context;
}

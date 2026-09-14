import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { FirebaseAuthClient } from '../auth/auth-client';
import { createFirebaseAuthClient } from '../auth/firebase-auth-client';
import {
  loadMobileEnvironment,
  type MobileEnvironment,
} from '../config/environment';
import {
  QueryTeamizerIdentityClient,
  type TeamizerIdentityClient,
} from '../identity/teamizer-identity-client';
import { NotificationLifecycle } from '../notifications/notification-lifecycle';
import { createNotificationPlatform } from '../notifications/notification-platform';
import { NotificationRegistration } from '../notifications/notification-registration';
import { PreferencesProvider } from '../preferences/preferences-context';
import { SessionProvider } from '../session/session-context';
import { SqliteScoringDraftRepository } from '../scoring/sqlite-scoring-draft-repository';
import { FoundationScreen } from '../ui/foundation-screen';
import { AppServicesProvider, type AppServices } from './app-services-context';

type ApplicationDependencies = {
  authClient: FirebaseAuthClient;
  identityClient: TeamizerIdentityClient;
  queryClient: QueryClient;
  services: AppServices;
};

type ProviderState =
  | { status: 'STARTING' }
  | { status: 'READY'; dependencies: ApplicationDependencies }
  | { status: 'ERROR' };

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider storage={AsyncStorage}>
      <ConfiguredAppProviders>{children}</ConfiguredAppProviders>
    </PreferencesProvider>
  );
}

function ConfiguredAppProviders({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<ProviderState>({ status: 'STARTING' });

  useEffect(() => {
    let active = true;

    void Promise.resolve().then(() => {
      if (!active) {
        return;
      }

      try {
        setState({
          status: 'READY',
          dependencies: createDependencies(loadMobileEnvironment()),
        });
      } catch {
        setState({ status: 'ERROR' });
      }
    });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'STARTING') {
    return <FoundationScreen message={t('foundation.starting')} />;
  }

  if (state.status === 'ERROR') {
    return (
      <FoundationScreen
        title={t('foundation.configTitle')}
        message={t('foundation.configError')}
      />
    );
  }

  const { authClient, identityClient, queryClient, services } =
    state.dependencies;

  return (
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={services}>
        <SessionProvider
          authClient={authClient}
          identityClient={identityClient}
          beforeSignOut={() =>
            services.notificationRegistration.unregisterCurrentDevice()
          }
        >
          <NotificationLifecycle />
          {children}
        </SessionProvider>
      </AppServicesProvider>
    </QueryClientProvider>
  );
}

function createDependencies(
  environment: MobileEnvironment,
): ApplicationDependencies {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const authClient = createFirebaseAuthClient(environment.firebase);
  const apiClient = new AuthenticatedApiClient(environment.apiUrl, authClient);
  const scoringDraftRepository = new SqliteScoringDraftRepository();
  const notificationRegistration = new NotificationRegistration(
    apiClient,
    createNotificationPlatform(),
    AsyncStorage,
    environment.easProjectId,
  );

  return {
    authClient,
    queryClient,
    identityClient: new QueryTeamizerIdentityClient(queryClient, apiClient),
    services: {
      apiClient,
      notificationRegistration,
      scoringDraftRepository,
    },
  };
}

import { createContext, useContext, type ReactNode } from 'react';

import type { AuthenticatedApiClient } from '../api/authenticated-api-client';
import type { NotificationRegistration } from '../notifications/notification-registration';
import type { ScoringDraftRepository } from '../scoring/scoring-draft-repository';

export type AppServices = {
  apiClient: AuthenticatedApiClient;
  notificationRegistration: NotificationRegistration;
  scoringDraftRepository: ScoringDraftRepository;
};

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return (
    <AppServicesContext.Provider value={services}>
      {children}
    </AppServicesContext.Provider>
  );
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);

  if (!services) {
    throw new Error('useAppServices must be used within AppServicesProvider.');
  }

  return services;
}

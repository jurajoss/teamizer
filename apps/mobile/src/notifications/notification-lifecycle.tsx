import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAppServices } from '../providers/app-services-context';
import { useSession } from '../session/session-context';

export function NotificationLifecycle() {
  const router = useRouter();
  const { notificationRegistration } = useAppServices();
  const { state } = useSession();

  useEffect(() => {
    if (state.status === 'AUTHENTICATED') {
      void notificationRegistration.register(state.currentUser.user.id);
    }
  }, [notificationRegistration, state]);

  useEffect(
    () =>
      notificationRegistration.subscribeToMatchResponses((matchId) => {
        router.push({ pathname: '/matches/[matchId]', params: { matchId } });
      }),
    [notificationRegistration, router],
  );

  return null;
}

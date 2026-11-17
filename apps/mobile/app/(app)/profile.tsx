import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useSession } from '../../src/session/session-context';
import { playerRouteFor } from '../../src/statistics/statistics';
import { FoundationScreen } from '../../src/ui/foundation-screen';

export default function ProfileRoute() {
  const { t } = useTranslation();
  const { state } = useSession();

  if (state.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message={t('auth.restoring')} />;
  }
  return <Redirect href={playerRouteFor(state.currentUser.player.id)} />;
}

import { Redirect, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  Button,
  FeedbackBanner,
  spacing,
} from '@teamizer/ui';

import { destinationForSession } from '../src/navigation/session-navigation';
import { useSession } from '../src/session/session-context';
import { AppScreen } from '../src/ui/app-screen';
import { FoundationScreen } from '../src/ui/foundation-screen';

export default function SessionEntryScreen() {
  const { state, retry, signOut } = useSession();
  const destination = destinationForSession(state);

  if (destination) {
    return <Redirect href={destination as Href} />;
  }

  if (state.status !== 'ERROR') {
    return (
      <FoundationScreen
        busy
        message={
          state.status === 'RESTORING'
            ? 'Restoring your secure session…'
            : 'Checking your Teamizer profile…'
        }
      />
    );
  }

  return (
    <AppScreen centered contentStyle={styles.screen}>
      <BrandLockup />
      <View style={styles.copy}>
        <AppText accessibilityRole="header" variant="title">
          Let’s get you back in
        </AppText>
        <AppText tone="muted">
          Your session is still safe. Teamizer just needs to check your account
          again.
        </AppText>
      </View>
      <FeedbackBanner
        tone="error"
        title="Unable to continue"
        message={state.message}
      />
      <View style={styles.actions}>
        <Button
          label="Try again"
          onPress={retry}
          testID="session-retry-button"
        />
        <Button
          label="Sign out"
          onPress={() => void signOut().catch(() => undefined)}
          variant="secondary"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.xxl,
    maxWidth: 460,
  },
  copy: {
    gap: spacing.xs,
  },
  actions: { gap: spacing.sm },
});

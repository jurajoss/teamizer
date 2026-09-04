import { Redirect, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  Button,
  FeedbackBanner,
  layout,
  spacing,
  TextField,
} from '@teamizer/ui';

import { destinationForSession } from '../src/navigation/session-navigation';
import { useSession } from '../src/session/session-context';
import { AppScreen } from '../src/ui/app-screen';
import { FoundationScreen } from '../src/ui/foundation-screen';

export default function SignInScreen() {
  const { state, signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (state.status === 'RESTORING' || state.status === 'CHECKING_IDENTITY') {
    return <FoundationScreen busy message="Restoring your session…" />;
  }

  if (state.status !== 'SIGNED_OUT') {
    const destination = destinationForSession(state) ?? '/';
    return <Redirect href={destination as Href} />;
  }

  const submit = async () => {
    if (!email.trim() || !password) {
      setMessage('Enter both your email and password.');
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await signIn(email, password);
    } catch {
      setMessage(
        'Sign-in failed. Check your email and password, then try again.',
      );
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <AppScreen centered scroll contentStyle={styles.content}>
        <View style={styles.form}>
          <View style={styles.intro}>
            <BrandLockup />
            <View style={styles.headline}>
              <AppText accessibilityRole="header" variant="display">
                Your game, better balanced.
              </AppText>
              <AppText tone="muted">
                Sign in to organize teams and keep every match moving.
              </AppText>
            </View>
          </View>
          <View style={styles.fields}>
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              editable={!submitting}
              inputMode="email"
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              placeholder="you@example.com"
              returnKeyType="next"
              value={email}
            />
            <TextField
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!submitting}
              label="Password"
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              placeholder="Enter your password"
              returnKeyType="go"
              secureTextEntry
              value={password}
            />
          </View>
          {message ? <FeedbackBanner tone="error" message={message} /> : null}
          <Button
            busy={submitting}
            label={submitting ? 'Signing in…' : 'Sign in'}
            onPress={() => void submit()}
          />
          <AppText style={styles.footnote} variant="caption" tone="subtle">
            Use the email linked to your Teamizer account.
          </AppText>
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
  },
  form: {
    alignSelf: 'center',
    gap: spacing.xl,
    maxWidth: layout.formMaxWidth,
    width: '100%',
  },
  intro: {
    gap: spacing.xxl,
  },
  headline: {
    gap: spacing.sm,
  },
  fields: { gap: spacing.lg },
  footnote: { textAlign: 'center' },
});

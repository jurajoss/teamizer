import { Redirect, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  Button,
  colors,
  FeedbackBanner,
  layout,
  NumberStepper,
  spacing,
  Surface,
  TextField,
} from '@teamizer/ui';

import {
  onboardingInputSchema,
  type OnboardingInput,
} from '../src/api/contracts';
import { destinationForSession } from '../src/navigation/session-navigation';
import { useSession } from '../src/session/session-context';
import { AppScreen } from '../src/ui/app-screen';
import { FoundationScreen } from '../src/ui/foundation-screen';

type AttributeName = keyof OnboardingInput['attributes'];

const attributeFields: ReadonlyArray<{
  name: AttributeName;
  label: string;
}> = [
  { name: 'speed', label: 'Speed' },
  { name: 'endurance', label: 'Endurance' },
  { name: 'defense', label: 'Defense' },
  { name: 'attack', label: 'Attack' },
  { name: 'technique', label: 'Technique' },
];

const initialAttributes: Record<AttributeName, number> = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

export default function OnboardingScreen() {
  const { state, onboard, signOut } = useSession();
  const [name, setName] = useState('');
  const [attributes, setAttributes] = useState(initialAttributes);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signOutMessage, setSignOutMessage] = useState<string | null>(null);

  if (state.status === 'RESTORING' || state.status === 'CHECKING_IDENTITY') {
    return <FoundationScreen busy message="Checking your Teamizer profile…" />;
  }

  const isOnboardingError =
    state.status === 'ERROR' && state.phase === 'ONBOARDING';

  if (state.status !== 'ONBOARDING_REQUIRED' && !isOnboardingError) {
    const destination = destinationForSession(state) ?? '/';
    return <Redirect href={destination as Href} />;
  }

  const setAttribute = (attribute: AttributeName, value: number) => {
    setAttributes((current) => ({ ...current, [attribute]: value }));
    setMessage(null);
  };

  const submit = async () => {
    const parsedInput = onboardingInputSchema.safeParse({
      name,
      attributes,
    });

    if (!parsedInput.success) {
      setMessage('Enter a name and rate every attribute from 1 to 10.');
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await onboard(parsedInput.data);
    } catch {
      setSubmitting(false);
    }
  };

  const submitSignOut = async () => {
    setSigningOut(true);
    setSignOutMessage(null);

    try {
      await signOut();
    } catch {
      setSignOutMessage('Sign-out failed. Try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <AppScreen scroll contentStyle={styles.content}>
        <View style={styles.page}>
          <View style={styles.topBar}>
            <BrandLockup compact />
            <Button
              busy={signingOut}
              disabled={submitting}
              fullWidth={false}
              label="Sign out"
              onPress={() => void submitSignOut()}
              variant="ghost"
            />
          </View>

          <View style={styles.intro}>
            <AppText accessibilityRole="header" variant="title">
              Set up your player
            </AppText>
            <AppText tone="muted">
              Add the name teammates know you by, then give Teamizer a starting
              point for balanced teams.
            </AppText>
          </View>

          <TextField
            autoCapitalize="words"
            editable={!submitting}
            label="Player name"
            maxLength={120}
            onChangeText={(value) => {
              setName(value);
              setMessage(null);
            }}
            placeholder="Your name"
            returnKeyType="done"
            value={name}
          />

          <FeedbackBanner
            tone="info"
            message="These starting ratings are used for team balancing. They are not shown in your normal player profile."
          />

          <View style={styles.ratingSection}>
            <View style={styles.sectionHeading}>
              <AppText variant="heading">Your starting ratings</AppText>
              <AppText variant="caption" tone="muted">
                Choose from 1 to 10. Five is a good neutral starting point.
              </AppText>
            </View>
            <Surface padding="medium">
              {attributeFields.map(({ name: attribute, label }, index) => (
                <View
                  key={attribute}
                  style={
                    index < attributeFields.length - 1
                      ? styles.ratingDivider
                      : undefined
                  }
                >
                  <NumberStepper
                    disabled={submitting}
                    label={label}
                    maximum={10}
                    minimum={1}
                    onChange={(value) => setAttribute(attribute, value)}
                    value={attributes[attribute]}
                  />
                </View>
              ))}
            </Surface>
          </View>

          {message ? <FeedbackBanner tone="error" message={message} /> : null}
          {isOnboardingError ? (
            <FeedbackBanner
              tone="error"
              title="Profile wasn’t created"
              message={state.message}
            />
          ) : null}
          {signOutMessage ? (
            <FeedbackBanner tone="error" message={signOutMessage} />
          ) : null}

          <Button
            busy={submitting}
            disabled={signingOut}
            label={submitting ? 'Creating profile…' : 'Create profile'}
            onPress={() => void submit()}
          />
          <AppText style={styles.privacyNote} variant="caption" tone="subtle">
            This creates your personal Teamizer player profile.
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
  },
  page: {
    alignSelf: 'center',
    gap: spacing.xl,
    maxWidth: layout.formMaxWidth,
    width: '100%',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  intro: {
    gap: spacing.xs,
  },
  ratingSection: {
    gap: spacing.sm,
  },
  sectionHeading: {
    gap: spacing.xxs,
  },
  ratingDivider: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
  },
  privacyNote: {
    textAlign: 'center',
  },
});

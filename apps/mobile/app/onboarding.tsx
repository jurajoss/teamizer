import { Redirect, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  BrandLockup,
  Button,
  FeedbackBanner,
  layout,
  NumberStepper,
  spacing,
  Surface,
  TextField,
  useTheme,
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

const attributeNames: ReadonlyArray<AttributeName> = [
  'speed',
  'endurance',
  'defense',
  'attack',
  'technique',
];

const initialAttributes: Record<AttributeName, number> = {
  speed: 5,
  endurance: 5,
  defense: 5,
  attack: 5,
  technique: 5,
};

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state, onboard, signOut } = useSession();
  const [name, setName] = useState('');
  const [attributes, setAttributes] = useState(initialAttributes);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signOutMessage, setSignOutMessage] = useState<string | null>(null);

  if (state.status === 'RESTORING' || state.status === 'CHECKING_IDENTITY') {
    return <FoundationScreen busy message={t('auth.checking')} />;
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
      setMessage(t('onboarding.validation'));
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
      setSignOutMessage(t('account.signOutFailed'));
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
              label={t('common.signOut')}
              onPress={() => void submitSignOut()}
              variant="ghost"
            />
          </View>

          <View style={styles.intro}>
            <AppText accessibilityRole="header" variant="title">
              {t('onboarding.title')}
            </AppText>
            <AppText tone="muted">{t('onboarding.intro')}</AppText>
          </View>

          <TextField
            autoCapitalize="words"
            editable={!submitting}
            label={t('onboarding.playerName')}
            maxLength={120}
            onChangeText={(value) => {
              setName(value);
              setMessage(null);
            }}
            placeholder={t('onboarding.namePlaceholder')}
            returnKeyType="done"
            value={name}
          />

          <FeedbackBanner tone="info" message={t('onboarding.privacy')} />

          <View style={styles.ratingSection}>
            <View style={styles.sectionHeading}>
              <AppText variant="heading">{t('onboarding.ratings')}</AppText>
              <AppText variant="caption" tone="muted">
                {t('onboarding.ratingsHint')}
              </AppText>
            </View>
            <Surface padding="medium">
              {attributeNames.map((attribute, index) => {
                const label = t(`attributes.${attribute}`);
                return (
                  <View
                    key={attribute}
                    style={
                      index < attributeNames.length - 1
                        ? [
                            styles.ratingDivider,
                            { borderBottomColor: colors.border },
                          ]
                        : undefined
                    }
                  >
                    <NumberStepper
                      decreaseLabel={t('attributes.decrease', { label })}
                      disabled={submitting}
                      increaseLabel={t('attributes.increase', { label })}
                      label={label}
                      maximum={10}
                      minimum={1}
                      onChange={(value) => setAttribute(attribute, value)}
                      value={attributes[attribute]}
                      valueLabel={t('attributes.value', {
                        label,
                        value: attributes[attribute],
                        maximum: 10,
                      })}
                    />
                  </View>
                );
              })}
            </Surface>
          </View>

          {message ? <FeedbackBanner tone="error" message={message} /> : null}
          {isOnboardingError ? (
            <FeedbackBanner
              tone="error"
              title={t('onboarding.failed')}
              message={t('errors.generic')}
            />
          ) : null}
          {signOutMessage ? (
            <FeedbackBanner tone="error" message={signOutMessage} />
          ) : null}

          <Button
            busy={submitting}
            disabled={signingOut}
            label={
              submitting ? t('onboarding.creating') : t('onboarding.create')
            }
            onPress={() => void submit()}
          />
          <AppText style={styles.privacyNote} variant="caption" tone="subtle">
            {t('onboarding.footnote')}
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
    borderBottomWidth: 1,
  },
  privacyNote: {
    textAlign: 'center',
  },
});

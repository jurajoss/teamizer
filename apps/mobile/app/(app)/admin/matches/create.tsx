import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  Button,
  FeedbackBanner,
  layout,
  spacing,
  StatusPill,
  Surface,
  TextField,
} from '@teamizer/ui';

import { ApiClientError } from '../../../../src/api/authenticated-api-client';
import {
  canAccessMatchAdministration,
  canSubmitManualMatch,
  createDefaultManualMatchDraft,
  formatLocalDateForApi,
  formatLocalTimeForApi,
  runSingleSubmission,
  validateManualMatchDraft,
  type ManualMatchDraft,
  type ManualMatchValidation,
} from '../../../../src/matches/admin-match-management';
import { adminMatchQueryKeys } from '../../../../src/matches/admin-match-query-keys';
import { refreshUpcomingMatchesAfterCreation } from '../../../../src/matches/admin-match-query-keys';
import { matchRouteFor } from '../../../../src/matches/match-flow';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';
import { DateTimeField } from '../../../../src/ui/date-time-field';

export default function CreateManualMatchRoute() {
  const { state } = useSession();
  const { apiClient } = useAppServices();
  const queryClient = useQueryClient();
  const submissionGate = useRef(false);
  const [draft, setDraft] = useState<ManualMatchDraft>(() =>
    createDefaultManualMatchDraft(),
  );
  const [validation, setValidation] = useState<ManualMatchValidation>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const sportsQuery = useQuery({
    queryKey: adminMatchQueryKeys.sports,
    queryFn: () => apiClient.getAdminSports(),
    enabled:
      state.status === 'AUTHENTICATED' &&
      canAccessMatchAdministration(state.currentUser.user.role),
  });
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.createManualMatch>[0]) =>
      apiClient.createManualMatch(input),
  });

  if (
    state.status !== 'AUTHENTICATED' ||
    !canAccessMatchAdministration(state.currentUser.user.role)
  ) {
    return <Redirect href="/home" />;
  }

  const submit = async () => {
    await runSingleSubmission(submissionGate, async () => {
      const nextValidation = validateManualMatchDraft(draft);
      setValidation(nextValidation);
      setErrorMessage(null);
      if (
        Object.keys(nextValidation).length > 0 ||
        !draft.localDate ||
        !draft.localStartTime
      ) {
        return;
      }

      try {
        const match = await createMutation.mutateAsync({
          sportId: draft.sportId,
          localDate: formatLocalDateForApi(draft.localDate),
          localStartTime: formatLocalTimeForApi(draft.localStartTime),
          location: draft.location.trim() || null,
        });
        await refreshUpcomingMatchesAfterCreation(queryClient);
        router.replace(matchRouteFor(match.id));
      } catch (error) {
        setErrorMessage(
          error instanceof ApiClientError
            ? error.message
            : 'The Match could not be created. Try again.',
        );
      }
    });
  };

  return (
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          fullWidth={false}
          label="Back"
          onPress={() => router.back()}
          variant="ghost"
        />
      </View>
      <View style={styles.heading}>
        <StatusPill label="ONE-OFF MATCH" tone="info" />
        <AppText accessibilityRole="header" variant="title">
          Create Match
        </AppText>
        <AppText tone="muted">
          Registration opens as soon as the Match is created. Teams and
          participants stay empty until the normal Match flow is used.
        </AppText>
      </View>

      <View style={styles.form}>
        {sportsQuery.isPending ? (
          <Surface tone="muted" style={styles.stateCard}>
            <AppText variant="heading">Loading Sports…</AppText>
          </Surface>
        ) : null}
        {sportsQuery.isError ? (
          <View style={styles.stateCard}>
            <FeedbackBanner
              tone="error"
              title="Sports unavailable"
              message="Check your connection and try again."
            />
            <Button
              label="Try again"
              onPress={() => void sportsQuery.refetch()}
              variant="secondary"
            />
          </View>
        ) : null}
        {sportsQuery.data?.length === 0 ? (
          <FeedbackBanner
            tone="warning"
            title="No supported Sport"
            message="Bootstrap the default Football Sport before creating a Match."
          />
        ) : null}
        {sportsQuery.data && sportsQuery.data.length > 0 ? (
          <Surface style={styles.section}>
            <AppText variant="heading">Sport</AppText>
            <View style={styles.choiceRow}>
              {sportsQuery.data.map((sport) => (
                <Button
                  fullWidth={false}
                  key={sport.id}
                  label={sport.name}
                  onPress={() => {
                    setDraft((current) => ({ ...current, sportId: sport.id }));
                    setValidation((current) => {
                      const next = { ...current };
                      delete next.sportId;
                      return next;
                    });
                  }}
                  variant={draft.sportId === sport.id ? 'primary' : 'secondary'}
                />
              ))}
            </View>
            {validation.sportId ? (
              <AppText variant="caption" tone="error">
                {validation.sportId}
              </AppText>
            ) : null}
          </Surface>
        ) : null}

        <Surface style={styles.section}>
          <AppText variant="heading">When</AppText>
          <DateTimeField
            error={validation.localDate}
            label="Date"
            minimumDate={new Date()}
            mode="date"
            onChange={(localDate) =>
              setDraft((current) => ({ ...current, localDate }))
            }
            value={draft.localDate}
          />
          <DateTimeField
            error={validation.localStartTime}
            hint="Interpreted in Europe/Prague. DST edge times are validated by the API."
            label="Local start time"
            mode="time"
            onChange={(localStartTime) =>
              setDraft((current) => ({ ...current, localStartTime }))
            }
            value={draft.localStartTime}
          />
        </Surface>

        <Surface style={styles.section}>
          <AppText variant="heading">Where</AppText>
          <TextField
            error={validation.location ?? null}
            label="Location (optional)"
            maxLength={255}
            onChangeText={(location) =>
              setDraft((current) => ({ ...current, location }))
            }
            placeholder="e.g. Pitch A"
            value={draft.location}
          />
        </Surface>

        {errorMessage ? (
          <FeedbackBanner
            tone="error"
            title="Match not created"
            message={errorMessage}
          />
        ) : null}
        <Button
          busy={createMutation.isPending}
          disabled={
            !canSubmitManualMatch(draft, createMutation.isPending) ||
            !sportsQuery.data?.length
          }
          label="Create Match"
          onPress={() => void submit()}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xxl },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: { gap: spacing.sm, marginTop: spacing.lg, maxWidth: 620 },
  form: { gap: spacing.lg, maxWidth: layout.formMaxWidth, width: '100%' },
  section: { gap: spacing.md },
  stateCard: { gap: spacing.md },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

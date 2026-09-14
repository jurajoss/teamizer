import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Button,
  FeedbackBanner,
  layout,
  spacing,
  Surface,
  TextField,
} from '@teamizer/ui';

import { localizedErrorMessage } from '../../../../src/i18n/localized-error';
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
  const { t } = useTranslation();
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
      const rawValidation = validateManualMatchDraft(draft);
      const nextValidation: ManualMatchValidation = {
        ...(rawValidation.sportId
          ? { sportId: t('validation.chooseSport') }
          : {}),
        ...(rawValidation.localDate
          ? { localDate: t('validation.chooseDate') }
          : {}),
        ...(rawValidation.localStartTime
          ? { localStartTime: t('validation.chooseTime') }
          : {}),
        ...(rawValidation.location
          ? { location: t('validation.locationLength') }
          : {}),
      };
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
        setErrorMessage(localizedErrorMessage(error, t, 'createMatch.failed'));
      }
    });
  };

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <AppText tone="muted">{t('createMatch.intro')}</AppText>

      <View style={styles.form}>
        {sportsQuery.isPending ? (
          <Surface tone="muted" style={styles.stateCard}>
            <AppText variant="heading">
              {t('createMatch.loadingSports')}
            </AppText>
          </Surface>
        ) : null}
        {sportsQuery.isError ? (
          <View style={styles.stateCard}>
            <FeedbackBanner
              tone="error"
              title={t('createMatch.sportsUnavailable')}
              message={t('common.connectionRetry')}
            />
            <Button
              label={t('common.retry')}
              onPress={() => void sportsQuery.refetch()}
              variant="secondary"
            />
          </View>
        ) : null}
        {sportsQuery.data?.length === 0 ? (
          <FeedbackBanner
            tone="warning"
            title={t('createMatch.noSport')}
            message={t('createMatch.noSportHint')}
          />
        ) : null}
        {sportsQuery.data && sportsQuery.data.length > 0 ? (
          <Surface style={styles.section}>
            <AppText variant="heading">{t('createMatch.sport')}</AppText>
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
          <AppText variant="heading">{t('createMatch.when')}</AppText>
          <DateTimeField
            error={validation.localDate}
            label={t('createMatch.date')}
            minimumDate={new Date()}
            mode="date"
            onChange={(localDate) =>
              setDraft((current) => ({ ...current, localDate }))
            }
            value={draft.localDate}
          />
          <DateTimeField
            error={validation.localStartTime}
            hint={t('createMatch.timeHint')}
            label={t('createMatch.time')}
            mode="time"
            onChange={(localStartTime) =>
              setDraft((current) => ({ ...current, localStartTime }))
            }
            value={draft.localStartTime}
          />
        </Surface>

        <Surface style={styles.section}>
          <AppText variant="heading">{t('createMatch.where')}</AppText>
          <TextField
            error={validation.location ?? null}
            label={t('createMatch.location')}
            maxLength={255}
            onChangeText={(location) =>
              setDraft((current) => ({ ...current, location }))
            }
            placeholder={t('createMatch.locationPlaceholder')}
            value={draft.location}
          />
        </Surface>

        {errorMessage ? (
          <FeedbackBanner
            tone="error"
            title={t('createMatch.failedTitle')}
            message={errorMessage}
          />
        ) : null}
        <Button
          busy={createMutation.isPending}
          disabled={
            !canSubmitManualMatch(draft, createMutation.isPending) ||
            !sportsQuery.data?.length
          }
          label={t('nav.createMatch')}
          onPress={() => void submit()}
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  form: { gap: spacing.lg, maxWidth: layout.formMaxWidth, width: '100%' },
  section: { gap: spacing.md },
  stateCard: { gap: spacing.md },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

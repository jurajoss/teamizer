import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Button,
  FeedbackBanner,
  layout,
  spacing,
  Surface,
  TextField,
  useTheme,
} from '@teamizer/ui';

import { ApiClientError } from '../../../../src/api/authenticated-api-client';
import { localizedErrorMessage } from '../../../../src/i18n/localized-error';
import type {
  Schedule,
  UpdateScheduleInput,
  Weekday,
} from '../../../../src/api/contracts';
import {
  canAccessMatchAdministration,
  formatLocalTimeForApi,
  MATCH_TIME_ZONE,
  parseLocalTime,
  reminderDraftFromMinutes,
  reminderDraftToMinutes,
  runSingleSubmission,
  weekdays,
  type ReminderDraft,
  type ReminderUnit,
} from '../../../../src/matches/admin-match-management';
import {
  adminMatchQueryKeys,
  refreshUpcomingMatchesAfterCreation,
} from '../../../../src/matches/admin-match-query-keys';
import { matchRouteFor } from '../../../../src/matches/match-flow';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';
import { DateTimeField } from '../../../../src/ui/date-time-field';

type ScheduleDraft = {
  enabled: boolean;
  weekday: Weekday;
  localStartTime: Date | null;
  timeZone: string;
  sportId: string;
  location: string;
  generationHorizonDays: string;
  registrationReminder: ReminderDraft;
  finalReminder: ReminderDraft;
};

type ScheduleValidation = Partial<
  Record<
    | 'localStartTime'
    | 'timeZone'
    | 'sportId'
    | 'location'
    | 'generationHorizonDays'
    | 'registrationReminder'
    | 'finalReminder',
    string
  >
>;

const initialDraft: ScheduleDraft = {
  enabled: true,
  weekday: 'TUESDAY',
  localStartTime: null,
  timeZone: MATCH_TIME_ZONE,
  sportId: '',
  location: '',
  generationHorizonDays: '7',
  registrationReminder: { value: '2', unit: 'DAYS' },
  finalReminder: { value: '3', unit: 'HOURS' },
};

export default function RecurringScheduleRoute() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state } = useSession();
  const { apiClient } = useAppServices();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const saveGate = useRef(false);
  const [draft, setDraft] = useState(initialDraft);
  const [validation, setValidation] = useState<ScheduleValidation>({});
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const authorized =
    state.status === 'AUTHENTICATED' &&
    canAccessMatchAdministration(state.currentUser.user.role);
  const sportsQuery = useQuery({
    queryKey: adminMatchQueryKeys.sports,
    queryFn: () => apiClient.getAdminSports(),
    enabled: authorized,
  });
  const scheduleQuery = useQuery({
    queryKey: adminMatchQueryKeys.schedule,
    queryFn: async () => {
      try {
        return await apiClient.getAdminSchedule();
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404)
          return null;
        throw error;
      }
    },
    enabled: authorized,
  });
  const updateMutation = useMutation({
    mutationFn: (input: UpdateScheduleInput) =>
      apiClient.updateAdminSchedule(input),
  });
  const generateMutation = useMutation({
    mutationFn: () => apiClient.generateScheduledMatch(),
  });

  useEffect(() => {
    if (
      initialized.current ||
      scheduleQuery.isPending ||
      sportsQuery.isPending
    ) {
      return;
    }
    initialized.current = true;
    setDraft(
      scheduleQuery.data
        ? draftFromSchedule(scheduleQuery.data)
        : {
            ...initialDraft,
            sportId: sportsQuery.data?.[0]?.id ?? '',
          },
    );
  }, [
    scheduleQuery.data,
    scheduleQuery.isPending,
    sportsQuery.data,
    sportsQuery.isPending,
  ]);

  if (!authorized) return <Redirect href="/home" />;

  const save = async () => {
    await runSingleSubmission(saveGate, async () => {
      const result = validateScheduleDraft(draft, {
        localStartTime: t('validation.chooseTime'),
        timeZone: t('validation.enterTimeZone'),
        sportId: t('validation.chooseSport'),
        location: t('validation.locationLength'),
        generationHorizonDays: t('validation.enterHorizon'),
        registrationReminder: t('validation.reminder'),
        finalReminder: t('validation.reminder'),
      });
      setValidation(result.errors);
      setFeedback(null);
      if (!result.input) return;

      try {
        const schedule = await updateMutation.mutateAsync(result.input);
        queryClient.setQueryData(adminMatchQueryKeys.schedule, schedule);
        setDraft(draftFromSchedule(schedule));
        setFeedback({
          tone: 'success',
          message: t('schedule.saved'),
        });
      } catch (error) {
        setFeedback({
          tone: 'error',
          message: localizedErrorMessage(error, t, 'schedule.saveFailed'),
        });
      }
    });
  };

  const generate = async () => {
    setFeedback(null);
    try {
      const result = await generateMutation.mutateAsync();
      await refreshUpcomingMatchesAfterCreation(queryClient);
      router.push(matchRouteFor(result.match.id));
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: localizedErrorMessage(error, t, 'schedule.generateFailed'),
      });
    }
  };

  const loading = scheduleQuery.isPending || sportsQuery.isPending;
  const loadError = scheduleQuery.isError || sportsQuery.isError;

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      <AppText tone="muted">{t('schedule.intro')}</AppText>

      {loading ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('schedule.loading')}</AppText>
        </Surface>
      ) : null}
      {loadError ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title={t('schedule.unavailable')}
            message={t('common.connectionRetry')}
          />
          <Button
            label={t('common.retry')}
            onPress={() => {
              void scheduleQuery.refetch();
              void sportsQuery.refetch();
            }}
            variant="secondary"
          />
        </View>
      ) : null}

      {!loading && !loadError ? (
        <View style={styles.form}>
          {scheduleQuery.data === null ? (
            <FeedbackBanner
              tone="info"
              title={t('schedule.missing')}
              message={t('schedule.missingHint')}
            />
          ) : null}
          {sportsQuery.data?.length === 0 ? (
            <FeedbackBanner
              tone="warning"
              title={t('createMatch.noSport')}
              message={t('createMatch.noSportHint')}
            />
          ) : null}

          <Surface style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText variant="heading">{t('schedule.automatic')}</AppText>
                <AppText tone="muted">
                  {draft.enabled
                    ? t('schedule.enabled')
                    : t('schedule.disabled')}
                </AppText>
              </View>
              <Switch
                accessibilityLabel={t('schedule.automaticLabel')}
                accessibilityState={{ checked: draft.enabled }}
                onValueChange={(enabled) =>
                  setDraft((current) => ({ ...current, enabled }))
                }
                thumbColor={colors.surface}
                trackColor={{ false: colors.borderStrong, true: colors.accent }}
                value={draft.enabled}
              />
            </View>
          </Surface>

          <Surface style={styles.section}>
            <AppText variant="heading">{t('schedule.weekly')}</AppText>
            <AppText variant="label">{t('schedule.weekday')}</AppText>
            <View style={styles.choiceRow}>
              {weekdays.map((weekday) => (
                <Button
                  fullWidth={false}
                  key={weekday.value}
                  label={t(`schedule.weekdays.${weekday.value}`)}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      weekday: weekday.value,
                    }))
                  }
                  variant={
                    draft.weekday === weekday.value ? 'primary' : 'secondary'
                  }
                />
              ))}
            </View>
            <DateTimeField
              error={validation.localStartTime}
              label={t('schedule.matchTime')}
              mode="time"
              onChange={(localStartTime) =>
                setDraft((current) => ({ ...current, localStartTime }))
              }
              value={draft.localStartTime}
            />
            <TextField
              autoCapitalize="none"
              autoCorrect={false}
              error={validation.timeZone ?? null}
              hint={t('schedule.timeZoneHint')}
              label={t('schedule.timeZone')}
              maxLength={64}
              onChangeText={(timeZone) =>
                setDraft((current) => ({ ...current, timeZone }))
              }
              value={draft.timeZone}
            />
          </Surface>

          <Surface style={styles.section}>
            <AppText variant="heading">{t('schedule.sportPlace')}</AppText>
            <AppText variant="label">{t('createMatch.sport')}</AppText>
            <View style={styles.choiceRow}>
              {sportsQuery.data?.map((sport) => (
                <Button
                  fullWidth={false}
                  key={sport.id}
                  label={sport.name}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      sportId: sport.id,
                    }))
                  }
                  variant={draft.sportId === sport.id ? 'primary' : 'secondary'}
                />
              ))}
            </View>
            {validation.sportId ? (
              <AppText variant="caption" tone="error">
                {validation.sportId}
              </AppText>
            ) : null}
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

          <Surface style={styles.section}>
            <AppText variant="heading">{t('schedule.reminders')}</AppText>
            <TextField
              error={validation.generationHorizonDays ?? null}
              hint={t('schedule.horizonHint')}
              inputMode="numeric"
              keyboardType="number-pad"
              label={t('schedule.horizon')}
              onChangeText={(generationHorizonDays) =>
                setDraft((current) => ({
                  ...current,
                  generationHorizonDays,
                }))
              }
              value={draft.generationHorizonDays}
            />
            <ReminderEditor
              error={validation.registrationReminder ?? null}
              label={t('schedule.registrationReminder')}
              onChange={(registrationReminder) =>
                setDraft((current) => ({
                  ...current,
                  registrationReminder,
                }))
              }
              value={draft.registrationReminder}
            />
            <ReminderEditor
              error={validation.finalReminder ?? null}
              label={t('schedule.finalReminder')}
              onChange={(finalReminder) =>
                setDraft((current) => ({ ...current, finalReminder }))
              }
              value={draft.finalReminder}
            />
          </Surface>

          <FeedbackBanner
            tone="warning"
            title={t('schedule.futureOnly')}
            message={t('schedule.futureOnlyHint')}
          />
          {feedback ? (
            <FeedbackBanner
              tone={feedback.tone}
              title={
                feedback.tone === 'success'
                  ? t('schedule.saved')
                  : t('schedule.actionFailed')
              }
              message={feedback.message}
            />
          ) : null}
          <Button
            busy={updateMutation.isPending}
            disabled={!sportsQuery.data?.length}
            label={scheduleQuery.data ? t('common.save') : t('schedule.create')}
            onPress={() => void save()}
          />
          <Button
            busy={generateMutation.isPending}
            disabled={!scheduleQuery.data || !scheduleQuery.data.enabled}
            label={t('schedule.generate')}
            onPress={() => void generate()}
            variant="secondary"
          />
          <AppText variant="caption" tone="muted">
            {t('schedule.manualHint')}
          </AppText>
        </View>
      ) : null}
    </AppScreen>
  );
}

function ReminderEditor({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: ReminderDraft;
  error?: string | null | undefined;
  onChange(value: ReminderDraft): void;
}) {
  const { t } = useTranslation();
  const units: ReminderUnit[] = ['MINUTES', 'HOURS', 'DAYS'];
  return (
    <View style={styles.reminderEditor}>
      <TextField
        error={error ?? null}
        inputMode="numeric"
        keyboardType="number-pad"
        label={label}
        onChangeText={(nextValue) => onChange({ ...value, value: nextValue })}
        value={value.value}
      />
      <View style={styles.choiceRow}>
        {units.map((unit) => (
          <Button
            fullWidth={false}
            key={unit}
            label={
              unit === 'DAYS'
                ? t('schedule.days')
                : unit === 'HOURS'
                  ? t('schedule.hours')
                  : t('schedule.minutes')
            }
            onPress={() => onChange({ ...value, unit })}
            variant={value.unit === unit ? 'primary' : 'secondary'}
          />
        ))}
      </View>
    </View>
  );
}

function draftFromSchedule(schedule: Schedule): ScheduleDraft {
  return {
    enabled: schedule.enabled,
    weekday: schedule.weekday,
    localStartTime: parseLocalTime(schedule.localStartTime),
    timeZone: schedule.timeZone,
    sportId: schedule.sportId,
    location: schedule.location ?? '',
    generationHorizonDays: String(schedule.generationHorizonDays),
    registrationReminder: reminderDraftFromMinutes(
      schedule.registrationReminderMinutes,
    ),
    finalReminder: reminderDraftFromMinutes(schedule.finalReminderMinutes),
  };
}

function validateScheduleDraft(
  draft: ScheduleDraft,
  messages: ScheduleValidation,
): {
  errors: ScheduleValidation;
  input: UpdateScheduleInput | null;
} {
  const errors: ScheduleValidation = {};
  if (!draft.localStartTime)
    errors.localStartTime = messages.localStartTime ?? '';
  if (!draft.timeZone.trim()) errors.timeZone = messages.timeZone ?? '';
  if (!draft.sportId) errors.sportId = messages.sportId ?? '';
  if (draft.location.trim().length > 255) {
    errors.location = messages.location ?? '';
  }
  const horizon = Number(draft.generationHorizonDays);
  if (!/^\d+$/.test(draft.generationHorizonDays) || horizon < 1) {
    errors.generationHorizonDays = messages.generationHorizonDays ?? '';
  }
  const registrationReminderMinutes = reminderDraftToMinutes(
    draft.registrationReminder,
  );
  if (registrationReminderMinutes === null) {
    errors.registrationReminder = messages.registrationReminder ?? '';
  }
  const finalReminderMinutes = reminderDraftToMinutes(draft.finalReminder);
  if (finalReminderMinutes === null) {
    errors.finalReminder = messages.finalReminder ?? '';
  }

  if (
    Object.keys(errors).length > 0 ||
    !draft.localStartTime ||
    registrationReminderMinutes === null ||
    finalReminderMinutes === null
  ) {
    return { errors, input: null };
  }
  return {
    errors,
    input: {
      weekday: draft.weekday,
      localStartTime: formatLocalTimeForApi(draft.localStartTime),
      timeZone: draft.timeZone.trim(),
      enabled: draft.enabled,
      sportId: draft.sportId,
      location: draft.location.trim() || null,
      generationHorizonDays: horizon,
      registrationReminderMinutes,
      finalReminderMinutes,
    },
  };
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  form: { gap: spacing.lg, maxWidth: layout.formMaxWidth, width: '100%' },
  section: { gap: spacing.md },
  stateCard: { gap: spacing.md },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: 64,
  },
  switchCopy: { flex: 1, gap: spacing.xs },
  reminderEditor: { gap: spacing.sm },
});

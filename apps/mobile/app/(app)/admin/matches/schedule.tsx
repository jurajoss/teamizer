import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import {
  AppText,
  BrandLockup,
  Button,
  colors,
  FeedbackBanner,
  layout,
  spacing,
  StatusPill,
  Surface,
  TextField,
} from '@teamizer/ui';

import { ApiClientError } from '../../../../src/api/authenticated-api-client';
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
  reminderUnitLabel,
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
      const result = validateScheduleDraft(draft);
      setValidation(result.errors);
      setFeedback(null);
      if (!result.input) return;

      try {
        const schedule = await updateMutation.mutateAsync(result.input);
        queryClient.setQueryData(adminMatchQueryKeys.schedule, schedule);
        setDraft(draftFromSchedule(schedule));
        setFeedback({
          tone: 'success',
          message: 'Recurring Schedule saved.',
        });
      } catch (error) {
        setFeedback({
          tone: 'error',
          message:
            error instanceof ApiClientError
              ? error.message
              : 'The recurring Schedule could not be saved.',
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
        message:
          error instanceof ApiClientError
            ? error.message
            : 'The next scheduled Match could not be generated.',
      });
    }
  };

  const loading = scheduleQuery.isPending || sportsQuery.isPending;
  const loadError = scheduleQuery.isError || sportsQuery.isError;

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
        <StatusPill label="ADMIN" tone="info" />
        <AppText accessibilityRole="header" variant="title">
          Recurring Schedule
        </AppText>
        <AppText tone="muted">
          Configure one weekly Match. Existing materialized Matches keep their
          current time, location, attendance, and lifecycle state.
        </AppText>
      </View>

      {loading ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">Loading Schedule…</AppText>
          <AppText tone="muted">Reading the recurring configuration.</AppText>
        </Surface>
      ) : null}
      {loadError ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title="Schedule unavailable"
            message="Check your connection and try again."
          />
          <Button
            label="Try again"
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
              title="No recurring Schedule yet"
              message="Choose the weekly setup below, then save it."
            />
          ) : null}
          {sportsQuery.data?.length === 0 ? (
            <FeedbackBanner
              tone="warning"
              title="No supported Sport"
              message="Bootstrap the default Football Sport before saving a Schedule."
            />
          ) : null}

          <Surface style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <AppText variant="heading">Automatic generation</AppText>
                <AppText tone="muted">
                  {draft.enabled
                    ? 'Enabled — the scheduler may materialize the next occurrence.'
                    : 'Disabled — no recurring Matches will be generated.'}
                </AppText>
              </View>
              <Switch
                accessibilityLabel="Automatic recurring Match generation"
                accessibilityState={{ checked: draft.enabled }}
                onValueChange={(enabled) =>
                  setDraft((current) => ({ ...current, enabled }))
                }
                thumbColor={colors.surface}
                trackColor={{ false: colors.borderStrong, true: colors.brand }}
                value={draft.enabled}
              />
            </View>
          </Surface>

          <Surface style={styles.section}>
            <AppText variant="heading">Weekly occurrence</AppText>
            <AppText variant="label">Weekday</AppText>
            <View style={styles.choiceRow}>
              {weekdays.map((weekday) => (
                <Button
                  fullWidth={false}
                  key={weekday.value}
                  label={weekday.label}
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
              label="Local Match time"
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
              hint="IANA time zone, for example Europe/Prague."
              label="Time zone"
              maxLength={64}
              onChangeText={(timeZone) =>
                setDraft((current) => ({ ...current, timeZone }))
              }
              value={draft.timeZone}
            />
          </Surface>

          <Surface style={styles.section}>
            <AppText variant="heading">Sport & place</AppText>
            <AppText variant="label">Sport</AppText>
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
              label="Location (optional)"
              maxLength={255}
              onChangeText={(location) =>
                setDraft((current) => ({ ...current, location }))
              }
              placeholder="e.g. Pitch A"
              value={draft.location}
            />
          </Surface>

          <Surface style={styles.section}>
            <AppText variant="heading">Generation & reminders</AppText>
            <TextField
              error={validation.generationHorizonDays ?? null}
              hint="How many local calendar days before the Match it may be created."
              inputMode="numeric"
              keyboardType="number-pad"
              label="Generation horizon (days)"
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
              label="Registration reminder"
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
              label="Final reminder"
              onChange={(finalReminder) =>
                setDraft((current) => ({ ...current, finalReminder }))
              }
              value={draft.finalReminder}
            />
          </Surface>

          <FeedbackBanner
            tone="warning"
            title="Future scheduling only"
            message="Saving changes does not rewrite an already materialized Match. The new setup applies after that occurrence."
          />
          {feedback ? (
            <FeedbackBanner
              tone={feedback.tone}
              title={
                feedback.tone === 'success' ? 'Schedule saved' : 'Action failed'
              }
              message={feedback.message}
            />
          ) : null}
          <Button
            busy={updateMutation.isPending}
            disabled={!sportsQuery.data?.length}
            label={scheduleQuery.data ? 'Save changes' : 'Create Schedule'}
            onPress={() => void save()}
          />
          <Button
            busy={generateMutation.isPending}
            disabled={!scheduleQuery.data || !scheduleQuery.data.enabled}
            label="Generate next Match now"
            onPress={() => void generate()}
            variant="secondary"
          />
          <AppText variant="caption" tone="muted">
            Manual generation uses the same horizon and duplicate protection as
            the automatic scheduler.
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
            label={reminderUnitLabel(unit)}
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

function validateScheduleDraft(draft: ScheduleDraft): {
  errors: ScheduleValidation;
  input: UpdateScheduleInput | null;
} {
  const errors: ScheduleValidation = {};
  if (!draft.localStartTime) errors.localStartTime = 'Choose a Match time.';
  if (!draft.timeZone.trim()) errors.timeZone = 'Enter a time zone.';
  if (!draft.sportId) errors.sportId = 'Choose a Sport.';
  if (draft.location.trim().length > 255) {
    errors.location = 'Location must be 255 characters or fewer.';
  }
  const horizon = Number(draft.generationHorizonDays);
  if (!/^\d+$/.test(draft.generationHorizonDays) || horizon < 1) {
    errors.generationHorizonDays = 'Enter at least one day.';
  }
  const registrationReminderMinutes = reminderDraftToMinutes(
    draft.registrationReminder,
  );
  if (registrationReminderMinutes === null) {
    errors.registrationReminder = 'Enter a whole, non-negative reminder.';
  }
  const finalReminderMinutes = reminderDraftToMinutes(draft.finalReminder);
  if (finalReminderMinutes === null) {
    errors.finalReminder = 'Enter a whole, non-negative reminder.';
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

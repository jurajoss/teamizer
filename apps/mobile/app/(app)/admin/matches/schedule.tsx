import { Redirect, router } from 'expo-router';
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

import {
  canAccessMatchAdministration,
  weekdays,
  type ReminderDraft,
  type ReminderUnit,
} from '../../../../src/matches/admin-match-management';
import { matchRouteFor } from '../../../../src/matches/match-flow';
import { useAdminScheduleController } from '../../../../src/matches/use-admin-schedule-controller';
import { useAppServices } from '../../../../src/providers/app-services-context';
import { useSession } from '../../../../src/session/session-context';
import { AppScreen } from '../../../../src/ui/app-screen';
import { DateTimeField } from '../../../../src/ui/date-time-field';

export default function RecurringScheduleRoute() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state } = useSession();
  const { apiClient } = useAppServices();
  const authorized =
    state.status === 'AUTHENTICATED' &&
    canAccessMatchAdministration(state.currentUser.user.role);
  const schedule = useAdminScheduleController({
    apiClient,
    authorized,
    onGenerated: (matchId) => router.push(matchRouteFor(matchId)),
  });
  const {
    draft,
    feedback,
    generate,
    loadError,
    loading,
    save,
    scheduleQuery,
    setDraft,
    sportsQuery,
    validation,
  } = schedule;

  if (!authorized) return <Redirect href="/home" />;

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
            busy={schedule.updatePending}
            disabled={!sportsQuery.data?.length}
            label={scheduleQuery.data ? t('common.save') : t('schedule.create')}
            onPress={() => void save()}
          />
          <Button
            busy={schedule.generatePending}
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

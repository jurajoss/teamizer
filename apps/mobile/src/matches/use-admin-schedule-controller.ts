import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  ApiClientError,
  type AuthenticatedApiClient,
} from '../api/authenticated-api-client';
import { localizedErrorMessage } from '../i18n/localized-error';
import { runSingleSubmission } from './admin-match-management';
import {
  adminMatchQueryKeys,
  refreshUpcomingMatchesAfterCreation,
} from './admin-match-query-keys';
import {
  initialScheduleDraft,
  scheduleDraftFromSchedule,
  validateScheduleDraft,
  type ScheduleDraft,
  type ScheduleValidation,
} from './schedule-form';

type ScheduleMutationApi = Pick<AuthenticatedApiClient, 'updateAdminSchedule'>;
type ScheduleGenerationApi = Pick<
  AuthenticatedApiClient,
  'generateScheduledMatch'
>;

type ScheduleQueryClient = Parameters<
  typeof refreshUpcomingMatchesAfterCreation
>[0];

export async function persistSchedule(
  apiClient: ScheduleMutationApi,
  input: Parameters<AuthenticatedApiClient['updateAdminSchedule']>[0],
) {
  return apiClient.updateAdminSchedule(input);
}

export async function generateScheduledMatchAndRefresh(
  apiClient: ScheduleGenerationApi,
  queryClient: ScheduleQueryClient,
): Promise<string> {
  const result = await apiClient.generateScheduledMatch();
  await refreshUpcomingMatchesAfterCreation(queryClient);
  return result.match.id;
}

export function useAdminScheduleController({
  apiClient,
  authorized,
  onGenerated,
}: {
  apiClient: AuthenticatedApiClient;
  authorized: boolean;
  onGenerated(matchId: string): void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const initialized = useRef(false);
  const saveGate = useRef(false);
  const [draft, setDraft] = useState<ScheduleDraft>(initialScheduleDraft);
  const [validation, setValidation] = useState<ScheduleValidation>({});
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
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
        if (error instanceof ApiClientError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: authorized,
  });
  const updateMutation = useMutation({
    mutationFn: (
      input: Parameters<AuthenticatedApiClient['updateAdminSchedule']>[0],
    ) => persistSchedule(apiClient, input),
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
        ? scheduleDraftFromSchedule(scheduleQuery.data)
        : {
            ...initialScheduleDraft,
            sportId: sportsQuery.data?.[0]?.id ?? '',
          },
    );
  }, [
    scheduleQuery.data,
    scheduleQuery.isPending,
    sportsQuery.data,
    sportsQuery.isPending,
  ]);

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
        setDraft(scheduleDraftFromSchedule(schedule));
        setFeedback({ tone: 'success', message: t('schedule.saved') });
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
      const matchId = await generateScheduledMatchAndRefresh(
        { generateScheduledMatch: () => generateMutation.mutateAsync() },
        queryClient,
      );
      onGenerated(matchId);
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: localizedErrorMessage(error, t, 'schedule.generateFailed'),
      });
    }
  };

  return {
    draft,
    setDraft,
    validation,
    feedback,
    sportsQuery,
    scheduleQuery,
    loading: scheduleQuery.isPending || sportsQuery.isPending,
    loadError: scheduleQuery.isError || sportsQuery.isError,
    updatePending: updateMutation.isPending,
    generatePending: generateMutation.isPending,
    save,
    generate,
  };
}

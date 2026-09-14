import { z } from 'zod';

import type { FirebaseAuthClient } from '../auth/auth-client';
import {
  createWebAvatarUploadBody,
  type AvatarUpload,
  type AvatarUploadTransport,
} from './avatar-upload';
import { logAvatarUploadStage } from './avatar-upload-stage';
import {
  addParticipantInputSchema,
  addParticipantResponseSchema,
  type AddParticipantInput,
  type AddParticipantResponse,
  attendanceInputSchema,
  adminSportsSchema,
  adminPlayerDetailSchema,
  type AdminPlayerDetail,
  type Attendance,
  completeMatchInputSchema,
  createManualMatchInputSchema,
  type CreateManualMatchInput,
  convertGuestInputSchema,
  convertedGuestResponseSchema,
  type ConvertedGuestResponse,
  currentUserResponseSchema,
  idempotencyKeySchema,
  matchDetailSchema,
  matchSummarySchema,
  matchIdSchema,
  type CompleteMatchInput,
  onboardingInputSchema,
  type CurrentUser,
  type MatchDetail,
  type MatchParticipant,
  type MatchSummary,
  matchParticipantSchema,
  playerDetailSchema,
  type PlayerDetail,
  playerMatchHistoryPageSchema,
  type PlayerMatchHistoryPage,
  playerStatisticsSchema,
  playersPageSchema,
  type PlayersPage,
  type PlayerStatistics,
  rankingsPageSchema,
  type RankingsPage,
  type RegisterPushDeviceInput,
  registerPushDeviceInputSchema,
  generatedScheduledMatchSchema,
  type GeneratedScheduledMatch,
  type PushDevice,
  pushDeviceSchema,
  type OnboardingInput,
  startMatchInputSchema,
  type StartMatchInput,
  type Schedule,
  scheduleSchema,
  type SportSummary,
  type TeamProposal,
  teamProposalSchema,
  type UpcomingMatch,
  type UpdateScheduleInput,
  updateScheduleInputSchema,
  upcomingMatchesSchema,
  type UpdateAdminPlayerInput,
  updateAdminPlayerInputSchema,
  type UpdateOwnPlayerInput,
  updateOwnPlayerInputSchema,
} from './contracts';

const apiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiClientError';
  }
}

export type FetchImplementation = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type CompleteMatchResponse = {
  match: MatchDetail;
  idempotentReplay: boolean;
};

type RequestKind = 'AVATAR_UPLOAD';

export class AuthenticatedApiClient {
  private readonly avatarUploadTransport: AvatarUploadTransport;

  constructor(
    private readonly apiUrl: string,
    private readonly authClient: Pick<FirebaseAuthClient, 'getIdToken'>,
    private readonly fetchImplementation: FetchImplementation = (input, init) =>
      fetch(input, init),
    avatarUploadTransport?: AvatarUploadTransport,
  ) {
    this.avatarUploadTransport = avatarUploadTransport ?? {
      prepareBody(upload) {
        logAvatarUploadStage('formdata_started');
        const form = createWebAvatarUploadBody(upload);
        logAvatarUploadStage('formdata_success');
        return form;
      },
      send: (input, init) => this.fetchImplementation(input, init),
    };
  }

  getCurrentUser(): Promise<CurrentUser> {
    return this.requestData('/me', currentUserResponseSchema);
  }

  onboard(input: OnboardingInput): Promise<CurrentUser> {
    const validatedInput = onboardingInputSchema.parse(input);

    return this.requestData('/onboarding', currentUserResponseSchema, {
      method: 'POST',
      body: JSON.stringify(validatedInput),
    });
  }

  getMatch(matchId: string): Promise<MatchDetail> {
    const validatedMatchId = matchIdSchema.parse(matchId);

    return this.requestData(`/matches/${validatedMatchId}`, matchDetailSchema);
  }

  getUpcomingMatches(): Promise<UpcomingMatch[]> {
    return this.requestData('/matches/upcoming', upcomingMatchesSchema);
  }

  getAdminSports(): Promise<SportSummary[]> {
    return this.requestData('/admin/sports', adminSportsSchema);
  }

  createManualMatch(input: CreateManualMatchInput): Promise<MatchSummary> {
    const validatedInput = createManualMatchInputSchema.parse(input);
    return this.requestData('/admin/matches', matchSummarySchema, {
      method: 'POST',
      body: JSON.stringify(validatedInput),
    });
  }

  getAdminSchedule(): Promise<Schedule> {
    return this.requestData('/admin/schedule', scheduleSchema);
  }

  updateAdminSchedule(input: UpdateScheduleInput): Promise<Schedule> {
    const validatedInput = updateScheduleInputSchema.parse(input);
    return this.requestData('/admin/schedule', scheduleSchema, {
      method: 'PUT',
      body: JSON.stringify(validatedInput),
    });
  }

  generateScheduledMatch(): Promise<GeneratedScheduledMatch> {
    return this.requestData(
      '/admin/schedule/generate-matches',
      generatedScheduledMatchSchema,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  getRankings(
    options: {
      cursor?: string;
      limit?: number;
    } = {},
  ): Promise<RankingsPage> {
    return this.requestData(
      `/rankings${queryString(options)}`,
      rankingsPageSchema,
    );
  }

  getPlayerDetail(playerId: string): Promise<PlayerDetail> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    return this.requestData(
      `/players/${validatedPlayerId}`,
      playerDetailSchema,
    );
  }

  getAdminPlayerDetail(playerId: string): Promise<AdminPlayerDetail> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    return this.requestData(
      `/players/${validatedPlayerId}`,
      adminPlayerDetailSchema,
    );
  }

  getPlayers(
    options: {
      cursor?: string;
      limit?: number;
      q?: string;
      status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
    } = {},
  ): Promise<PlayersPage> {
    return this.requestData(
      `/players${queryString(options)}`,
      playersPageSchema,
    );
  }

  updateOwnPlayer(
    playerId: string,
    input: UpdateOwnPlayerInput,
  ): Promise<PlayerDetail> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    const validatedInput = updateOwnPlayerInputSchema.parse(input);
    return this.requestData(
      `/players/${validatedPlayerId}`,
      playerDetailSchema,
      { method: 'PATCH', body: JSON.stringify(validatedInput) },
    );
  }

  updateAdminPlayer(
    playerId: string,
    input: UpdateAdminPlayerInput,
  ): Promise<AdminPlayerDetail> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    const validatedInput = updateAdminPlayerInputSchema.parse(input);
    return this.requestData(
      `/players/${validatedPlayerId}`,
      adminPlayerDetailSchema,
      { method: 'PATCH', body: JSON.stringify(validatedInput) },
    );
  }

  uploadOwnPlayerAvatar(
    playerId: string,
    upload: AvatarUpload,
  ): Promise<PlayerDetail> {
    return this.uploadPlayerAvatar(playerId, upload, playerDetailSchema);
  }

  uploadAdminPlayerAvatar(
    playerId: string,
    upload: AvatarUpload,
  ): Promise<AdminPlayerDetail> {
    return this.uploadPlayerAvatar(playerId, upload, adminPlayerDetailSchema);
  }

  async deletePlayerAvatar(playerId: string): Promise<void> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    await this.requestVoid(`/players/${validatedPlayerId}/avatar`, {
      method: 'DELETE',
    });
  }

  convertGuest(
    playerId: string,
    authProviderId: string,
  ): Promise<ConvertedGuestResponse> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    const input = convertGuestInputSchema.parse({ authProviderId });
    return this.requestData(
      `/players/${validatedPlayerId}/convert-to-user`,
      convertedGuestResponseSchema,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }

  getPlayerStatistics(playerId: string): Promise<PlayerStatistics> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    return this.requestData(
      `/players/${validatedPlayerId}/statistics`,
      playerStatisticsSchema,
    );
  }

  getPlayerMatchHistory(
    playerId: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<PlayerMatchHistoryPage> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    return this.requestData(
      `/players/${validatedPlayerId}/matches${queryString(options)}`,
      playerMatchHistoryPageSchema,
    );
  }

  registerPushDevice(input: RegisterPushDeviceInput): Promise<PushDevice> {
    const validatedInput = registerPushDeviceInputSchema.parse(input);
    return this.requestData('/me/push-devices', pushDeviceSchema, {
      method: 'PUT',
      body: JSON.stringify(validatedInput),
    });
  }

  async invalidatePushDevice(deviceId: string): Promise<void> {
    const validatedDeviceId = matchIdSchema.parse(deviceId);
    await this.requestVoid(`/me/push-devices/${validatedDeviceId}`, {
      method: 'DELETE',
    });
  }

  registerGoing(matchId: string): Promise<{ attendance: 'GOING' }> {
    const validatedMatchId = matchIdSchema.parse(matchId);

    return this.requestData(
      `/matches/${validatedMatchId}/registration`,
      z.object({ attendance: z.literal('GOING') }),
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async removeRegistration(matchId: string): Promise<void> {
    const validatedMatchId = matchIdSchema.parse(matchId);
    await this.requestVoid(`/matches/${validatedMatchId}/registration`, {
      method: 'DELETE',
    });
  }

  updateParticipant(
    matchId: string,
    playerId: string,
    attendance: Attendance,
  ): Promise<MatchParticipant> {
    const validatedMatchId = matchIdSchema.parse(matchId);
    const validatedPlayerId = matchIdSchema.parse(playerId);
    const input = attendanceInputSchema.parse({ attendance });

    return this.requestData(
      `/matches/${validatedMatchId}/participants/${validatedPlayerId}`,
      matchParticipantSchema,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }

  addParticipant(
    matchId: string,
    input: AddParticipantInput,
  ): Promise<AddParticipantResponse> {
    const validatedMatchId = matchIdSchema.parse(matchId);
    const validatedInput = addParticipantInputSchema.parse(input);

    return this.requestData(
      `/matches/${validatedMatchId}/participants`,
      addParticipantResponseSchema,
      { method: 'POST', body: JSON.stringify(validatedInput) },
    );
  }

  generateTeams(matchId: string): Promise<TeamProposal> {
    const validatedMatchId = matchIdSchema.parse(matchId);

    return this.requestData(
      `/matches/${validatedMatchId}/generate-teams`,
      teamProposalSchema,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  startMatch(matchId: string, input: StartMatchInput): Promise<MatchDetail> {
    const validatedMatchId = matchIdSchema.parse(matchId);
    const validatedInput = startMatchInputSchema.parse(input);

    return this.requestData(
      `/matches/${validatedMatchId}/start`,
      matchDetailSchema,
      { method: 'POST', body: JSON.stringify(validatedInput) },
    );
  }

  cancelMatch(matchId: string): Promise<MatchDetail> {
    const validatedMatchId = matchIdSchema.parse(matchId);

    return this.requestData(
      `/matches/${validatedMatchId}/cancel`,
      matchDetailSchema,
      { method: 'POST', body: JSON.stringify({}) },
    );
  }

  async completeMatch(
    matchId: string,
    input: CompleteMatchInput,
    idempotencyKey: string,
  ): Promise<CompleteMatchResponse> {
    const validatedMatchId = matchIdSchema.parse(matchId);
    const validatedInput = completeMatchInputSchema.parse(input);
    const validatedKey = idempotencyKeySchema.parse(idempotencyKey);
    const { data, response } = await this.request(
      `/matches/${validatedMatchId}/complete`,
      matchDetailSchema,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': validatedKey },
        body: JSON.stringify(validatedInput),
      },
    );

    return {
      match: data,
      idempotentReplay:
        response.headers.get('Idempotent-Replay')?.toLowerCase() === 'true',
    };
  }

  private async requestData<T>(
    path: string,
    responseSchema: z.ZodType<T>,
    init: RequestInit = {},
    requestKind?: RequestKind,
  ): Promise<T> {
    return (await this.request(path, responseSchema, init, requestKind)).data;
  }

  private uploadPlayerAvatar<T>(
    playerId: string,
    upload: AvatarUpload,
    responseSchema: z.ZodType<T>,
  ): Promise<T> {
    const validatedPlayerId = matchIdSchema.parse(playerId);
    const form = this.avatarUploadTransport.prepareBody(upload);
    return this.requestData(
      `/players/${validatedPlayerId}/avatar`,
      responseSchema,
      { method: 'POST', body: form },
      'AVATAR_UPLOAD',
    );
  }

  private async requestVoid(path: string, init: RequestInit): Promise<void> {
    await this.authorizedFetch(path, init, async (response) => {
      if (response.status !== 204) {
        throw new ApiClientError(
          response.status,
          'INVALID_API_RESPONSE',
          'The Teamizer API returned an invalid empty response.',
        );
      }
    });
  }

  private async request<T>(
    path: string,
    responseSchema: z.ZodType<T>,
    init: RequestInit = {},
    requestKind?: RequestKind,
  ): Promise<{ data: T; response: Response }> {
    return this.authorizedFetch(
      path,
      init,
      async (response) => {
        const responseBody = await this.readJson(response);
        const parsedResponse = responseSchema.safeParse(responseBody);

        if (!parsedResponse.success) {
          throw new ApiClientError(
            response.status,
            'INVALID_API_RESPONSE',
            'The Teamizer API returned an invalid response.',
            { cause: parsedResponse.error },
          );
        }

        return { data: parsedResponse.data, response };
      },
      requestKind,
    );
  }

  private async authorizedFetch<T>(
    path: string,
    init: RequestInit,
    readSuccess: (response: Response) => Promise<T>,
    requestKind?: RequestKind,
  ): Promise<T> {
    let token: string;

    try {
      token = await this.authClient.getIdToken();
    } catch (error) {
      throw new ApiClientError(
        0,
        'AUTH_SESSION_UNAVAILABLE',
        'A current Firebase session is required.',
        { cause: error },
      );
    }

    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body !== undefined && !(init.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;
    if (requestKind === 'AVATAR_UPLOAD') {
      logAvatarUploadStage('request_started');
    }
    try {
      const url = `${this.apiUrl}${path}`;
      const requestInit = { ...init, headers };
      response =
        requestKind === 'AVATAR_UPLOAD'
          ? await this.avatarUploadTransport.send(url, requestInit)
          : await this.fetchImplementation(url, requestInit);
    } catch (error) {
      throw new ApiClientError(
        0,
        'NETWORK_ERROR',
        'The Teamizer API could not be reached.',
        {
          cause: error,
        },
      );
    }
    if (requestKind === 'AVATAR_UPLOAD') {
      logAvatarUploadStage('response_received');
    }

    if (!response.ok) {
      const responseBody = await this.readJson(response);
      const parsedError = apiErrorResponseSchema.safeParse(responseBody);
      if (parsedError.success) {
        throw new ApiClientError(
          response.status,
          parsedError.data.error.code,
          parsedError.data.error.message,
        );
      }

      throw new ApiClientError(
        response.status,
        'INVALID_ERROR_RESPONSE',
        'The Teamizer API returned an invalid error response.',
      );
    }

    return readSuccess(response);
  }

  private async readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw new ApiClientError(
        response.status,
        'INVALID_API_RESPONSE',
        'The Teamizer API returned non-JSON data.',
        { cause: error },
      );
    }
  }
}

function queryString(options: {
  cursor?: string;
  limit?: number;
  q?: string;
  status?: string;
}): string {
  const parameters = new URLSearchParams();
  if (options.limit !== undefined) {
    parameters.set('limit', String(options.limit));
  }
  if (options.cursor !== undefined) {
    parameters.set('cursor', options.cursor);
  }
  if (options.q !== undefined) {
    parameters.set('q', options.q);
  }
  if (options.status !== undefined) {
    parameters.set('status', options.status);
  }
  const query = parameters.toString();
  return query ? `?${query}` : '';
}

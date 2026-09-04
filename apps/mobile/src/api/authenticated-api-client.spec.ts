import { describe, expect, it, vi } from 'vitest';

import type { FetchImplementation } from './authenticated-api-client';
import { AuthenticatedApiClient } from './authenticated-api-client';
import type { OnboardingInput } from './contracts';

const currentUserResponse = {
  user: {
    id: 'b7e72ff0-7ae8-47de-aa2c-d77eefbe02d5',
    role: 'PLAYER',
    notificationsEnabled: true,
    createdAt: '2026-08-28T10:00:00.000Z',
    authProviderId: 'must-not-reach-mobile-model',
  },
  player: {
    id: '17d13986-b1ab-4ebc-a7b8-ac832e0bdb8b',
    name: 'Gaz',
    type: 'REGULAR',
    status: 'ACTIVE',
    avatarUrl: null,
    attributes: {
      speed: 10,
      endurance: 10,
      defense: 10,
      attack: 10,
      technique: 10,
    },
  },
};

const matchDetailResponse = {
  id: '00000000-0000-4000-8000-000000000010',
  sport: {
    id: '00000000-0000-4000-8000-000000000020',
    name: 'Football',
    teamsPerMatch: 2,
    playersOnFieldPerTeam: 3,
  },
  startsAt: '2026-08-28T18:00:00.000Z',
  location: 'Pitch A',
  status: 'IN_PROGRESS',
  stateVersion: 4,
  myAttendance: 'GOING',
  participants: { going: [], notGoing: [], unanswered: [] },
  teams: [
    {
      id: '00000000-0000-4000-8000-000000000030',
      side: 'A',
      players: [
        {
          id: '00000000-0000-4000-8000-000000000040',
          name: 'Ada',
          type: 'REGULAR',
          status: 'ACTIVE',
          avatarUrl: null,
          attributes: { speed: 10 },
        },
      ],
    },
    {
      id: '00000000-0000-4000-8000-000000000031',
      side: 'B',
      players: [
        {
          id: '00000000-0000-4000-8000-000000000041',
          name: 'Ben',
          type: 'REGULAR',
          status: 'ACTIVE',
          avatarUrl: null,
        },
      ],
    },
  ],
  provenance: {
    mode: 'ALGORITHM',
    algorithmVersion: 'v1',
    configurationVersion: 'v1',
  },
  result: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AuthenticatedApiClient', () => {
  it('registers and invalidates only the current authenticated device record', async () => {
    const deviceId = '00000000-0000-4000-8000-000000000101';
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: deviceId,
          provider: 'EXPO',
          platform: 'IOS',
          isActive: true,
          tokenSuffix: 'evice]',
          deviceLabel: null,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    await client.registerPushDevice({
      provider: 'EXPO',
      platform: 'IOS',
      pushToken: 'ExponentPushToken[device]',
    });
    await client.invalidatePushDevice(deviceId);

    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/me/push-devices',
    );
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'PUT',
      body: JSON.stringify({
        provider: 'EXPO',
        platform: 'IOS',
        pushToken: 'ExponentPushToken[device]',
      }),
    });
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(
      `https://api.example.test/me/push-devices/${deviceId}`,
    );
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'DELETE',
    });
  });

  it('obtains a current token for every request and sends it as a bearer token', async () => {
    const getIdToken = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('fresh-token-1')
      .mockResolvedValueOnce('fresh-token-2');
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockImplementation(async () => jsonResponse(currentUserResponse));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken },
      fetchImplementation,
    );

    await client.getCurrentUser();
    await client.getCurrentUser();

    expect(getIdToken).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(
      fetchImplementation.mock.calls[0]?.[1]?.headers,
    );
    const secondHeaders = new Headers(
      fetchImplementation.mock.calls[1]?.[1]?.headers,
    );
    expect(firstHeaders.get('Authorization')).toBe('Bearer fresh-token-1');
    expect(secondHeaders.get('Authorization')).toBe('Bearer fresh-token-2');
  });

  it('does not make a protected request when the token provider fails', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      {
        getIdToken: vi.fn().mockRejectedValue(new Error('no Firebase session')),
      },
      fetchImplementation,
    );

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      code: 'AUTH_SESSION_UNAVAILABLE',
      status: 0,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('keeps server-only identity and Player attributes out of the mobile model', async () => {
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      vi
        .fn<FetchImplementation>()
        .mockResolvedValue(jsonResponse(currentUserResponse)),
    );

    const currentUser = await client.getCurrentUser();

    expect(currentUser).toEqual({
      user: {
        id: currentUserResponse.user.id,
        role: 'PLAYER',
        notificationsEnabled: true,
        createdAt: currentUserResponse.user.createdAt,
      },
      player: {
        id: currentUserResponse.player.id,
        name: 'Gaz',
        type: 'REGULAR',
        status: 'ACTIVE',
        avatarUrl: null,
      },
    });
    expect(currentUser).not.toHaveProperty('user.authProviderId');
    expect(currentUser).not.toHaveProperty('player.attributes');
  });

  it('rejects an onboarding role before any request is made', () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );
    const inputWithRole = {
      name: 'Gaz',
      role: 'ADMIN',
      attributes: {
        speed: 5,
        endurance: 5,
        defense: 5,
        attack: 5,
        technique: 5,
      },
    } as unknown as OnboardingInput;

    expect(() => client.onboard(inputWithRole)).toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('preserves the backend onboarding-required code', async () => {
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      vi.fn<FetchImplementation>().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'ONBOARDING_REQUIRED',
              message: 'Complete onboarding first.',
            },
          },
          403,
        ),
      ),
    );

    await expect(client.getCurrentUser()).rejects.toMatchObject({
      code: 'ONBOARDING_REQUIRED',
      status: 403,
    });
  });

  it('loads persisted final teams without admitting hidden Player attributes', async () => {
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      vi
        .fn<FetchImplementation>()
        .mockResolvedValue(jsonResponse(matchDetailResponse)),
    );

    const match = await client.getMatch(matchDetailResponse.id);

    expect(match.teams?.[0]?.players[0]).toEqual({
      id: '00000000-0000-4000-8000-000000000040',
      name: 'Ada',
      type: 'REGULAR',
      status: 'ACTIVE',
      avatarUrl: null,
    });
    expect(match.teams?.[0]?.players[0]).not.toHaveProperty('attributes');
  });

  it('loads the upcoming Match entry point without admitting hidden fields', async () => {
    const upcoming = {
      id: matchDetailResponse.id,
      sport: matchDetailResponse.sport,
      startsAt: matchDetailResponse.startsAt,
      location: matchDetailResponse.location,
      status: 'IN_PROGRESS',
      stateVersion: 4,
      myAttendance: 'GOING',
      authProviderId: 'server-only',
    };
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      vi.fn<FetchImplementation>().mockResolvedValue(jsonResponse([upcoming])),
    );

    const matches = await client.getUpcomingMatches();

    expect(matches).toEqual([
      {
        id: upcoming.id,
        sport: upcoming.sport,
        startsAt: upcoming.startsAt,
        location: upcoming.location,
        status: 'IN_PROGRESS',
        stateVersion: 4,
        myAttendance: 'GOING',
      },
    ]);
    expect(matches[0]).not.toHaveProperty('authProviderId');
  });

  it('loads authoritative ranking order and strips hidden Player fields', async () => {
    const rankingResponse = {
      items: [
        {
          rank: 1,
          player: {
            ...currentUserResponse.player,
            attributes: { speed: 9 },
            balancingRating: 0.91,
          },
          statistics: {
            matches: 2,
            wins: 1,
            draws: 1,
            losses: 0,
            winRate: 0.5,
            goals: 3,
            goalsPerMatch: 1.5,
          },
          internalDiagnostics: { score: 100 },
        },
      ],
      nextCursor: 'next page',
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(jsonResponse(rankingResponse));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    const ranking = await client.getRankings({
      limit: 25,
      cursor: 'page one',
    });

    expect(ranking.items.map(({ rank }) => rank)).toEqual([1]);
    expect(ranking.items[0]?.player).not.toHaveProperty('attributes');
    expect(ranking.items[0]?.player).not.toHaveProperty('balancingRating');
    expect(ranking.items[0]).not.toHaveProperty('internalDiagnostics');
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/rankings?limit=25&cursor=page+one',
    );
  });

  it('loads zero-Match Player detail without accepting private attributes', async () => {
    const detailResponse = {
      ...currentUserResponse.player,
      statistics: {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: null,
        goals: 0,
        goalsPerMatch: null,
      },
    };
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      vi
        .fn<FetchImplementation>()
        .mockResolvedValue(jsonResponse(detailResponse)),
    );

    const detail = await client.getPlayerDetail(detailResponse.id);

    expect(detail.statistics.winRate).toBeNull();
    expect(detail.statistics.goalsPerMatch).toBeNull();
    expect(detail).not.toHaveProperty('attributes');
  });

  it('loads paginated final teams and aggregate goals for Player history', async () => {
    const playerId = currentUserResponse.player.id;
    const historyResponse = {
      items: [
        {
          id: matchDetailResponse.id,
          sport: {
            id: matchDetailResponse.sport.id,
            name: matchDetailResponse.sport.name,
          },
          startsAt: matchDetailResponse.startsAt,
          location: matchDetailResponse.location,
          score: { teamA: 2, teamB: 1 },
          teams: [
            {
              id: '00000000-0000-4000-8000-000000000030',
              side: 'A',
              players: [currentUserResponse.player],
            },
          ],
          playerGoals: [{ playerId, goals: 2 }],
          subjectGoals: 2,
          subjectResult: 'WIN',
          balancingDiagnostics: { ignored: true },
        },
      ],
      nextCursor: null,
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValue(jsonResponse(historyResponse));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    const history = await client.getPlayerMatchHistory(playerId, { limit: 10 });

    expect(history.items[0]).toMatchObject({
      score: { teamA: 2, teamB: 1 },
      subjectGoals: 2,
      subjectResult: 'WIN',
    });
    expect(history.items[0]).not.toHaveProperty('balancingDiagnostics');
    expect(history.items[0]?.teams[0]?.players[0]).not.toHaveProperty(
      'attributes',
    );
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(
      `https://api.example.test/players/${playerId}/matches?limit=10`,
    );
  });

  it('uses the approved attendance endpoints including 204 unanswered deletion', async () => {
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse({ attendance: 'GOING' }))
      .mockResolvedValueOnce(
        jsonResponse({
          matchId: matchDetailResponse.id,
          playerId: currentUserResponse.player.id,
          attendance: 'NOT_GOING',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    await client.registerGoing(matchDetailResponse.id);
    await client.updateParticipant(
      matchDetailResponse.id,
      currentUserResponse.player.id,
      'NOT_GOING',
    );
    await client.removeRegistration(matchDetailResponse.id);

    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: '{}',
    });
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ attendance: 'NOT_GOING' }),
    });
    expect(fetchImplementation.mock.calls[2]?.[1]).toMatchObject({
      method: 'DELETE',
    });
  });

  it('creates a persistent guest through the Match participant route and strips hidden attributes', async () => {
    const playerId = '00000000-0000-4000-8000-000000000099';
    const fetchImplementation = vi.fn<FetchImplementation>().mockResolvedValue(
      jsonResponse(
        {
          participant: {
            matchId: matchDetailResponse.id,
            playerId,
            attendance: 'GOING',
          },
          player: {
            id: playerId,
            name: 'Sam',
            type: 'GUEST',
            status: 'ACTIVE',
            avatarUrl: null,
            attributes: { speed: 5 },
          },
        },
        201,
      ),
    );
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    const result = await client.addParticipant(matchDetailResponse.id, {
      guest: {
        name: ' Sam ',
        attributes: {
          speed: 5,
          endurance: 5,
          defense: 5,
          attack: 5,
          technique: 5,
        },
      },
    });

    expect(result.player?.name).toBe('Sam');
    expect(result.player).not.toHaveProperty('attributes');
    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: expect.stringContaining('"name":"Sam"'),
    });
  });

  it('uses the existing-player participant shape for admin additions', async () => {
    const playerId = '00000000-0000-4000-8000-000000000099';
    const fetchImplementation = vi.fn<FetchImplementation>().mockResolvedValue(
      jsonResponse(
        {
          participant: {
            matchId: matchDetailResponse.id,
            playerId,
            attendance: 'GOING',
          },
        },
        201,
      ),
    );
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    await client.addParticipant(matchDetailResponse.id, { playerId });

    expect(fetchImplementation.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ playerId }),
    });
  });

  it('preserves network failures during guest creation for recoverable UI feedback', async () => {
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      vi.fn<FetchImplementation>().mockRejectedValue(new Error('offline')),
    );

    await expect(
      client.addParticipant(matchDetailResponse.id, {
        guest: {
          name: 'Sam',
          attributes: {
            speed: 5,
            endurance: 5,
            defense: 5,
            attack: 5,
            technique: 5,
          },
        },
      }),
    ).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('generates, starts, and cancels using only approved Match payloads', async () => {
    const teamProposal = {
      teamAPlayerIds: ['00000000-0000-4000-8000-000000000040'],
      teamBPlayerIds: ['00000000-0000-4000-8000-000000000041'],
      balance: { balanceScore: 0.01, historyScore: 0.2 },
      algorithmVersion: 'v1',
      configurationVersion: 'v1',
      proposalReceipt: 'signed-receipt',
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse(teamProposal))
      .mockResolvedValueOnce(jsonResponse(matchDetailResponse))
      .mockResolvedValueOnce(
        jsonResponse({ ...matchDetailResponse, status: 'CANCELLED' }),
      );
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    await client.generateTeams(matchDetailResponse.id);
    await client.startMatch(matchDetailResponse.id, {
      teamAPlayerIds: teamProposal.teamAPlayerIds,
      teamBPlayerIds: teamProposal.teamBPlayerIds,
      proposalReceipt: teamProposal.proposalReceipt,
    });
    await client.cancelMatch(matchDetailResponse.id);

    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([
      `https://api.example.test/matches/${matchDetailResponse.id}/generate-teams`,
      `https://api.example.test/matches/${matchDetailResponse.id}/start`,
      `https://api.example.test/matches/${matchDetailResponse.id}/cancel`,
    ]);
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        teamAPlayerIds: teamProposal.teamAPlayerIds,
        teamBPlayerIds: teamProposal.teamBPlayerIds,
        proposalReceipt: teamProposal.proposalReceipt,
      }),
    });
  });

  it('rejects invalid guest and team inputs before making a request', async () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    expect(() =>
      client.addParticipant(matchDetailResponse.id, {
        guest: {
          name: ' ',
          attributes: {
            speed: 0,
            endurance: 5,
            defense: 5,
            attack: 5,
            technique: 5,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      client.startMatch(matchDetailResponse.id, {
        teamAPlayerIds: ['not-a-uuid'],
        teamBPlayerIds: [],
        proposalReceipt: 'receipt',
      }),
    ).toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('sends completion once with the stable idempotency header and reads replay metadata', async () => {
    const completedResponse = {
      ...matchDetailResponse,
      status: 'FINISHED',
      stateVersion: 5,
      result: {
        score: { teamA: 1, teamB: 0 },
        playerGoals: [
          {
            playerId: '00000000-0000-4000-8000-000000000040',
            goals: 1,
          },
          {
            playerId: '00000000-0000-4000-8000-000000000041',
            goals: 0,
          },
        ],
      },
    };
    const fetchImplementation = vi.fn<FetchImplementation>().mockResolvedValue(
      new Response(JSON.stringify(completedResponse), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Idempotent-Replay': 'true',
        },
      }),
    );
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    const result = await client.completeMatch(
      matchDetailResponse.id,
      {
        score: { teamA: 1, teamB: 0 },
        playerGoals: [
          {
            playerId: '00000000-0000-4000-8000-000000000040',
            goals: 1,
          },
        ],
      },
      'stable-idempotency-key',
    );

    const request = fetchImplementation.mock.calls[0];
    expect(request?.[0]).toBe(
      `https://api.example.test/matches/${matchDetailResponse.id}/complete`,
    );
    expect(new Headers(request?.[1]?.headers).get('Idempotency-Key')).toBe(
      'stable-idempotency-key',
    );
    expect(result.idempotentReplay).toBe(true);
    expect(result.match.status).toBe('FINISHED');
  });

  it('uses focused Player profile/admin endpoints and keeps list rows attribute-free', async () => {
    const playerId = currentUserResponse.player.id;
    const statistics = {
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      goals: 0,
      goalsPerMatch: null,
    };
    const publicDetail = {
      ...currentUserResponse.player,
      name: 'Updated Player',
      statistics,
    };
    const adminDetail = {
      ...publicDetail,
      attributes: {
        speed: 5,
        endurance: 6,
        defense: 7,
        attack: 8,
        technique: 9,
      },
    };
    const converted = {
      user: {
        id: currentUserResponse.user.id,
        role: 'PLAYER',
        notificationsEnabled: true,
        createdAt: currentUserResponse.user.createdAt,
      },
      player: {
        id: playerId,
        name: 'Updated Player',
        type: 'REGULAR',
        status: 'ACTIVE',
        avatarUrl: null,
        attributes: adminDetail.attributes,
      },
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              ...currentUserResponse.player,
              attributes: { speed: 10 },
            },
          ],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse(adminDetail))
      .mockResolvedValueOnce(jsonResponse(publicDetail))
      .mockResolvedValueOnce(jsonResponse(adminDetail))
      .mockResolvedValueOnce(jsonResponse(converted, 201));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    const list = await client.getPlayers({
      limit: 25,
      q: 'Updated',
      status: 'ALL',
    });
    const detail = await client.getAdminPlayerDetail(playerId);
    await client.updateOwnPlayer(playerId, { name: 'Updated Player' });
    await client.updateAdminPlayer(playerId, {
      status: 'INACTIVE',
      attributes: adminDetail.attributes,
    });
    const conversion = await client.convertGuest(
      playerId,
      '  pre-provisioned-firebase-uid  ',
    );

    expect(list.items[0]).not.toHaveProperty('attributes');
    expect(detail.attributes).toEqual(adminDetail.attributes);
    expect(conversion.player.id).toBe(playerId);
    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/players?limit=25&q=Updated&status=ALL',
      `https://api.example.test/players/${playerId}`,
      `https://api.example.test/players/${playerId}`,
      `https://api.example.test/players/${playerId}`,
      `https://api.example.test/players/${playerId}/convert-to-user`,
    ]);
    expect(fetchImplementation.mock.calls[2]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Player' }),
    });
    expect(fetchImplementation.mock.calls[4]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        authProviderId: 'pre-provisioned-firebase-uid',
      }),
    });
  });

  it('uses multipart avatar upload without forcing JSON and supports removal', async () => {
    const playerId = currentUserResponse.player.id;
    const profile = {
      ...currentUserResponse.player,
      avatarUrl: 'https://avatars.example.test/player.jpg',
      statistics: {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: null,
        goals: 0,
        goalsPerMatch: null,
      },
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse(profile))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    await client.uploadOwnPlayerAvatar(playerId, {
      kind: 'WEB_BLOB',
      blob: new Blob(['jpeg'], { type: 'image/jpeg' }),
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
    });
    await client.deletePlayerAvatar(playerId);

    const uploadInit = fetchImplementation.mock.calls[0]?.[1];
    const uploadHeaders = new Headers(uploadInit?.headers);
    expect(uploadInit?.body).toBeInstanceOf(FormData);
    expect(uploadHeaders.get('Content-Type')).toBeNull();
    expect(uploadHeaders.get('Authorization')).toBe('Bearer token');
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'DELETE',
    });
  });

  it('rejects private fields in the own-profile client contract before sending', () => {
    const fetchImplementation = vi.fn<FetchImplementation>();
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    expect(() =>
      client.updateOwnPlayer(currentUserResponse.player.id, {
        name: 'Player',
        attributes: { speed: 10 },
      } as never),
    ).toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('creates a one-off Match and loads only public Sport fields', async () => {
    const sport = matchDetailResponse.sport;
    const created = {
      id: '00000000-0000-4000-8000-000000000060',
      sport,
      startsAt: '2099-07-20T16:30:00.000Z',
      location: 'Pitch B',
      status: 'OPEN_FOR_REGISTRATION',
      stateVersion: 0,
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse([{ ...sport, speed: 10 }]))
      .mockResolvedValueOnce(jsonResponse(created, 201));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    const sports = await client.getAdminSports();
    const match = await client.createManualMatch({
      sportId: sport.id,
      localDate: '2099-07-20',
      localStartTime: '18:30:00',
      location: 'Pitch B',
    });

    expect(sports).toEqual([sport]);
    expect(sports[0]).not.toHaveProperty('speed');
    expect(match).toEqual(created);
    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/admin/sports',
      'https://api.example.test/admin/matches',
    ]);
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        sportId: sport.id,
        localDate: '2099-07-20',
        localStartTime: '18:30:00',
        location: 'Pitch B',
      }),
    });
  });

  it('loads, updates, and materializes the existing recurring Schedule contract', async () => {
    const schedule = {
      id: '00000000-0000-4000-8000-000000000070',
      weekday: 'TUESDAY',
      localStartTime: '18:00:00',
      timeZone: 'Europe/Prague',
      enabled: true,
      sportId: matchDetailResponse.sport.id,
      location: 'Pitch A',
      generationHorizonDays: 7,
      registrationReminderMinutes: 2880,
      finalReminderMinutes: 180,
    } as const;
    const generated = {
      match: {
        id: '00000000-0000-4000-8000-000000000071',
        sport: matchDetailResponse.sport,
        startsAt: '2099-07-20T16:00:00.000Z',
        location: 'Pitch A',
        status: 'OPEN_FOR_REGISTRATION',
        stateVersion: 0,
      },
      created: true,
    };
    const fetchImplementation = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse(schedule))
      .mockResolvedValueOnce(jsonResponse({ ...schedule, enabled: false }))
      .mockResolvedValueOnce(jsonResponse(generated));
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      fetchImplementation,
    );

    await client.getAdminSchedule();
    const updated = await client.updateAdminSchedule({
      weekday: schedule.weekday,
      localStartTime: schedule.localStartTime,
      timeZone: schedule.timeZone,
      enabled: false,
      sportId: schedule.sportId,
      location: schedule.location,
      generationHorizonDays: schedule.generationHorizonDays,
      registrationReminderMinutes: schedule.registrationReminderMinutes,
      finalReminderMinutes: schedule.finalReminderMinutes,
    });
    const materialized = await client.generateScheduledMatch();

    expect(updated.enabled).toBe(false);
    expect(materialized).toEqual(generated);
    expect(fetchImplementation.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.test/admin/schedule',
      'https://api.example.test/admin/schedule',
      'https://api.example.test/admin/schedule/generate-matches',
    ]);
    expect(fetchImplementation.mock.calls[1]?.[1]).toMatchObject({
      method: 'PUT',
    });
  });

  it('preserves a clear administrative API error for recoverable UI feedback', async () => {
    const client = new AuthenticatedApiClient(
      'https://api.example.test',
      { getIdToken: vi.fn().mockResolvedValue('token') },
      vi.fn<FetchImplementation>().mockResolvedValue(
        jsonResponse(
          {
            error: {
              code: 'INVALID_MATCH',
              message: 'The local time is invalid.',
            },
          },
          422,
        ),
      ),
    );

    await expect(
      client.createManualMatch({
        sportId: matchDetailResponse.sport.id,
        localDate: '2099-10-25',
        localStartTime: '02:30:00',
        location: null,
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'INVALID_MATCH',
      message: 'The local time is invalid.',
    });
  });
});

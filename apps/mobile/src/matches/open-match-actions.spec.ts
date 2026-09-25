import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from '../api/authenticated-api-client';
import type { MatchDetail, TeamProposal } from '../api/contracts';
import { i18n } from '../i18n/i18n';
import { openMatchErrorFeedback } from './open-match-feedback';
import {
  cancelOpenMatch,
  shouldRefreshAfterCancellationError,
} from './use-match-lifecycle-actions';
import {
  resolveGeneratedProposal,
  startMatchWithProposal,
} from './use-match-proposal';
import {
  createGuestParticipant,
  emptyGuestDraft,
  updateAttendanceAsAdministrator,
  updateOwnAttendance,
} from './use-open-match-participation';

const ids = {
  match: '00000000-0000-4000-8000-000000000001',
  sport: '00000000-0000-4000-8000-000000000002',
  current: '00000000-0000-4000-8000-000000000003',
  other: '00000000-0000-4000-8000-000000000004',
};

function player(id: string, name: string) {
  return {
    id,
    name,
    type: 'REGULAR' as const,
    status: 'ACTIVE' as const,
    avatarUrl: null,
  };
}

function openMatch(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    id: ids.match,
    sport: {
      id: ids.sport,
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 5,
    },
    startsAt: '2026-09-20T18:00:00.000Z',
    location: 'Pitch A',
    status: 'OPEN_FOR_REGISTRATION',
    stateVersion: 4,
    myAttendance: null,
    participants: {
      going: [player(ids.current, 'Ada')],
      notGoing: [],
      unanswered: [player(ids.other, 'Ben')],
    },
    teams: null,
    provenance: null,
    result: null,
    ...overrides,
  };
}

function teamProposal(): TeamProposal {
  return {
    teamAPlayerIds: [ids.current],
    teamBPlayerIds: [ids.other],
    balance: { balanceScore: 0.1, historyScore: 0.2 },
    algorithmVersion: 'v1',
    configurationVersion: 'v1',
    proposalReceipt: 'receipt',
  };
}

function participationApi() {
  return {
    addParticipant: vi.fn().mockResolvedValue({
      participant: {
        matchId: ids.match,
        playerId: ids.other,
        attendance: 'GOING',
      },
    }),
    registerGoing: vi.fn().mockResolvedValue({ attendance: 'GOING' }),
    removeRegistration: vi.fn().mockResolvedValue(undefined),
    updateParticipant: vi.fn().mockResolvedValue({
      matchId: ids.match,
      playerId: ids.current,
      attendance: 'NOT_GOING',
    }),
  };
}

describe('open Match behavior seams', () => {
  it('uses the registration endpoints that correspond to each own-attendance choice', async () => {
    const api = participationApi();

    await updateOwnAttendance(api, ids.match, ids.current, 'GOING');
    expect(api.registerGoing).toHaveBeenCalledWith(ids.match);

    await updateOwnAttendance(api, ids.match, ids.current, 'NOT_GOING');
    expect(api.updateParticipant).toHaveBeenCalledWith(
      ids.match,
      ids.current,
      'NOT_GOING',
    );

    await updateOwnAttendance(api, ids.match, ids.current, null);
    expect(api.removeRegistration).toHaveBeenCalledWith(ids.match);
  });

  it('adds an unanswered Player when an administrator marks them GOING and patches other changes', async () => {
    const api = participationApi();
    const match = openMatch();

    await updateAttendanceAsAdministrator(api, match, ids.other, 'GOING');
    expect(api.addParticipant).toHaveBeenCalledWith(ids.match, {
      playerId: ids.other,
    });

    await updateAttendanceAsAdministrator(api, match, ids.other, 'NOT_GOING');
    expect(api.updateParticipant).toHaveBeenCalledWith(
      ids.match,
      ids.other,
      'NOT_GOING',
    );
  });

  it('creates a guest with the current name and ratings', async () => {
    const api = participationApi();
    const guest = { ...emptyGuestDraft(), name: 'Guest Pat' };

    await createGuestParticipant(api, ids.match, guest);

    expect(api.addParticipant).toHaveBeenCalledWith(ids.match, { guest });
  });

  it('accepts a current generated proposal and rejects one made stale by attendance', async () => {
    const current = openMatch({
      participants: {
        going: [player(ids.current, 'Ada'), player(ids.other, 'Ben')],
        notGoing: [],
        unanswered: [],
      },
    });
    const getMatch = vi.fn().mockResolvedValue(current);
    const api = {
      generateTeams: vi.fn(),
      getMatch,
      startMatch: vi.fn(),
    };

    await expect(
      resolveGeneratedProposal(api, current, teamProposal()),
    ).resolves.toMatchObject({
      status: 'READY',
      proposal: { matchStateVersion: 4 },
    });

    getMatch.mockResolvedValueOnce({ ...current, stateVersion: 5 });
    await expect(
      resolveGeneratedProposal(api, current, teamProposal()),
    ).resolves.toMatchObject({ status: 'STALE', match: { stateVersion: 5 } });
  });

  it('starts with the exact edited teams and proposal receipt, and rejects invalid proposals locally', async () => {
    const match = openMatch({
      participants: {
        going: [player(ids.current, 'Ada'), player(ids.other, 'Ben')],
        notGoing: [],
        unanswered: [],
      },
    });
    const resolved = await resolveGeneratedProposal(
      {
        generateTeams: vi.fn(),
        getMatch: vi.fn().mockResolvedValue(match),
        startMatch: vi.fn(),
      },
      match,
      teamProposal(),
    );
    expect(resolved.status).toBe('READY');
    if (resolved.status !== 'READY') return;
    const api = {
      generateTeams: vi.fn(),
      getMatch: vi.fn(),
      startMatch: vi.fn().mockResolvedValue({
        ...match,
        status: 'IN_PROGRESS',
      }),
    };

    await startMatchWithProposal(api, match, resolved.proposal);
    expect(api.startMatch).toHaveBeenCalledWith(ids.match, {
      teamAPlayerIds: [ids.current],
      teamBPlayerIds: [ids.other],
      proposalReceipt: 'receipt',
    });
    await expect(startMatchWithProposal(api, match, null)).rejects.toThrow(
      'generated proposal',
    );
  });

  it('delegates cancellation and keeps API errors localized at the seam', async () => {
    const cancelled = openMatch({ status: 'CANCELLED' });
    const cancelMatch = vi.fn().mockResolvedValue(cancelled);

    await expect(cancelOpenMatch({ cancelMatch }, ids.match)).resolves.toEqual(
      cancelled,
    );
    expect(cancelMatch).toHaveBeenCalledWith(ids.match);
    expect(
      shouldRefreshAfterCancellationError(
        new ApiClientError(409, 'CONCURRENT_STATE_CHANGE', 'technical'),
      ),
    ).toBe(true);
    expect(
      shouldRefreshAfterCancellationError(
        new ApiClientError(500, 'INTERNAL', 'technical'),
      ),
    ).toBe(false);
    expect(
      openMatchErrorFeedback(
        new ApiClientError(409, 'CONCURRENT_STATE_CHANGE', 'technical'),
        'fallback',
        i18n.getFixedT('en'),
      ).text,
    ).toBe('The Match changed. Refresh and try again.');
  });
});

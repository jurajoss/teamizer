import { describe, expect, it } from 'vitest';

import type { MatchDetail, TeamProposal } from '../api/contracts';
import {
  canMovePlayer,
  canShowAdminMatchControls,
  canSubmitStart,
  createTransientProposal,
  isMatchReadOnly,
  isStaleProposalConflict,
  movePlayer,
  matchRouteFor,
  primaryUpcomingMatch,
  proposalWasAdjusted,
  reconcileProposal,
  swapPlayers,
  validateParticipantGroups,
  validateProposal,
} from './match-flow';

const ids = {
  match: '00000000-0000-4000-8000-000000000001',
  sport: '00000000-0000-4000-8000-000000000002',
  a: '00000000-0000-4000-8000-000000000010',
  b: '00000000-0000-4000-8000-000000000011',
  c: '00000000-0000-4000-8000-000000000012',
  d: '00000000-0000-4000-8000-000000000013',
};

const player = (
  id: string,
  name: string,
  type: 'REGULAR' | 'GUEST' = 'REGULAR',
) => ({
  id,
  name,
  type,
  status: 'ACTIVE' as const,
  avatarUrl: null,
});

function openMatch(): MatchDetail {
  return {
    id: ids.match,
    sport: {
      id: ids.sport,
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 3,
    },
    startsAt: '2026-08-30T16:30:00.000Z',
    location: 'Pitch A',
    status: 'OPEN_FOR_REGISTRATION',
    stateVersion: 3,
    myAttendance: 'GOING',
    participants: {
      going: [player(ids.a, 'Ada'), player(ids.b, 'Ben'), player(ids.c, 'Cy')],
      notGoing: [player(ids.d, 'Guest Dee', 'GUEST')],
      unanswered: [],
    },
    teams: null,
    provenance: null,
    result: null,
  };
}

function response(a = [ids.a, ids.b], b = [ids.c]): TeamProposal {
  return {
    teamAPlayerIds: a,
    teamBPlayerIds: b,
    balance: { balanceScore: 0.01, historyScore: 0.2 },
    algorithmVersion: 'v1',
    configurationVersion: 'v1',
    proposalReceipt: 'signed-receipt',
  };
}

describe('Match flow state', () => {
  it('prioritizes an active Match and represents the empty state', () => {
    const summary = {
      ...openMatch(),
      participants: undefined,
      teams: undefined,
      provenance: undefined,
      result: undefined,
    };
    expect(primaryUpcomingMatch([summary])).toMatchObject({ id: ids.match });
    expect(
      primaryUpcomingMatch([
        summary,
        {
          ...summary,
          id: ids.b,
          status: 'IN_PROGRESS',
          startsAt: '2026-08-29T16:30:00.000Z',
        },
      ]),
    ).toMatchObject({ id: ids.b, status: 'IN_PROGRESS' });
    expect(primaryUpcomingMatch([])).toBeNull();
    expect(matchRouteFor(ids.match)).toBe(`/matches/${ids.match}`);
  });

  it('rejects duplicate participant data while preserving guest identity', () => {
    const match = openMatch();
    expect(validateParticipantGroups(match)).toMatchObject({ valid: true });
    match.participants.unanswered.push(player(ids.a, 'Duplicate'));
    expect(validateParticipantGroups(match)).toMatchObject({ valid: false });
    expect(match.participants.notGoing[0]).not.toHaveProperty('attributes');
    expect(match.participants.notGoing[0]?.type).toBe('GUEST');
  });

  it('accepts exactly all GOING players once and rejects malformed proposals', () => {
    const match = openMatch();
    const proposal = createTransientProposal(match, response());
    expect(validateProposal(match, proposal)).toEqual({ valid: true });
    expect(() =>
      createTransientProposal(match, response([ids.a, ids.b], [ids.b])),
    ).toThrow('appears in both teams');
    expect(() =>
      createTransientProposal(match, response([ids.a], [ids.b])),
    ).toThrow('Every going player');
  });

  it('moves in either direction only when teams stay non-empty and balanced', () => {
    const match = openMatch();
    const proposal = createTransientProposal(match, response());
    expect(canMovePlayer(proposal, ids.a)).toBe(true);
    const moved = movePlayer(proposal, ids.a);
    expect(moved.teamAPlayerIds).toEqual([ids.b]);
    expect(moved.teamBPlayerIds).toEqual([ids.c, ids.a]);
    expect(canMovePlayer(moved, ids.c)).toBe(true);
    expect(movePlayer(moved, ids.c).teamAPlayerIds).toEqual([ids.b, ids.c]);
    expect(canMovePlayer(moved, ids.b)).toBe(false);
  });

  it('supports deterministic swaps without duplicates or size changes', () => {
    const match = openMatch();
    const proposal = createTransientProposal(match, response());
    const swapped = swapPlayers(proposal, ids.a, ids.c);
    expect(swapped.teamAPlayerIds).toEqual([ids.c, ids.b]);
    expect(swapped.teamBPlayerIds).toEqual([ids.a]);
    expect(validateProposal(match, swapped)).toEqual({ valid: true });
    expect(swapPlayers(proposal, ids.a, ids.b)).toBe(proposal);
  });

  it('tracks algorithm versus adjusted membership using mirrored canonical teams', () => {
    const proposal = createTransientProposal(openMatch(), response());
    expect(proposalWasAdjusted(proposal)).toBe(false);
    expect(
      proposalWasAdjusted({
        ...proposal,
        teamAPlayerIds: proposal.teamBPlayerIds,
        teamBPlayerIds: proposal.teamAPlayerIds,
      }),
    ).toBe(false);
    expect(proposalWasAdjusted(movePlayer(proposal, ids.a))).toBe(true);
  });

  it('invalidates transient proposals on attendance version or lifecycle changes', () => {
    const match = openMatch();
    const proposal = createTransientProposal(match, response());
    expect(reconcileProposal(proposal, match)).toBe(proposal);
    expect(
      reconcileProposal(proposal, { ...match, stateVersion: 4 }),
    ).toBeNull();
    expect(
      reconcileProposal(proposal, { ...match, status: 'IN_PROGRESS' }),
    ).toBeNull();
  });

  it('allows one valid Start submission and recognizes only stale 409 conflicts', () => {
    const match = openMatch();
    const proposal = createTransientProposal(match, response());
    expect(canSubmitStart(match, proposal, false)).toBe(true);
    expect(canSubmitStart(match, proposal, true)).toBe(false);
    expect(canSubmitStart(match, null, false)).toBe(false);
    expect(
      isStaleProposalConflict({
        status: 409,
        code: 'CONCURRENT_STATE_CHANGE',
      }),
    ).toBe(true);
    expect(
      isStaleProposalConflict({
        status: 409,
        code: 'PROPOSAL_RECEIPT_INVALID',
      }),
    ).toBe(true);
    expect(
      isStaleProposalConflict({
        status: 422,
        code: 'INVALID_TEAM_COMPOSITION',
      }),
    ).toBe(false);
    expect(
      isStaleProposalConflict({ status: 500, code: 'MATCH_NOT_OPEN' }),
    ).toBe(false);
  });

  it('keeps admin controls pre-start only and later lifecycle states read-only', () => {
    expect(canShowAdminMatchControls('PLAYER', 'OPEN_FOR_REGISTRATION')).toBe(
      false,
    );
    expect(canShowAdminMatchControls('ADMIN', 'OPEN_FOR_REGISTRATION')).toBe(
      true,
    );
    expect(canShowAdminMatchControls('ADMIN', 'IN_PROGRESS')).toBe(false);
    expect(isMatchReadOnly('OPEN_FOR_REGISTRATION')).toBe(false);
    expect(isMatchReadOnly('IN_PROGRESS')).toBe(true);
    expect(isMatchReadOnly('FINISHED')).toBe(true);
    expect(isMatchReadOnly('CANCELLED')).toBe(true);
  });
});

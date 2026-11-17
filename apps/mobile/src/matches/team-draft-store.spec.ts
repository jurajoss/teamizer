import { describe, expect, it } from 'vitest';

import type { MatchDetail } from '../api/contracts';
import type { TransientTeamProposal } from './match-flow';
import {
  createTeamDraft,
  createTeamDraftStore,
  isTeamDraftValidForMatch,
  isTeamDraftStale,
  sameParticipantSet,
} from './team-draft-store';

const ids = {
  a: '00000000-0000-4000-8000-000000000001',
  b: '00000000-0000-4000-8000-000000000002',
  c: '00000000-0000-4000-8000-000000000003',
};

function proposal(): TransientTeamProposal {
  return {
    matchStateVersion: 2,
    generatedTeamAPlayerIds: [ids.a],
    generatedTeamBPlayerIds: [ids.b],
    teamAPlayerIds: [ids.a],
    teamBPlayerIds: [ids.b],
    balance: { balanceScore: 0.1, historyScore: 0.2 },
    algorithmVersion: 'v1',
    configurationVersion: 'v1',
    proposalReceipt: 'receipt',
  };
}

describe('local team-draft lifecycle', () => {
  it('stores a first generated proposal by Match without persistence middleware', () => {
    const store = createTeamDraftStore();
    const draft = createTeamDraft(proposal(), [ids.a, ids.b]);

    store.getState().setDraft('match-1', draft);

    expect(store.getState().draftsByMatchId['match-1']).toMatchObject({
      source: 'GENERATED',
      teamAPlayerIds: [ids.a],
      teamBPlayerIds: [ids.b],
    });
    expect(store).not.toHaveProperty('persist');
  });

  it('preserves generated and manually edited proposals across consumers', () => {
    const store = createTeamDraftStore();
    const generated = createTeamDraft(proposal(), [ids.a, ids.b]);
    store.getState().setDraft('match-1', generated);
    const firstRead = store.getState().draftsByMatchId['match-1'];

    store.getState().setDraft('match-1', {
      ...generated,
      source: 'MANUAL',
      teamAPlayerIds: [ids.b],
      teamBPlayerIds: [ids.a],
    });
    const secondRead = store.getState().draftsByMatchId['match-1'];

    expect(firstRead?.source).toBe('GENERATED');
    expect(secondRead).toMatchObject({
      source: 'MANUAL',
      teamAPlayerIds: [ids.b],
      teamBPlayerIds: [ids.a],
    });
  });

  it('compares participant snapshots as sets rather than array order', () => {
    const draft = createTeamDraft(proposal(), [ids.a, ids.b]);

    expect(sameParticipantSet([ids.a, ids.b], [ids.b, ids.a])).toBe(true);
    expect(isTeamDraftStale(draft, [ids.b, ids.a])).toBe(false);
  });

  it('marks added and removed participants stale without deleting the draft', () => {
    const store = createTeamDraftStore();
    const draft = createTeamDraft(proposal(), [ids.a, ids.b]);
    store.getState().setDraft('match-1', draft);

    expect(isTeamDraftStale(draft, [ids.a, ids.b, ids.c])).toBe(true);
    expect(isTeamDraftStale(draft, [ids.a])).toBe(true);
    expect(store.getState().draftsByMatchId['match-1']).toBeDefined();
  });

  it('prevents client-side Start while the participant snapshot is stale', () => {
    const draft = createTeamDraft(proposal(), [ids.a, ids.b]);

    expect(isTeamDraftValidForMatch(draft, match([ids.a, ids.b, ids.c]))).toBe(
      false,
    );
    expect(isTeamDraftValidForMatch(draft, match([ids.b, ids.a]))).toBe(true);
  });

  it('can force a stale state after a server race while preserving membership', () => {
    const store = createTeamDraftStore();
    const draft = createTeamDraft(proposal(), [ids.a, ids.b]);
    store.getState().setDraft('match-1', draft);

    store.getState().markStale('match-1');

    const stale = store.getState().draftsByMatchId['match-1'];
    expect(stale?.forcedStale).toBe(true);
    expect(stale?.teamAPlayerIds).toEqual([ids.a]);
    expect(stale?.teamBPlayerIds).toEqual([ids.b]);
  });

  it('replacing a stale draft updates the snapshot and clears stale state', () => {
    const store = createTeamDraftStore();
    const stale = createTeamDraft(proposal(), [ids.a, ids.b]);
    store.getState().setDraft('match-1', stale);
    store.getState().markStale('match-1');

    const replacement = createTeamDraft(
      {
        ...proposal(),
        teamAPlayerIds: [ids.a, ids.c],
      },
      [ids.a, ids.b, ids.c],
    );
    store.getState().setDraft('match-1', replacement);

    const current = store.getState().draftsByMatchId['match-1'];
    expect(current?.participantSnapshotIds).toEqual([ids.a, ids.b, ids.c]);
    expect(current?.forcedStale).toBe(false);
  });
});

function match(goingIds: string[]): MatchDetail {
  return {
    id: '00000000-0000-4000-8000-000000000010',
    sport: {
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 3,
    },
    startsAt: '2026-09-29T18:00:00.000Z',
    location: null,
    status: 'OPEN_FOR_REGISTRATION',
    stateVersion: 2,
    myAttendance: 'GOING',
    participants: {
      going: goingIds.map((id) => ({
        id,
        name: id,
        avatarUrl: null,
        status: 'ACTIVE' as const,
        type: 'REGULAR' as const,
      })),
      notGoing: [],
      unanswered: [],
    },
    teams: null,
    provenance: null,
    result: null,
  };
}

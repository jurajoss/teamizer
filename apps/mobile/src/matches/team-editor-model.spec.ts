import { describe, expect, it } from 'vitest';

import type { MatchDetail } from '../api/contracts';
import type { TransientTeamProposal } from './match-flow';
import {
  applyEditorProposal,
  applyTeamDrop,
  beginTeamDrag,
  cancelTeamDrag,
  completeTeamDrag,
  reconcileEditorProposal,
  sameTeamDistribution,
  shouldConfirmEditorExit,
  teamEditorLayoutModel,
  updateTeamDragHover,
  validEmptySlotSide,
} from './team-editor-model';
import { createTeamDraft } from './team-draft-store';

const ids = {
  match: '00000000-0000-4000-8000-000000000001',
  sport: '00000000-0000-4000-8000-000000000002',
  a: '00000000-0000-4000-8000-000000000010',
  b: '00000000-0000-4000-8000-000000000011',
  c: '00000000-0000-4000-8000-000000000012',
  d: '00000000-0000-4000-8000-000000000013',
  e: '00000000-0000-4000-8000-000000000014',
  f: '00000000-0000-4000-8000-000000000015',
  g: '00000000-0000-4000-8000-000000000016',
};

function proposal(
  teamAPlayerIds = [ids.a, ids.b, ids.c, ids.d],
  teamBPlayerIds = [ids.e, ids.f, ids.g],
): TransientTeamProposal {
  return {
    matchStateVersion: 2,
    generatedTeamAPlayerIds: [...teamAPlayerIds],
    generatedTeamBPlayerIds: [...teamBPlayerIds],
    teamAPlayerIds: [...teamAPlayerIds],
    teamBPlayerIds: [...teamBPlayerIds],
    balance: { balanceScore: 0.1, historyScore: 0.2 },
    algorithmVersion: 'v1',
    configurationVersion: 'v1',
    proposalReceipt: 'receipt',
  };
}

describe('team editor operations', () => {
  it('models two side-by-side teams with a player-tile-sized odd slot and drag grip', () => {
    expect(teamEditorLayoutModel(proposal())).toEqual({
      columns: [
        { side: 'A', playerIds: [ids.a, ids.b, ids.c, ids.d] },
        { side: 'B', playerIds: [ids.e, ids.f, ids.g] },
      ],
      emptySlot: { side: 'B', geometry: 'PLAYER_TILE' },
      playerAffordance: 'DRAG_GRIP',
      activeDrag: {
        representation: 'FLOATING_OVERLAY',
        source: 'PLACEHOLDER',
        positionOwner: 'ANIMATED_VALUE',
      },
    });
  });

  it('performs an atomic cross-team player swap', () => {
    const original = proposal();
    const result = applyTeamDrop(original, ids.b, {
      kind: 'player',
      playerId: ids.f,
    });

    expect(result.operation).toBe('SWAP');
    expect(result.proposal.teamAPlayerIds).toEqual([
      ids.a,
      ids.f,
      ids.c,
      ids.d,
    ]);
    expect(result.proposal.teamBPlayerIds).toEqual([ids.e, ids.b, ids.g]);
  });

  it('keeps team arrays unchanged while drag and hover state change', () => {
    const original = proposal();
    const teamA = [...original.teamAPlayerIds];
    const teamB = [...original.teamBPlayerIds];
    const started = beginTeamDrag(ids.b);
    const hovering = updateTeamDragHover(started, {
      kind: 'player',
      playerId: ids.f,
    });

    expect(started).toEqual({ draggedPlayerId: ids.b, hoveredTarget: null });
    expect(hovering.hoveredTarget).toEqual({
      kind: 'player',
      playerId: ids.f,
    });
    expect(original.teamAPlayerIds).toEqual(teamA);
    expect(original.teamBPlayerIds).toEqual(teamB);
  });

  it('commits a valid player swap only when the drag completes', () => {
    const original = proposal();
    const session = updateTeamDragHover(beginTeamDrag(ids.b), {
      kind: 'player',
      playerId: ids.f,
    });
    const completion = completeTeamDrag(original, session);

    expect(completion.session).toBeNull();
    expect(completion.result.operation).toBe('SWAP');
    expect(completion.result.proposal.teamAPlayerIds).toEqual([
      ids.a,
      ids.f,
      ids.c,
      ids.d,
    ]);
    expect(completion.result.proposal.teamBPlayerIds).toEqual([
      ids.e,
      ids.b,
      ids.g,
    ]);
  });

  it('does nothing for a same-team drop and never reorders', () => {
    const original = proposal();
    const result = applyTeamDrop(original, ids.a, {
      kind: 'player',
      playerId: ids.c,
    });

    expect(result).toEqual({ proposal: original, operation: 'NONE' });
  });

  it('moves only the odd extra player into the tile-sized free-slot side', () => {
    const original = proposal();
    expect(validEmptySlotSide(original)).toBe('B');

    const result = applyTeamDrop(original, ids.d, {
      kind: 'empty-slot',
      side: 'B',
    });

    expect(result.operation).toBe('MOVE');
    expect(result.proposal.teamAPlayerIds).toHaveLength(3);
    expect(result.proposal.teamBPlayerIds).toHaveLength(4);
  });

  it('commits an odd-player move only after a valid empty-slot drop', () => {
    const original = proposal();
    const session = updateTeamDragHover(beginTeamDrag(ids.d), {
      kind: 'empty-slot',
      side: 'B',
    });
    const completion = completeTeamDrag(original, session);

    expect(completion.session).toBeNull();
    expect(completion.result.operation).toBe('MOVE');
    expect(completion.result.proposal.teamAPlayerIds).toHaveLength(3);
    expect(completion.result.proposal.teamBPlayerIds).toHaveLength(4);
  });

  it('rejects a move from the smaller side that would create 2:5', () => {
    const original = proposal();
    const result = applyTeamDrop(original, ids.e, {
      kind: 'empty-slot',
      side: 'A',
    });

    expect(result).toEqual({ proposal: original, operation: 'NONE' });
  });

  it('cleans drag state without changing teams after invalid drop or cancellation', () => {
    const original = proposal();
    const sameTeam = completeTeamDrag(
      original,
      updateTeamDragHover(beginTeamDrag(ids.a), {
        kind: 'player',
        playerId: ids.c,
      }),
    );
    const invalidSlot = completeTeamDrag(
      original,
      updateTeamDragHover(beginTeamDrag(ids.e), {
        kind: 'empty-slot',
        side: 'A',
      }),
    );
    const noTarget = completeTeamDrag(original, beginTeamDrag(ids.a));
    const cancelled = cancelTeamDrag(original);

    for (const completion of [sameTeam, invalidSlot, noTarget, cancelled]) {
      expect(completion.session).toBeNull();
      expect(completion.result).toEqual({
        proposal: original,
        operation: 'NONE',
      });
    }
  });

  it('keeps unapplied editor changes separate from the applied store draft', () => {
    const applied = createTeamDraft(proposal(), Object.values(ids).slice(2));
    const edited = applyTeamDrop(applied, ids.b, {
      kind: 'player',
      playerId: ids.f,
    }).proposal;

    expect(sameTeamDistribution(applied, edited)).toBe(false);
    expect(applied.teamAPlayerIds).toContain(ids.b);
    expect(applied.teamBPlayerIds).toContain(ids.f);
    expect(shouldConfirmEditorExit(applied, edited)).toBe(true);
    expect(shouldConfirmEditorExit(applied, applied)).toBe(false);
  });

  it('reconciles a stale working copy while leaving the applied draft intact', () => {
    const applied = createTeamDraft(
      proposal([ids.a, ids.b], [ids.c]),
      [ids.a, ids.b, ids.c],
      'MANUAL',
    );
    const fresh = proposal([ids.a, ids.d], [ids.b]);

    const working = reconcileEditorProposal(applied, fresh, [
      ids.a,
      ids.b,
      ids.d,
    ]);

    expect(
      [...working.teamAPlayerIds, ...working.teamBPlayerIds].sort(),
    ).toEqual([ids.a, ids.b, ids.d].sort());
    expect(applied.teamAPlayerIds).toEqual([ids.a, ids.b]);
    expect(applied.teamBPlayerIds).toEqual([ids.c]);
  });

  it('applies only an exact valid distribution and updates its snapshot', () => {
    const current = match([ids.a, ids.b, ids.c]);
    const valid = proposal([ids.a, ids.b], [ids.c]);
    const applied = applyEditorProposal(valid, current);

    expect(applied).toMatchObject({
      source: 'MANUAL',
      participantSnapshotIds: [ids.a, ids.b, ids.c],
      forcedStale: false,
    });
    expect(applyEditorProposal(proposal([ids.a], [ids.c]), current)).toBeNull();
  });
});

function match(goingIds: string[]): MatchDetail {
  return {
    id: ids.match,
    sport: {
      id: ids.sport,
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 3,
    },
    startsAt: '2026-09-29T18:00:00.000Z',
    location: 'Pitch',
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

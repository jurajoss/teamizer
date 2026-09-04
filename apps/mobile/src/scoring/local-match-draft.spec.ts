import { describe, expect, it } from 'vitest';

import {
  canonicalCompletionPayload,
  completionRequest,
  createLocalMatchDraft,
  draftMatchesServer,
  localMatchDraftV1Schema,
  updatePlayerGoal,
} from './local-match-draft';
import { ids, inProgressMatch } from './scoring-test-fixtures';

const initialTime = '2026-08-28T18:00:00.000Z';

describe('LocalMatchDraftV1', () => {
  it('creates a zero draft with every immutable final player', () => {
    const draft = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      initialTime,
    );

    expect(draft.score).toEqual({ teamA: 0, teamB: 0 });
    expect(draft.playerGoals).toEqual({
      [ids.playerA]: 0,
      [ids.playerB]: 0,
      [ids.playerC]: 0,
      [ids.playerD]: 0,
    });
    expect(draft.completion).toEqual({
      state: 'ACTIVE',
      idempotencyKey: null,
      canonicalRequestHash: null,
    });
  });

  it('updates the player aggregate and correct team score together', () => {
    const original = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      initialTime,
    );
    const teamA = updatePlayerGoal(
      original,
      ids.playerA,
      1,
      '2026-08-28T18:01:00.000Z',
    );
    const teamB = updatePlayerGoal(
      teamA,
      ids.playerC,
      1,
      '2026-08-28T18:02:00.000Z',
    );

    expect(teamB.score).toEqual({ teamA: 1, teamB: 1 });
    expect(teamB.playerGoals[ids.playerA]).toBe(1);
    expect(teamB.playerGoals[ids.playerC]).toBe(1);
  });

  it('never decrements a player or team below zero', () => {
    const draft = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      initialTime,
    );

    expect(
      updatePlayerGoal(draft, ids.playerA, -1, '2026-08-28T18:01:00.000Z'),
    ).toBe(draft);
  });

  it('decrement reverses both a player aggregate and the correct side score', () => {
    const draft = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      initialTime,
    );
    const incremented = updatePlayerGoal(
      draft,
      ids.playerD,
      1,
      '2026-08-28T18:01:00.000Z',
    );
    const decremented = updatePlayerGoal(
      incremented,
      ids.playerD,
      -1,
      '2026-08-28T18:02:00.000Z',
    );

    expect(decremented.score).toEqual({ teamA: 0, teamB: 0 });
    expect(decremented.playerGoals[ids.playerD]).toBe(0);
  });

  it('aggregates multiple players on the same persisted side', () => {
    const original = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      initialTime,
    );
    const first = updatePlayerGoal(
      original,
      ids.playerA,
      1,
      '2026-08-28T18:01:00.000Z',
    );
    const second = updatePlayerGoal(
      first,
      ids.playerB,
      1,
      '2026-08-28T18:02:00.000Z',
    );

    expect(second.score.teamA).toBe(2);
    expect(second.playerGoals).toMatchObject({
      [ids.playerA]: 1,
      [ids.playerB]: 1,
    });
  });

  it('rejects a goal for a Player missing from persisted final teams', () => {
    const draft = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      initialTime,
    );

    expect(() =>
      updatePlayerGoal(
        draft,
        '00000000-0000-4000-8000-000000000099',
        1,
        '2026-08-28T18:01:00.000Z',
      ),
    ).toThrow(/final-team players/);
  });

  it('rejects aggregate state whose player goals and side scores diverge', () => {
    const draft = createLocalMatchDraft(
      ids.userA,
      inProgressMatch(),
      initialTime,
    );

    expect(
      localMatchDraftV1Schema.safeParse({
        ...draft,
        playerGoals: { ...draft.playerGoals, [ids.playerA]: 2 },
      }).success,
    ).toBe(false);
  });

  it('builds a sparse API body but a normalized deterministic fingerprint payload', () => {
    const draft = updatePlayerGoal(
      createLocalMatchDraft(ids.userA, inProgressMatch(), initialTime),
      ids.playerC,
      1,
      '2026-08-28T18:01:00.000Z',
    );

    expect(completionRequest(draft).playerGoals).toEqual([
      { playerId: ids.playerC, goals: 1 },
    ]);
    expect(JSON.parse(canonicalCompletionPayload(draft))).toEqual({
      score: { teamA: 0, teamB: 1 },
      playerGoals: [
        { playerId: ids.playerA, goals: 0 },
        { playerId: ids.playerB, goals: 0 },
        { playerId: ids.playerC, goals: 1 },
        { playerId: ids.playerD, goals: 0 },
      ],
    });
  });

  it('binds restoration to owner, Match state version, and canonical teams', () => {
    const match = inProgressMatch();
    const draft = createLocalMatchDraft(ids.userA, match, initialTime);

    expect(draftMatchesServer(draft, ids.userA, match)).toBe(true);
    expect(draftMatchesServer(draft, ids.userB, match)).toBe(false);
    expect(
      draftMatchesServer(draft, ids.userA, {
        ...match,
        stateVersion: match.stateVersion + 1,
      }),
    ).toBe(false);
    expect(
      draftMatchesServer(draft, ids.userA, {
        ...match,
        id: '00000000-0000-4000-8000-000000000011',
      }),
    ).toBe(false);
    expect(
      draftMatchesServer(draft, ids.userA, {
        ...match,
        teams:
          match.teams?.map((team) =>
            team.side === 'A'
              ? { ...team, players: team.players.slice(0, 1) }
              : team,
          ) ?? null,
      }),
    ).toBe(false);
  });
});

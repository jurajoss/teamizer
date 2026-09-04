import { z } from 'zod';

import type { CompleteMatchInput, MatchDetail } from '../api/contracts';

const teamSnapshotSchema = z
  .object({
    id: z.uuid(),
    playerIds: z.array(z.uuid()).min(1),
  })
  .strict();

const completionSchema = z
  .object({
    state: z.enum(['ACTIVE', 'PENDING', 'SUCCEEDED', 'CONFLICTED']),
    idempotencyKey: z.string().min(8).max(255).nullable(),
    canonicalRequestHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict();

export const localMatchDraftV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    userId: z.uuid(),
    matchId: z.uuid(),
    matchStateVersion: z.number().int().nonnegative(),
    teams: z
      .object({
        teamA: teamSnapshotSchema,
        teamB: teamSnapshotSchema,
      })
      .strict(),
    score: z
      .object({
        teamA: z.number().int().nonnegative(),
        teamB: z.number().int().nonnegative(),
      })
      .strict(),
    playerGoals: z.record(z.uuid(), z.number().int().nonnegative()),
    completion: completionSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((draft, context) => {
    const teamAIds = [...draft.teams.teamA.playerIds];
    const teamBIds = [...draft.teams.teamB.playerIds];
    const allPlayerIds = [...teamAIds, ...teamBIds];
    const uniquePlayerIds = new Set(allPlayerIds);

    if (uniquePlayerIds.size !== allPlayerIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'A final player must belong to exactly one local team.',
        path: ['teams'],
      });
    }

    if (draft.teams.teamA.id === draft.teams.teamB.id) {
      context.addIssue({
        code: 'custom',
        message: 'Final teams must have different IDs.',
        path: ['teams'],
      });
    }

    const goalPlayerIds = Object.keys(draft.playerGoals).sort();
    const expectedPlayerIds = [...uniquePlayerIds].sort();

    if (
      goalPlayerIds.length !== expectedPlayerIds.length ||
      goalPlayerIds.some(
        (playerId, index) => playerId !== expectedPlayerIds[index],
      )
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'Player goal totals must contain every final player exactly once.',
        path: ['playerGoals'],
      });
    }

    const teamAScore = teamAIds.reduce(
      (total, playerId) => total + (draft.playerGoals[playerId] ?? 0),
      0,
    );
    const teamBScore = teamBIds.reduce(
      (total, playerId) => total + (draft.playerGoals[playerId] ?? 0),
      0,
    );

    if (teamAScore !== draft.score.teamA || teamBScore !== draft.score.teamB) {
      context.addIssue({
        code: 'custom',
        message: 'Team scores must equal their players’ aggregate goals.',
        path: ['score'],
      });
    }

    const hasCompleteAttempt =
      draft.completion.idempotencyKey !== null &&
      draft.completion.canonicalRequestHash !== null;
    const hasAnyAttempt =
      draft.completion.idempotencyKey !== null ||
      draft.completion.canonicalRequestHash !== null;

    if (draft.completion.state === 'ACTIVE' && hasAnyAttempt) {
      context.addIssue({
        code: 'custom',
        message: 'An active draft cannot retain a completion attempt.',
        path: ['completion'],
      });
    }

    if (draft.completion.state !== 'ACTIVE' && !hasCompleteAttempt) {
      context.addIssue({
        code: 'custom',
        message: 'A non-active draft must retain its completion attempt.',
        path: ['completion'],
      });
    }
  });

export type LocalMatchDraftV1 = z.infer<typeof localMatchDraftV1Schema>;
export type FinalTeamSnapshot = LocalMatchDraftV1['teams'];

export class ScoringDomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ScoringDomainError';
  }
}

export function finalTeamSnapshot(match: MatchDetail): FinalTeamSnapshot {
  if (match.status !== 'IN_PROGRESS' || !match.teams) {
    throw new ScoringDomainError(
      'MATCH_NOT_SCORABLE',
      'Local scoring requires an in-progress Match with final teams.',
    );
  }

  const teamA = match.teams.filter((team) => team.side === 'A');
  const teamB = match.teams.filter((team) => team.side === 'B');

  if (teamA.length !== 1 || teamB.length !== 1) {
    throw new ScoringDomainError(
      'INVALID_FINAL_TEAMS',
      'The Match does not contain exactly one final team per side.',
    );
  }

  const sideA = teamA[0];
  const sideB = teamB[0];

  if (
    !sideA ||
    !sideB ||
    sideA.players.length === 0 ||
    sideB.players.length === 0
  ) {
    throw new ScoringDomainError(
      'INVALID_FINAL_TEAMS',
      'Both final teams must contain at least one player.',
    );
  }

  const allPlayerIds = [
    ...sideA.players.map(({ id }) => id),
    ...sideB.players.map(({ id }) => id),
  ];

  if (new Set(allPlayerIds).size !== allPlayerIds.length) {
    throw new ScoringDomainError(
      'INVALID_FINAL_TEAMS',
      'A final player appears more than once.',
    );
  }

  return {
    teamA: {
      id: sideA.id,
      playerIds: sideA.players.map(({ id }) => id).sort(),
    },
    teamB: {
      id: sideB.id,
      playerIds: sideB.players.map(({ id }) => id).sort(),
    },
  };
}

export function createLocalMatchDraft(
  userId: string,
  match: MatchDetail,
  now: string,
): LocalMatchDraftV1 {
  const teams = finalTeamSnapshot(match);
  const playerGoals = Object.fromEntries(
    [...teams.teamA.playerIds, ...teams.teamB.playerIds].map((playerId) => [
      playerId,
      0,
    ]),
  );

  return localMatchDraftV1Schema.parse({
    schemaVersion: 1,
    userId,
    matchId: match.id,
    matchStateVersion: match.stateVersion,
    teams,
    score: { teamA: 0, teamB: 0 },
    playerGoals,
    completion: {
      state: 'ACTIVE',
      idempotencyKey: null,
      canonicalRequestHash: null,
    },
    createdAt: now,
    updatedAt: now,
  });
}

export function updatePlayerGoal(
  draft: LocalMatchDraftV1,
  playerId: string,
  delta: 1 | -1,
  now: string,
): LocalMatchDraftV1 {
  if (draft.completion.state !== 'ACTIVE') {
    throw new ScoringDomainError(
      'COMPLETION_PENDING',
      'The score is locked while completion is pending.',
    );
  }

  const currentGoals = draft.playerGoals[playerId];

  if (currentGoals === undefined) {
    throw new ScoringDomainError(
      'PLAYER_NOT_IN_FINAL_TEAMS',
      'Only final-team players can receive goals.',
    );
  }

  const nextGoals = Math.max(0, currentGoals + delta);

  if (nextGoals === currentGoals) {
    return draft;
  }

  const side = draft.teams.teamA.playerIds.includes(playerId)
    ? 'teamA'
    : 'teamB';

  return localMatchDraftV1Schema.parse({
    ...draft,
    score: {
      ...draft.score,
      [side]: draft.score[side] + (nextGoals - currentGoals),
    },
    playerGoals: { ...draft.playerGoals, [playerId]: nextGoals },
    updatedAt: now,
  });
}

export function completionRequest(
  draft: LocalMatchDraftV1,
): CompleteMatchInput {
  return {
    score: { ...draft.score },
    playerGoals: Object.entries(draft.playerGoals)
      .filter(([, goals]) => goals > 0)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([playerId, goals]) => ({ playerId, goals })),
  };
}

export function canonicalCompletionPayload(draft: LocalMatchDraftV1): string {
  return JSON.stringify({
    score: { teamA: draft.score.teamA, teamB: draft.score.teamB },
    playerGoals: Object.entries(draft.playerGoals)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([playerId, goals]) => ({ playerId, goals })),
  });
}

export function withCompletionState(
  draft: LocalMatchDraftV1,
  completion: LocalMatchDraftV1['completion'],
  now: string,
): LocalMatchDraftV1 {
  return localMatchDraftV1Schema.parse({
    ...draft,
    completion,
    updatedAt: now,
  });
}

export function draftMatchesServer(
  draft: LocalMatchDraftV1,
  userId: string,
  match: MatchDetail,
): boolean {
  if (
    draft.userId !== userId ||
    draft.matchId !== match.id ||
    draft.matchStateVersion !== match.stateVersion
  ) {
    return false;
  }

  try {
    return (
      JSON.stringify(draft.teams) === JSON.stringify(finalTeamSnapshot(match))
    );
  } catch {
    return false;
  }
}

import type { MatchDetail } from '../api/contracts';
import {
  canMovePlayer,
  movePlayer,
  swapPlayers,
  type TransientTeamProposal,
} from './match-flow';
import {
  canonicalParticipantIds,
  createTeamDraft,
  sameParticipantSet,
  type TeamDraft,
} from './team-draft-store';

export type TeamSide = 'A' | 'B';

export type TeamDropTarget =
  { kind: 'player'; playerId: string } | { kind: 'empty-slot'; side: TeamSide };

export type TeamEditorDropResult = {
  proposal: TransientTeamProposal;
  operation: 'NONE' | 'SWAP' | 'MOVE';
};

export type TeamDragSession = {
  draggedPlayerId: string;
  hoveredTarget: TeamDropTarget | null;
};

export type TeamDragCompletion = {
  session: null;
  result: TeamEditorDropResult;
};

export type TeamEditorLayoutModel = {
  columns: readonly [
    { side: 'A'; playerIds: string[] },
    { side: 'B'; playerIds: string[] },
  ];
  emptySlot: { side: TeamSide; geometry: 'PLAYER_TILE' } | null;
  playerAffordance: 'DRAG_GRIP';
  activeDrag: {
    representation: 'FLOATING_OVERLAY';
    source: 'PLACEHOLDER';
    positionOwner: 'ANIMATED_VALUE';
  };
};

export function teamEditorLayoutModel(
  proposal: TransientTeamProposal,
): TeamEditorLayoutModel {
  const emptySide = validEmptySlotSide(proposal);
  return {
    columns: [
      { side: 'A', playerIds: [...proposal.teamAPlayerIds] },
      { side: 'B', playerIds: [...proposal.teamBPlayerIds] },
    ],
    emptySlot: emptySide ? { side: emptySide, geometry: 'PLAYER_TILE' } : null,
    playerAffordance: 'DRAG_GRIP',
    activeDrag: {
      representation: 'FLOATING_OVERLAY',
      source: 'PLACEHOLDER',
      positionOwner: 'ANIMATED_VALUE',
    },
  };
}

export function sideForPlayer(
  proposal: TransientTeamProposal,
  playerId: string,
): TeamSide | null {
  if (proposal.teamAPlayerIds.includes(playerId)) return 'A';
  if (proposal.teamBPlayerIds.includes(playerId)) return 'B';
  return null;
}

export function validEmptySlotSide(
  proposal: TransientTeamProposal,
): TeamSide | null {
  const difference =
    proposal.teamAPlayerIds.length - proposal.teamBPlayerIds.length;
  if (Math.abs(difference) !== 1) return null;
  return difference > 0 ? 'B' : 'A';
}

export function applyTeamDrop(
  proposal: TransientTeamProposal,
  draggedPlayerId: string,
  target: TeamDropTarget,
): TeamEditorDropResult {
  const sourceSide = sideForPlayer(proposal, draggedPlayerId);
  if (!sourceSide) return { proposal, operation: 'NONE' };

  if (target.kind === 'player') {
    const targetSide = sideForPlayer(proposal, target.playerId);
    if (!targetSide || targetSide === sourceSide) {
      return { proposal, operation: 'NONE' };
    }

    return {
      proposal: swapPlayers(proposal, draggedPlayerId, target.playerId),
      operation: 'SWAP',
    };
  }

  if (
    target.side === sourceSide ||
    validEmptySlotSide(proposal) !== target.side ||
    !canMovePlayer(proposal, draggedPlayerId)
  ) {
    return { proposal, operation: 'NONE' };
  }

  return {
    proposal: movePlayer(proposal, draggedPlayerId),
    operation: 'MOVE',
  };
}

export function beginTeamDrag(draggedPlayerId: string): TeamDragSession {
  return { draggedPlayerId, hoveredTarget: null };
}

export function updateTeamDragHover(
  session: TeamDragSession,
  hoveredTarget: TeamDropTarget | null,
): TeamDragSession {
  return { ...session, hoveredTarget };
}

export function completeTeamDrag(
  proposal: TransientTeamProposal,
  session: TeamDragSession,
): TeamDragCompletion {
  return {
    session: null,
    result: session.hoveredTarget
      ? applyTeamDrop(proposal, session.draggedPlayerId, session.hoveredTarget)
      : { proposal, operation: 'NONE' },
  };
}

export function cancelTeamDrag(
  proposal: TransientTeamProposal,
): TeamDragCompletion {
  return {
    session: null,
    result: { proposal, operation: 'NONE' },
  };
}

export function proposalContainsExactly(
  proposal: TransientTeamProposal,
  participantIds: readonly string[],
): boolean {
  const assigned = [...proposal.teamAPlayerIds, ...proposal.teamBPlayerIds];
  return (
    new Set(assigned).size === assigned.length &&
    sameParticipantSet(assigned, participantIds) &&
    proposal.teamAPlayerIds.length > 0 &&
    proposal.teamBPlayerIds.length > 0 &&
    Math.abs(proposal.teamAPlayerIds.length - proposal.teamBPlayerIds.length) <=
      1
  );
}

export function sameTeamDistribution(
  first: TransientTeamProposal,
  second: TransientTeamProposal,
): boolean {
  return (
    sameParticipantSet(first.teamAPlayerIds, second.teamAPlayerIds) &&
    sameParticipantSet(first.teamBPlayerIds, second.teamBPlayerIds)
  );
}

export function shouldConfirmEditorExit(
  baseline: TransientTeamProposal | null,
  working: TransientTeamProposal | null,
): boolean {
  return (
    baseline !== null &&
    working !== null &&
    !sameTeamDistribution(baseline, working)
  );
}

/**
 * Reconciles only the editor's temporary copy. Existing participants keep
 * their side where possible; new participants follow the fresh generated
 * proposal. The applied store draft is untouched until the user confirms.
 */
export function reconcileEditorProposal(
  appliedDraft: TeamDraft,
  freshProposal: TransientTeamProposal,
  currentParticipantIds: readonly string[],
): TransientTeamProposal {
  const current = new Set(currentParticipantIds);
  const freshSide = new Map<string, TeamSide>();
  for (const id of freshProposal.teamAPlayerIds) freshSide.set(id, 'A');
  for (const id of freshProposal.teamBPlayerIds) freshSide.set(id, 'B');

  const teamA = appliedDraft.teamAPlayerIds.filter((id) => current.has(id));
  const teamB = appliedDraft.teamBPlayerIds.filter((id) => current.has(id));
  const assigned = new Set([...teamA, ...teamB]);
  const missing = canonicalParticipantIds(currentParticipantIds).filter(
    (id) => !assigned.has(id),
  );

  const targetA = freshProposal.teamAPlayerIds.length;
  const targetB = freshProposal.teamBPlayerIds.length;

  while (teamA.length > targetA) {
    const moved = teamA.pop();
    if (moved) teamB.push(moved);
  }
  while (teamB.length > targetB) {
    const moved = teamB.pop();
    if (moved) teamA.push(moved);
  }

  for (const id of missing) {
    const preferred = freshSide.get(id);
    if (preferred === 'A' && teamA.length < targetA) teamA.push(id);
    else if (preferred === 'B' && teamB.length < targetB) teamB.push(id);
    else if (teamA.length < targetA) teamA.push(id);
    else teamB.push(id);
  }

  return {
    ...freshProposal,
    teamAPlayerIds: teamA,
    teamBPlayerIds: teamB,
  };
}

export function applyEditorProposal(
  proposal: TransientTeamProposal,
  match: MatchDetail,
): TeamDraft | null {
  const currentParticipantIds = match.participants.going.map(({ id }) => id);
  if (!proposalContainsExactly(proposal, currentParticipantIds)) return null;

  return createTeamDraft(proposal, currentParticipantIds, 'MANUAL');
}

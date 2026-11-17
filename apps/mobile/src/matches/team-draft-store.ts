import { useStore } from 'zustand';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { MatchDetail } from '../api/contracts';
import { validateProposal, type TransientTeamProposal } from './match-flow';

export type TeamDraftSource = 'GENERATED' | 'MANUAL';

export type TeamDraft = TransientTeamProposal & {
  participantSnapshotIds: string[];
  source: TeamDraftSource;
  forcedStale: boolean;
};

export type TeamDraftState = {
  draftsByMatchId: Record<string, TeamDraft | undefined>;
  setDraft(matchId: string, draft: TeamDraft): void;
  markStale(matchId: string): void;
  clearDraft(matchId: string): void;
};

export function canonicalParticipantIds(
  playerIds: readonly string[],
): string[] {
  return [...new Set(playerIds)].sort();
}

export function sameParticipantSet(
  first: readonly string[],
  second: readonly string[],
): boolean {
  const canonicalFirst = canonicalParticipantIds(first);
  const canonicalSecond = canonicalParticipantIds(second);

  return (
    canonicalFirst.length === canonicalSecond.length &&
    canonicalFirst.every((id, index) => id === canonicalSecond[index])
  );
}

export function createTeamDraft(
  proposal: TransientTeamProposal,
  participantIds: readonly string[],
  source: TeamDraftSource = 'GENERATED',
): TeamDraft {
  return {
    ...proposal,
    generatedTeamAPlayerIds: [...proposal.generatedTeamAPlayerIds],
    generatedTeamBPlayerIds: [...proposal.generatedTeamBPlayerIds],
    teamAPlayerIds: [...proposal.teamAPlayerIds],
    teamBPlayerIds: [...proposal.teamBPlayerIds],
    participantSnapshotIds: canonicalParticipantIds(participantIds),
    source,
    forcedStale: false,
  };
}

export function isTeamDraftStale(
  draft: TeamDraft,
  currentParticipantIds: readonly string[],
): boolean {
  return (
    draft.forcedStale ||
    !sameParticipantSet(draft.participantSnapshotIds, currentParticipantIds)
  );
}

export function isTeamDraftValidForMatch(
  draft: TeamDraft,
  match: MatchDetail,
): boolean {
  return (
    !isTeamDraftStale(
      draft,
      match.participants.going.map(({ id }) => id),
    ) && validateProposal(match, draft).valid
  );
}

export function createTeamDraftStore(): StoreApi<TeamDraftState> {
  return createStore<TeamDraftState>((set) => ({
    draftsByMatchId: {},
    setDraft: (matchId, draft) =>
      set((state) => ({
        draftsByMatchId: {
          ...state.draftsByMatchId,
          [matchId]: createTeamDraft(
            draft,
            draft.participantSnapshotIds,
            draft.source,
          ),
        },
      })),
    markStale: (matchId) =>
      set((state) => {
        const current = state.draftsByMatchId[matchId];
        if (!current || current.forcedStale) return state;

        return {
          draftsByMatchId: {
            ...state.draftsByMatchId,
            [matchId]: { ...current, forcedStale: true },
          },
        };
      }),
    clearDraft: (matchId) =>
      set((state) => {
        if (!state.draftsByMatchId[matchId]) return state;
        const draftsByMatchId = { ...state.draftsByMatchId };
        delete draftsByMatchId[matchId];
        return { draftsByMatchId };
      }),
  }));
}

export const teamDraftStore = createTeamDraftStore();

export function useTeamDraft<T>(selector: (state: TeamDraftState) => T): T {
  return useStore(teamDraftStore, selector);
}

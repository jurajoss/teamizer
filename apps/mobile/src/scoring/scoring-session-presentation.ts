import type {
  ScoringCompletionOutcome,
  ScoringSessionNotice,
  ScoringSessionState,
} from './scoring-session-controller';

export type ScoringNoticeTranslationKey =
  'match.completionPending' | 'match.restored' | 'match.completionUnconfirmed';

export function isActiveScoringStatus(
  status: ScoringSessionState['status'],
): boolean {
  return status === 'SCORING';
}

export function scoringNoticeTranslationKey(
  notice: ScoringSessionNotice | null,
  completionPending: boolean,
): ScoringNoticeTranslationKey | null {
  if (!notice) return null;
  if (completionPending) return 'match.completionPending';
  return notice.code === 'DRAFT_RESTORED'
    ? 'match.restored'
    : 'match.completionUnconfirmed';
}

export function completionOutcomeTranslationKey(
  outcome: ScoringCompletionOutcome | null,
): 'match.finalConflict' | 'match.finalSaved' | null {
  if (!outcome) return null;
  return outcome === 'CONFLICTED' ? 'match.finalConflict' : 'match.finalSaved';
}

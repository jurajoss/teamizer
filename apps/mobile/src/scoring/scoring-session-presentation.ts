import type {
  ScoringCompletionOutcome,
  ScoringSessionNotice,
} from './scoring-session-controller';

export type ScoringNoticeTranslationKey =
  'match.completionPending' | 'match.completionUnconfirmed';

export function scoringNoticeTranslationKey(
  notice: ScoringSessionNotice | null,
): ScoringNoticeTranslationKey | null {
  if (!notice) return null;
  return notice.code === 'COMPLETION_PENDING'
    ? 'match.completionPending'
    : 'match.completionUnconfirmed';
}

export function completionOutcomeTranslationKey(
  outcome: ScoringCompletionOutcome | null,
): 'match.finalConflict' | 'match.finalSaved' | null {
  if (!outcome) return null;
  return outcome === 'CONFLICTED' ? 'match.finalConflict' : 'match.finalSaved';
}

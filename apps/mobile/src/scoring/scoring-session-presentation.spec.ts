import { describe, expect, it } from 'vitest';

import {
  completionOutcomeTranslationKey,
  isActiveScoringStatus,
  scoringNoticeTranslationKey,
} from './scoring-session-presentation';

describe('typed scoring presentation outcomes', () => {
  it('identifies only active scoring as a focused shell workflow', () => {
    expect(isActiveScoringStatus('SCORING')).toBe(true);
    expect(isActiveScoringStatus('READY_TO_START')).toBe(false);
    expect(isActiveScoringStatus('FINISHED')).toBe(false);
  });

  it('maps restored and failed completion notices without inspecting English text', () => {
    expect(scoringNoticeTranslationKey({ code: 'DRAFT_RESTORED' }, false)).toBe(
      'match.restored',
    );
    expect(
      scoringNoticeTranslationKey(
        { code: 'COMPLETION_UNCONFIRMED', detail: 'provider text' },
        false,
      ),
    ).toBe('match.completionUnconfirmed');
    expect(
      scoringNoticeTranslationKey({ code: 'COMPLETION_UNCONFIRMED' }, true),
    ).toBe('match.completionPending');
    expect(scoringNoticeTranslationKey(null, false)).toBeNull();
  });

  it('maps saved and conflict completion outcomes to the existing localized banners', () => {
    expect(completionOutcomeTranslationKey('SAVED')).toBe('match.finalSaved');
    expect(completionOutcomeTranslationKey('CONFLICTED')).toBe(
      'match.finalConflict',
    );
    expect(completionOutcomeTranslationKey(null)).toBeNull();
  });
});

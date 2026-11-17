import { describe, expect, it } from 'vitest';

import {
  completionOutcomeTranslationKey,
  scoringNoticeTranslationKey,
} from './scoring-session-presentation';

describe('typed scoring presentation outcomes', () => {
  it('maps only actionable completion notices without inspecting English text', () => {
    expect(
      scoringNoticeTranslationKey({
        code: 'COMPLETION_UNCONFIRMED',
        detail: 'provider text',
      }),
    ).toBe('match.completionUnconfirmed');
    expect(scoringNoticeTranslationKey({ code: 'COMPLETION_PENDING' })).toBe(
      'match.completionPending',
    );
    expect(scoringNoticeTranslationKey(null)).toBeNull();
  });

  it('maps saved and conflict completion outcomes to the existing localized banners', () => {
    expect(completionOutcomeTranslationKey('SAVED')).toBe('match.finalSaved');
    expect(completionOutcomeTranslationKey('CONFLICTED')).toBe(
      'match.finalConflict',
    );
    expect(completionOutcomeTranslationKey(null)).toBeNull();
  });
});

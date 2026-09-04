import { describe, expect, it } from 'vitest';

import { matchIdFromNotificationData } from './notification-platform';

describe('match notification navigation data', () => {
  it('accepts only the supported reminder type with a valid Match UUID', () => {
    const matchId = '00000000-0000-4000-8000-000000000010';

    expect(
      matchIdFromNotificationData({
        type: 'MATCH_ATTENDANCE_REMINDER',
        matchId,
      }),
    ).toBe(matchId);
    expect(
      matchIdFromNotificationData({ type: 'MARKETING', matchId }),
    ).toBeNull();
    expect(
      matchIdFromNotificationData({
        type: 'MATCH_ATTENDANCE_REMINDER',
        matchId: 'not-a-uuid',
      }),
    ).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  leaveMatch,
  matchViewportKey,
  type MatchNavigation,
} from './match-navigation';

function navigation(canGoBack: boolean) {
  return {
    back: vi.fn(),
    canGoBack: vi.fn(() => canGoBack),
    replace: vi.fn(),
  } satisfies MatchNavigation;
}

describe('Match navigation', () => {
  it('returns through navigation history when Match detail was opened from home', () => {
    const router = navigation(true);

    leaveMatch(router);

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('returns a directly opened Match route to home', () => {
    const router = navigation(false);

    leaveMatch(router);

    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('resets the viewport across lifecycle and scoring presentation transitions', () => {
    expect(matchViewportKey('OPEN_FOR_REGISTRATION')).not.toBe(
      matchViewportKey('IN_PROGRESS', 'READY_TO_START'),
    );
    expect(matchViewportKey('IN_PROGRESS', 'READY_TO_START')).not.toBe(
      matchViewportKey('IN_PROGRESS', 'SCORING'),
    );
    expect(matchViewportKey('IN_PROGRESS', 'SCORING')).not.toBe(
      matchViewportKey('FINISHED'),
    );
  });
});

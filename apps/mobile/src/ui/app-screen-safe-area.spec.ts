import { describe, expect, it } from 'vitest';

import { appScreenSafeAreaEdges } from './app-screen-safe-area';

describe('AppScreen safe-area ownership', () => {
  it('keeps standalone screens safe on all physical edges', () => {
    expect(
      appScreenSafeAreaEdges(false, { bottom: false, left: false }),
    ).toEqual(['top', 'right', 'bottom', 'left']);
  });

  it('avoids top-header and bottom-navigation inset duplication', () => {
    expect(appScreenSafeAreaEdges(true, { bottom: true, left: false })).toEqual(
      ['right', 'left'],
    );
    expect(
      appScreenSafeAreaEdges(true, { bottom: false, left: false }),
    ).toEqual(['right', 'bottom', 'left']);
  });

  it('leaves the physical left inset to the tablet sidebar', () => {
    expect(appScreenSafeAreaEdges(true, { bottom: false, left: true })).toEqual(
      ['right', 'bottom'],
    );
  });
});

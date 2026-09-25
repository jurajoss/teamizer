import { describe, expect, it, vi } from 'vitest';

import { registerPrimaryNavigationVisibility } from './primary-navigation-visibility-state';

describe('focused primary-navigation visibility registration', () => {
  it.each([false, true])(
    'registers hidden=%s while focused and restores navigation on cleanup',
    (hidden) => {
      const setHidden = vi.fn();

      const unregister = registerPrimaryNavigationVisibility(setHidden, hidden);
      expect(setHidden).toHaveBeenCalledExactlyOnceWith(hidden);

      unregister();
      expect(setHidden).toHaveBeenNthCalledWith(2, false);
    },
  );
});

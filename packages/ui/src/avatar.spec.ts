import { describe, expect, it } from 'vitest';

import { avatarInitials } from './avatar-utils';

describe('avatarInitials', () => {
  it('creates a deterministic fallback from up to two name parts', () => {
    expect(avatarInitials('  Alex Morgan  ')).toBe('AM');
    expect(avatarInitials('Pelé')).toBe('P');
    expect(avatarInitials('')).toBe('?');
  });
});

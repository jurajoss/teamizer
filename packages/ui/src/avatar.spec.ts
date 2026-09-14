import { describe, expect, it } from 'vitest';

import {
  avatarInitials,
  avatarInitialsLayout,
  avatarSizeMetrics,
} from './avatar-utils';

describe('avatarInitials', () => {
  it('creates a deterministic fallback from up to two name parts', () => {
    expect(avatarInitials('  Alex Morgan  ')).toBe('AM');
    expect(avatarInitials('Jan Syrový')).toBe('JS');
    expect(avatarInitials('Pelé')).toBe('P');
    expect(avatarInitials('')).toBe('?');
  });

  it('defines safe, centered initials typography for every avatar size', () => {
    expect(avatarInitialsLayout).toEqual({
      includeFontPadding: false,
      textAlign: 'center',
      textAlignVertical: 'center',
    });

    expect(avatarSizeMetrics).toEqual({
      small: { dimension: 32, fontSize: 12, lineHeight: 16 },
      medium: { dimension: 44, fontSize: 15, lineHeight: 20 },
      large: { dimension: 64, fontSize: 22, lineHeight: 28 },
      hero: { dimension: 96, fontSize: 33, lineHeight: 40 },
    });

    for (const { dimension, fontSize, lineHeight } of Object.values(
      avatarSizeMetrics,
    )) {
      expect(lineHeight).toBeGreaterThan(fontSize);
      expect(lineHeight).toBeLessThan(dimension);
    }
  });
});

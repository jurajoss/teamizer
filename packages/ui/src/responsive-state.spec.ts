import { describe, expect, it } from 'vitest';

import {
  breakpoints,
  contentMaxWidth,
  resolveLayoutMode,
} from './responsive-state';
import { layout } from './theme';

describe('responsive layout state', () => {
  it('uses one explicit boundary for phone and tablet composition', () => {
    expect(resolveLayoutMode(breakpoints.tablet - 1)).toBe('phone');
    expect(resolveLayoutMode(breakpoints.tablet)).toBe('tablet');
    expect(resolveLayoutMode(breakpoints.tablet + 300)).toBe('tablet');
  });

  it('maps screen content intent to readable, working, or unconstrained width', () => {
    expect(contentMaxWidth('readable')).toBe(layout.readableContentMaxWidth);
    expect(contentMaxWidth('working')).toBe(layout.workingContentMaxWidth);
    expect(contentMaxWidth('full')).toBeUndefined();
  });
});

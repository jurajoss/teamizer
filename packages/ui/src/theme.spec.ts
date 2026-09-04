import { describe, expect, it } from 'vitest';

import { colors, layout, spacing } from './theme';

describe('Teamizer visual foundation', () => {
  it('keeps shared touch targets at or above mobile accessibility guidance', () => {
    expect(layout.minimumTouchTarget).toBeGreaterThanOrEqual(44);
  });

  it('keeps the spacing scale ordered and intentional', () => {
    const values = Object.values(spacing);

    expect(values).toEqual([...values].sort((left, right) => left - right));
    expect(new Set(values).size).toBe(values.length);
  });

  it('provides accessible contrast for primary text and actions', () => {
    expect(contrastRatio(colors.ink, colors.canvas)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(colors.onBrand, colors.brand)).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(
      contrastRatio(colors.error, colors.errorSoft),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));

  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

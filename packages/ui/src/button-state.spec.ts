import { describe, expect, it } from 'vitest';

import { buttonColorSet, type ButtonVariant } from './button-state';
import { darkColors, lightColors } from './theme';

const variants: ButtonVariant[] = [
  'primary',
  'secondary',
  'ghost',
  'destructive',
];

describe('buttonColorSet', () => {
  it('maps every semantic variant to complete light and dark state colors', () => {
    for (const colors of [lightColors, darkColors]) {
      for (const variant of variants) {
        for (const state of ['default', 'pressed', 'disabled'] as const) {
          expect(buttonColorSet(colors, variant, state)).toEqual({
            background: expect.any(String),
            border: expect.any(String),
            foreground: expect.any(String),
          });
        }
      }
    }
  });

  it('uses semantic pressed and disabled roles instead of palette literals', () => {
    expect(buttonColorSet(lightColors, 'primary', 'pressed')).toMatchObject({
      background: lightColors.accentPressed,
      foreground: lightColors.accentContrast,
    });
    expect(buttonColorSet(lightColors, 'destructive', 'pressed')).toMatchObject(
      {
        background: lightColors.dangerSurfacePressed,
        border: lightColors.dangerBorder,
        foreground: lightColors.danger,
      },
    );
    expect(buttonColorSet(darkColors, 'secondary', 'disabled')).toEqual({
      background: darkColors.disabledSurface,
      border: darkColors.borderDisabled,
      foreground: darkColors.textDisabled,
    });
  });
});

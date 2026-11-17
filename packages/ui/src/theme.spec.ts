import { describe, expect, it } from 'vitest';

import { statusColorSet, type StatusTone } from './status-colors';
import {
  darkColors,
  darkTheme,
  lightColors,
  lightTheme,
  sizes,
  spacing,
  typography,
} from './theme';

const statusTones: StatusTone[] = [
  'neutral',
  'success',
  'warning',
  'info',
  'danger',
];

describe('Teamizer visual foundation', () => {
  it('keeps shared touch targets at or above mobile accessibility guidance', () => {
    expect(sizes.minimumTouchTarget).toBeGreaterThanOrEqual(44);
    expect(sizes.compactControl).toBeLessThan(sizes.minimumTouchTarget);
    expect(sizes.controlHeight).toBeGreaterThanOrEqual(
      sizes.minimumTouchTarget,
    );
    expect(Object.values(sizes.icon)).toEqual([16, 20, 24]);
    expect(Object.values(sizes.avatar)).toEqual([32, 44, 64, 96]);
  });

  it('keeps the spacing scale ordered and intentional', () => {
    const values = Object.values(spacing);

    expect(values).toEqual([...values].sort((left, right) => left - right));
    expect(new Set(values).size).toBe(values.length);
  });

  it('provides accessible contrast for primary text and actions', () => {
    for (const colors of [lightColors, darkColors]) {
      expect(
        contrastRatio(colors.textPrimary, colors.background),
      ).toBeGreaterThanOrEqual(7);
      expect(
        contrastRatio(colors.textSecondary, colors.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(colors.textSubtle, colors.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrastRatio(colors.textSubtle, colors.surface),
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(
      contrastRatio(lightColors.accentContrast, lightColors.accent),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(lightColors.danger, lightColors.dangerSurface),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('provides semantic dark colors with readable status and team pairs', () => {
    expect(
      contrastRatio(darkColors.textPrimary, darkColors.background),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrastRatio(darkColors.success, darkColors.successSurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkColors.teamAText, darkColors.teamASurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(darkColors.teamBText, darkColors.teamBSurface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(darkColors.teamASurface).not.toBe(darkColors.teamBSurface);
  });

  it('keeps the semantic Team B role in the approved blue color family', () => {
    for (const colors of [lightColors, darkColors]) {
      expect(blueChannel(colors.teamBText)).toBeGreaterThan(
        redChannel(colors.teamBText),
      );
      expect(blueChannel(colors.teamBSurface)).toBeGreaterThan(
        redChannel(colors.teamBSurface),
      );
    }
  });

  it('provides distinct theme-aware gold, silver, and bronze medal colors', () => {
    expect({
      bronze: lightColors.medalBronze,
      gold: lightColors.medalGold,
      number: lightColors.medalNumber,
      silver: lightColors.medalSilver,
    }).toEqual({
      bronze: '#A56843',
      gold: '#996E09',
      number: '#FFFFFF',
      silver: '#6B7973',
    });
    expect({
      bronze: darkColors.medalBronze,
      gold: darkColors.medalGold,
      number: darkColors.medalNumber,
      silver: darkColors.medalSilver,
    }).toEqual({
      bronze: '#D88A5B',
      gold: '#E2B84B',
      number: '#0D1712',
      silver: '#AEBBB6',
    });

    for (const colors of [lightColors, darkColors]) {
      const medals = [colors.medalGold, colors.medalSilver, colors.medalBronze];

      expect(new Set(medals).size).toBe(3);
      for (const medal of medals) {
        expect(
          contrastRatio(medal, colors.surfaceElevated),
        ).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(colors.medalNumber, medal)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it('provides subdued semantic team borders against cards and score surfaces', () => {
    for (const colors of [lightColors, darkColors]) {
      for (const team of [
        {
          border: colors.teamABorder,
          surface: colors.teamASurface,
          text: colors.teamAText,
        },
        {
          border: colors.teamBBorder,
          surface: colors.teamBSurface,
          text: colors.teamBText,
        },
      ]) {
        expect(
          contrastRatio(team.border, colors.surface),
        ).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(team.border, team.surface)).toBeGreaterThanOrEqual(
          3,
        );
        expect(contrastRatio(team.text, colors.surface)).toBeGreaterThan(
          contrastRatio(team.border, colors.surface),
        );
        expect(contrastRatio(team.text, team.surface)).toBeGreaterThan(
          contrastRatio(team.border, team.surface),
        );
      }
    }
  });

  it('provides matching semantic team-surface tint contracts in both themes', () => {
    for (const theme of [lightTheme, darkTheme]) {
      expect(Object.keys(theme.teamSurfaceTints).sort()).toEqual([
        'teamA',
        'teamB',
      ]);

      for (const [teamKey, teamSurface] of [
        ['teamA', theme.colors.teamASurface],
        ['teamB', theme.colors.teamBSurface],
      ] as const) {
        const tints = theme.teamSurfaceTints[teamKey];

        expect(Object.keys(tints).sort()).toEqual(['prominent', 'subtle']);
        expect(tints.subtle.direction).toBe('to right');
        expect(tints.subtle.colorStops.map(({ position }) => position)).toEqual(
          ['0%', '28%', '56%', '100%'],
        );
        expect(tints.subtle.colorStops[0]?.color).not.toBe(
          theme.colors.surface,
        );
        expect(tints.subtle.colorStops[1]?.color).not.toBe(
          theme.colors.surface,
        );
        expect(tints.subtle.colorStops[0]?.color).not.toBe(
          tints.subtle.colorStops[1]?.color,
        );
        expect(tints.subtle.colorStops[2]?.color).toBe(theme.colors.surface);
        expect(tints.subtle.colorStops[3]?.color).toBe(theme.colors.surface);
        expect(tints.prominent.direction).toBe('to right');
        expect(
          tints.prominent.colorStops.map(({ position }) => position),
        ).toEqual(['0%', '30%', '60%', '100%']);
        expect(tints.prominent.colorStops[0]?.color).not.toBe(teamSurface);
        expect(tints.prominent.colorStops[1]?.color).not.toBe(teamSurface);
        expect(tints.prominent.colorStops[0]?.color).not.toBe(
          tints.prominent.colorStops[1]?.color,
        );
        expect(tints.prominent.colorStops[2]?.color).toBe(teamSurface);
        expect(tints.prominent.colorStops[3]?.color).toBe(teamSurface);
      }
    }

    expect(Object.keys(lightTheme.teamSurfaceTints).sort()).toEqual(
      Object.keys(darkTheme.teamSurfaceTints).sort(),
    );
  });

  it('provides foreground, background, and border colors for every status', () => {
    for (const colors of [lightColors, darkColors]) {
      for (const tone of statusTones) {
        const status = statusColorSet(colors, tone);

        expect(status.background).not.toBe(status.foreground);
        expect(status.border).toEqual(expect.any(String));
        expect(
          contrastRatio(status.foreground, status.background),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the deliberate typography roles scalable without clipped lines', () => {
    expect(Object.keys(typography)).toEqual([
      'display',
      'title',
      'heading',
      'body',
      'bodyStrong',
      'label',
      'caption',
      'eyebrow',
      'metric',
      'scoreCompact',
      'score',
    ]);

    for (const role of Object.values(typography)) {
      expect(role.lineHeight).toBeGreaterThan(role.fontSize);
    }
  });

  it('selects one complete semantic palette for each theme mode', () => {
    expect(lightTheme).toMatchObject({ mode: 'light', colors: lightColors });
    expect(darkTheme).toMatchObject({ mode: 'dark', colors: darkColors });
    expect(Object.keys(darkColors).sort()).toEqual(
      Object.keys(lightColors).sort(),
    );
    expect(Object.keys(darkTheme.shadows).sort()).toEqual(
      Object.keys(lightTheme.shadows).sort(),
    );
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

function redChannel(hex: string): number {
  return Number.parseInt(hex.slice(1, 3), 16);
}

function blueChannel(hex: string): number {
  return Number.parseInt(hex.slice(5, 7), 16);
}

export type ThemeMode = 'light' | 'dark';

export type ThemeGradientStop = {
  color: string;
  position: `${number}%`;
};

export type ThemeLinearGradient = {
  colorStops: readonly [
    ThemeGradientStop,
    ThemeGradientStop,
    ThemeGradientStop,
    ThemeGradientStop,
  ];
  direction: 'to right';
};

export type TeamSurfaceTints = {
  teamA: {
    prominent: ThemeLinearGradient;
    subtle: ThemeLinearGradient;
  };
  teamB: {
    prominent: ThemeLinearGradient;
    subtle: ThemeLinearGradient;
  };
};

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  surfaceStrong: string;
  textPrimary: string;
  textSecondary: string;
  textSubtle: string;
  textDisabled: string;
  border: string;
  borderStrong: string;
  borderDisabled: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  accentContrast: string;
  focus: string;
  danger: string;
  dangerSurface: string;
  dangerSurfacePressed: string;
  dangerBorder: string;
  success: string;
  successSurface: string;
  successBorder: string;
  warning: string;
  warningSurface: string;
  warningBorder: string;
  info: string;
  infoSurface: string;
  infoBorder: string;
  disabledSurface: string;
  teamAText: string;
  teamASurface: string;
  teamABorder: string;
  teamBText: string;
  teamBSurface: string;
  teamBBorder: string;
  overlay: string;
};

const lightShadows = {
  raised: {
    boxShadow: '0 8px 24px rgba(20, 37, 28, 0.08)',
  },
  floating: {
    boxShadow: '0 14px 36px rgba(20, 37, 28, 0.14)',
  },
} as const;

const darkShadows = {
  raised: {
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
  },
  floating: {
    boxShadow: '0 14px 36px rgba(0, 0, 0, 0.38)',
  },
} as const;

export type AppTheme = {
  mode: ThemeMode;
  colors: ThemeColors;
  shadows: typeof lightShadows | typeof darkShadows;
  teamSurfaceTints: TeamSurfaceTints;
};

export const lightColors: ThemeColors = {
  background: '#F4F7F4',
  surface: '#FBFDFC',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#EAF0EB',
  surfaceStrong: '#DDE8E0',
  textPrimary: '#14251C',
  textSecondary: '#526158',
  textSubtle: '#66736A',
  textDisabled: '#7D8981',
  border: '#D8E2DA',
  borderStrong: '#AABCB0',
  borderDisabled: '#CBD4CE',
  accent: '#176B4D',
  accentPressed: '#10553D',
  accentSoft: '#DDF1E7',
  accentContrast: '#FFFFFF',
  focus: '#2A7F60',
  danger: '#A9362B',
  dangerSurface: '#FBEAE7',
  dangerSurfacePressed: '#F4D7D2',
  dangerBorder: '#D9A19B',
  success: '#19734F',
  successSurface: '#E2F3EA',
  successBorder: '#91C9AB',
  info: '#315F91',
  infoSurface: '#E8F0F8',
  infoBorder: '#A3BED9',
  warning: '#76530B',
  warningSurface: '#F8EFCF',
  warningBorder: '#D0B86B',
  disabledSurface: '#E7ECE8',
  teamAText: '#176B6B',
  teamASurface: '#DDF1F0',
  teamABorder: '#4B8D8A',
  teamBText: '#0F5EA8',
  teamBSurface: '#E0F0FF',
  teamBBorder: '#5688B7',
  overlay: 'rgba(20, 37, 28, 0.42)',
};

export const darkColors: ThemeColors = {
  background: '#0D1712',
  surface: '#15221B',
  surfaceElevated: '#1E2E25',
  surfaceSubtle: '#1B2B22',
  surfaceStrong: '#25382D',
  textPrimary: '#F2F7F3',
  textSecondary: '#C3D0C7',
  textSubtle: '#96A89C',
  textDisabled: '#7E8F84',
  border: '#2C4034',
  borderStrong: '#456052',
  borderDisabled: '#33463A',
  accent: '#43B788',
  accentPressed: '#2D966C',
  accentSoft: '#173F30',
  accentContrast: '#07130D',
  focus: '#65D4A5',
  danger: '#FF9C91',
  dangerSurface: '#47211F',
  dangerSurfacePressed: '#5A2925',
  dangerBorder: '#78413B',
  success: '#78D8AA',
  successSurface: '#153C2C',
  successBorder: '#2E684C',
  warning: '#F0CA72',
  warningSurface: '#40351A',
  warningBorder: '#6A5829',
  info: '#9BC8F3',
  infoSurface: '#1C3349',
  infoBorder: '#355B7D',
  disabledSurface: '#1A261F',
  teamAText: '#7BD4D1',
  teamASurface: '#173D3C',
  teamABorder: '#528F8B',
  teamBText: '#75BCFF',
  teamBSurface: '#123451',
  teamBBorder: '#4A82B5',
  overlay: 'rgba(0, 0, 0, 0.68)',
};

const lightTeamSurfaceTints = createTeamSurfaceTints(lightColors, {
  scoreMidTint: 0.04,
  scoreStartTint: 0.12,
  tileMidTint: 0.14,
  tileStartTint: 0.6,
});

const darkTeamSurfaceTints = createTeamSurfaceTints(darkColors, {
  scoreMidTint: 0.06,
  scoreStartTint: 0.18,
  tileMidTint: 0.16,
  tileStartTint: 0.66,
});

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  jumbo: 48,
} as const;

export const radii = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const borderWidths = {
  subtle: 1,
  emphasized: 2,
} as const;

export const sizes = {
  minimumTouchTarget: 48,
  compactControl: 36,
  controlHeight: 52,
  icon: {
    small: 16,
    medium: 20,
    large: 24,
  },
  avatar: {
    small: 32,
    medium: 44,
    large: 64,
    hero: 96,
  },
} as const;

export const typography = {
  display: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '800' as const,
    letterSpacing: -1,
  },
  title: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800' as const,
    letterSpacing: -0.45,
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.15,
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '400' as const,
  },
  bodyStrong: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700' as const,
  },
  label: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700' as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800' as const,
    letterSpacing: 1.1,
  },
  metric: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800' as const,
    letterSpacing: -0.25,
  },
  scoreCompact: {
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '800' as const,
    letterSpacing: -1,
  },
  score: {
    fontSize: 64,
    lineHeight: 68,
    fontWeight: '800' as const,
    letterSpacing: -1.5,
  },
} as const;

export const layout = {
  bottomNavigationMinHeight: 64,
  formMaxWidth: 460,
  navigationSidebarWidth: 248,
  readableContentMaxWidth: 760,
  workingContentMaxWidth: 1120,
  headerMaxWidth: 824,
  pagePaddingPhone: spacing.lg,
  pagePaddingTablet: spacing.xxl,
} as const;

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: lightColors,
  shadows: lightShadows,
  teamSurfaceTints: lightTeamSurfaceTints,
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: darkColors,
  shadows: darkShadows,
  teamSurfaceTints: darkTeamSurfaceTints,
};

function createTeamSurfaceTints(
  colors: ThemeColors,
  strength: {
    scoreMidTint: number;
    scoreStartTint: number;
    tileMidTint: number;
    tileStartTint: number;
  },
): TeamSurfaceTints {
  return {
    teamA: createTeamTints(
      colors,
      colors.teamASurface,
      colors.teamAText,
      strength,
    ),
    teamB: createTeamTints(
      colors,
      colors.teamBSurface,
      colors.teamBText,
      strength,
    ),
  };
}

function createTeamTints(
  colors: ThemeColors,
  teamSurface: string,
  teamForeground: string,
  strength: {
    scoreMidTint: number;
    scoreStartTint: number;
    tileMidTint: number;
    tileStartTint: number;
  },
): TeamSurfaceTints['teamA'] {
  return {
    prominent: {
      colorStops: [
        {
          color: mixHexColors(
            teamSurface,
            teamForeground,
            strength.scoreStartTint,
          ),
          position: '0%',
        },
        {
          color: mixHexColors(
            teamSurface,
            teamForeground,
            strength.scoreMidTint,
          ),
          position: '30%',
        },
        { color: teamSurface, position: '60%' },
        { color: teamSurface, position: '100%' },
      ],
      direction: 'to right',
    },
    subtle: {
      colorStops: [
        {
          color: mixHexColors(
            colors.surface,
            teamSurface,
            strength.tileStartTint,
          ),
          position: '0%',
        },
        {
          color: mixHexColors(
            colors.surface,
            teamSurface,
            strength.tileMidTint,
          ),
          position: '28%',
        },
        { color: colors.surface, position: '56%' },
        { color: colors.surface, position: '100%' },
      ],
      direction: 'to right',
    },
  };
}

function mixHexColors(base: string, tint: string, tintRatio: number): string {
  const baseChannels = hexChannels(base);
  const tintChannels = hexChannels(tint);
  const mixedChannels = baseChannels.map((baseChannel, index) => {
    const tintChannel = tintChannels[index] ?? baseChannel;
    return Math.round(baseChannel * (1 - tintRatio) + tintChannel * tintRatio);
  });

  return `#${mixedChannels
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function hexChannels(color: string): [number, number, number] {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

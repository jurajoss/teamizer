export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceSubtle: string;
  surfaceStrong: string;
  textPrimary: string;
  textSecondary: string;
  textSubtle: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  accentContrast: string;
  focus: string;
  danger: string;
  dangerSurface: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  info: string;
  infoSurface: string;
  teamAText: string;
  teamASurface: string;
  teamBText: string;
  teamBSurface: string;
  overlay: string;
};

const lightShadows = {
  raised: {
    boxShadow: '0 8px 24px rgba(20, 37, 28, 0.08)',
  },
} as const;

const darkShadows = {
  raised: {
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
  },
} as const;

export type AppTheme = {
  mode: ThemeMode;
  colors: ThemeColors;
  shadows: typeof lightShadows | typeof darkShadows;
};

export const lightColors: ThemeColors = {
  background: '#F4F7F4',
  surface: '#FFFFFF',
  surfaceSubtle: '#EAF0EB',
  surfaceStrong: '#DDE8E0',
  textPrimary: '#14251C',
  textSecondary: '#526158',
  textSubtle: '#6F7D74',
  border: '#D8E2DA',
  borderStrong: '#AABCB0',
  accent: '#176B4D',
  accentPressed: '#10553D',
  accentSoft: '#DDF1E7',
  accentContrast: '#FFFFFF',
  focus: '#2A7F60',
  danger: '#A9362B',
  dangerSurface: '#FBEAE7',
  success: '#19734F',
  successSurface: '#E2F3EA',
  info: '#315F91',
  infoSurface: '#E8F0F8',
  warning: '#76530B',
  warningSurface: '#F8EFCF',
  teamAText: '#176B6B',
  teamASurface: '#DDF1F0',
  teamBText: '#8A4A13',
  teamBSurface: '#F8E9D8',
  overlay: 'rgba(20, 37, 28, 0.42)',
};

export const darkColors: ThemeColors = {
  background: '#0D1712',
  surface: '#15221B',
  surfaceSubtle: '#1B2B22',
  surfaceStrong: '#25382D',
  textPrimary: '#F2F7F3',
  textSecondary: '#C3D0C7',
  textSubtle: '#96A89C',
  border: '#2C4034',
  borderStrong: '#456052',
  accent: '#43B788',
  accentPressed: '#2D966C',
  accentSoft: '#173F30',
  accentContrast: '#07130D',
  focus: '#65D4A5',
  danger: '#FF9C91',
  dangerSurface: '#47211F',
  success: '#78D8AA',
  successSurface: '#153C2C',
  warning: '#F0CA72',
  warningSurface: '#40351A',
  info: '#9BC8F3',
  infoSurface: '#1C3349',
  teamAText: '#7BD4D1',
  teamASurface: '#173D3C',
  teamBText: '#F2BC7F',
  teamBSurface: '#462D19',
  overlay: 'rgba(0, 0, 0, 0.68)',
};

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
  score: {
    fontSize: 64,
    lineHeight: 68,
    fontWeight: '800' as const,
    letterSpacing: -1.5,
  },
} as const;

export const layout = {
  formMaxWidth: 460,
  contentMaxWidth: 760,
  headerMaxWidth: 824,
  minimumTouchTarget: 48,
  pagePaddingPhone: spacing.lg,
  pagePaddingTablet: spacing.xxl,
} as const;

export const lightTheme: AppTheme = {
  mode: 'light',
  colors: lightColors,
  shadows: lightShadows,
};

export const darkTheme: AppTheme = {
  mode: 'dark',
  colors: darkColors,
  shadows: darkShadows,
};

// Compatibility for non-rendering consumers. Components use useTheme().
export const colors = {
  ...lightColors,
  canvas: lightColors.background,
  surfaceMuted: lightColors.surfaceSubtle,
  ink: lightColors.textPrimary,
  inkMuted: lightColors.textSecondary,
  inkSubtle: lightColors.textSubtle,
  brand: lightColors.accent,
  brandPressed: lightColors.accentPressed,
  brandSoft: lightColors.accentSoft,
  onBrand: lightColors.accentContrast,
  error: lightColors.danger,
  errorSoft: lightColors.dangerSurface,
  successSoft: lightColors.successSurface,
  infoSoft: lightColors.infoSurface,
  warningSoft: lightColors.warningSurface,
  teamA: lightColors.teamAText,
  teamASoft: lightColors.teamASurface,
  teamB: lightColors.teamBText,
  teamBSoft: lightColors.teamBSurface,
} as const;

export const shadows = lightShadows;

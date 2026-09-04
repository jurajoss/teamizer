export const colors = {
  canvas: '#F4F7F4',
  surface: '#FFFFFF',
  surfaceMuted: '#EAF0EB',
  surfaceStrong: '#DDE8E0',
  ink: '#14251C',
  inkMuted: '#5A6A60',
  inkSubtle: '#7B8980',
  border: '#D8E2DA',
  borderStrong: '#B9C8BE',
  brand: '#176B4D',
  brandPressed: '#10553D',
  brandSoft: '#DDF1E7',
  onBrand: '#FFFFFF',
  focus: '#2A7F60',
  error: '#A9362B',
  errorSoft: '#FBEAE7',
  success: '#19734F',
  successSoft: '#E2F3EA',
  info: '#315F91',
  infoSoft: '#E8F0F8',
  warning: '#8A6412',
  warningSoft: '#F8EFCF',
  teamA: '#176B6B',
  teamASoft: '#DDF1F0',
  teamB: '#A65F20',
  teamBSoft: '#F8E9D8',
  overlay: 'rgba(20, 37, 28, 0.08)',
} as const;

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
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800' as const,
    letterSpacing: -1.1,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  heading: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
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
  minimumTouchTarget: 48,
  pagePaddingPhone: spacing.lg,
  pagePaddingTablet: spacing.xxl,
} as const;

export const shadows = {
  raised: {
    boxShadow: '0 8px 24px rgba(20, 37, 28, 0.08)',
  },
} as const;

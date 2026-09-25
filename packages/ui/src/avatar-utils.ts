import { sizes } from './theme';

export type AvatarSize = 'small' | 'medium' | 'large' | 'hero';

export const avatarSizeMetrics: Record<
  AvatarSize,
  { dimension: number; fontSize: number; lineHeight: number }
> = {
  small: { dimension: sizes.avatar.small, fontSize: 12, lineHeight: 16 },
  medium: { dimension: sizes.avatar.medium, fontSize: 15, lineHeight: 20 },
  large: { dimension: sizes.avatar.large, fontSize: 22, lineHeight: 28 },
  hero: { dimension: sizes.avatar.hero, fontSize: 33, lineHeight: 40 },
};

export const avatarInitialsLayout = {
  includeFontPadding: false,
  textAlign: 'center',
  textAlignVertical: 'center',
} as const;

export function avatarInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase())
    .join('');
  return initials || '?';
}

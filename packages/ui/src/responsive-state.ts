import { layout } from './theme';

export const breakpoints = {
  tablet: 700,
} as const;

export type LayoutMode = 'phone' | 'tablet';
export type ContentWidth = 'readable' | 'working' | 'full';

export function resolveLayoutMode(width: number): LayoutMode {
  return width >= breakpoints.tablet ? 'tablet' : 'phone';
}

export function contentMaxWidth(
  contentWidth: ContentWidth,
): number | undefined {
  if (contentWidth === 'readable') return layout.readableContentMaxWidth;
  if (contentWidth === 'working') return layout.workingContentMaxWidth;
  return undefined;
}

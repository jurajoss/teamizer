import type { Edge } from 'react-native-safe-area-context';

export type AppScreenShellSafeAreaOwnership = {
  bottom: boolean;
  left: boolean;
};

export function appScreenSafeAreaEdges(
  underHeader: boolean,
  shellOwnership: AppScreenShellSafeAreaOwnership,
): Edge[] {
  return [
    ...(underHeader ? [] : (['top'] as const)),
    'right',
    ...(shellOwnership.bottom ? [] : (['bottom'] as const)),
    ...(shellOwnership.left ? [] : (['left'] as const)),
  ];
}

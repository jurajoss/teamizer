import { useWindowDimensions } from 'react-native';

import { resolveLayoutMode, type LayoutMode } from './responsive-state';
import { layout } from './theme';

export type ResponsiveLayout = {
  horizontalPadding: number;
  isPhone: boolean;
  isTablet: boolean;
  mode: LayoutMode;
  width: number;
};

export function useResponsiveLayout(): ResponsiveLayout {
  const { width } = useWindowDimensions();
  const mode = resolveLayoutMode(width);

  return {
    horizontalPadding:
      mode === 'tablet' ? layout.pagePaddingTablet : layout.pagePaddingPhone,
    isPhone: mode === 'phone',
    isTablet: mode === 'tablet',
    mode,
    width,
  };
}

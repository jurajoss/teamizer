import { SymbolView } from 'expo-symbols';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { sizes } from '@teamizer/ui';

import { teamizerIconSymbols, type TeamizerIconName } from './app-icon-map';

export function AppIcon({
  color,
  name,
  size = sizes.icon.medium,
  style,
}: {
  color: string;
  name: TeamizerIconName;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ height: size, width: size }, style]}
    >
      <SymbolView
        name={teamizerIconSymbols[name]}
        resizeMode="scaleAspectFit"
        size={size}
        tintColor={color}
        type="monochrome"
      />
    </View>
  );
}

import { StyleSheet, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { sizes } from '@teamizer/ui';

const trophySize = sizes.icon.large;

export function RankingTrophy({
  color,
  numberColor,
  rank,
}: {
  color: string;
  numberColor: string;
  rank: 1 | 2 | 3;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.frame}
    >
      <Svg height={trophySize} viewBox="0 0 24 24" width={trophySize}>
        <Path
          d="M7 2.5h10v4.2c0 3.7-2.1 6.3-5 6.3s-5-2.6-5-6.3V2.5Z"
          fill={color}
        />
        <Path
          d="M7 4.5H3v2.1c0 3.2 2.1 5.4 5.2 5.4V9.8C6.3 9.8 5 8.5 5 6.6h2V4.5Zm10 0h4v2.1c0 3.2-2.1 5.4-5.2 5.4V9.8c1.9 0 3.2-1.3 3.2-3.2h-2V4.5Z"
          fill={color}
        />
        <Path d="M11 12h2v4h3.5v2H7.5v-2H11v-4Z" fill={color} />
        <SvgText
          alignmentBaseline="central"
          fill={numberColor}
          fontSize={7.5}
          fontWeight="800"
          textAnchor="middle"
          x={12}
          y={7.25}
        >
          {rank}
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { height: trophySize, width: trophySize },
});

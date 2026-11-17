import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Line,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { AppText, borderWidths, spacing, useTheme } from '@teamizer/ui';

import {
  homeGoalScale,
  homeGoalXAxisLabelIndices,
  type HomeGoalHistoryPoint,
} from '../home/home-screen-model';

const chartHeight = 128;
const xAxisLabelWidth = 52;

export function GoalHistoryChart({
  accessibilityLabel,
  points,
  variant,
}: {
  accessibilityLabel: string;
  points: HomeGoalHistoryPoint[];
  variant: 'bars' | 'line';
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const scale = homeGoalScale(points);
  const top = spacing.xs;
  const bottom = chartHeight - spacing.xs;
  const plotHeight = bottom - top;
  const coordinates = points.map((point, index) => ({
    x:
      points.length === 1
        ? width / 2
        : (index / Math.max(1, points.length - 1)) * width,
    y: top + (1 - point.goals / scale.maximum) * plotHeight,
  }));
  const linePath = coordinates
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
    .join(' ');
  const areaLinePath = coordinates.map(({ x, y }) => `L ${x} ${y}`).join(' ');
  const areaPath = coordinates.length
    ? `M ${coordinates[0]?.x ?? 0} ${bottom} ${areaLinePath} L ${coordinates.at(-1)?.x ?? width} ${bottom} Z`
    : '';
  const xAxisLabelIndices = homeGoalXAxisLabelIndices(points.length, width);
  const barSlotWidth = width / Math.max(1, points.length);
  const barWidth = Math.max(4, Math.min(28, barSlotWidth * 0.58));

  const handleLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.chart}>
      <View style={styles.chartBody}>
        <View style={styles.yAxis}>
          {scale.ticks.map((tick) => (
            <AppText key={tick} variant="caption" tone="subtle">
              {tick}
            </AppText>
          ))}
        </View>
        <View onLayout={handleLayout} style={styles.chartPlot}>
          {width > 0 ? (
            <Svg height={chartHeight} width={width}>
              <Defs>
                <LinearGradient
                  id="goalHistoryArea"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <Stop
                    offset="0"
                    stopColor={colors.accent}
                    stopOpacity={0.36}
                  />
                  <Stop
                    offset="1"
                    stopColor={colors.accent}
                    stopOpacity={0.02}
                  />
                </LinearGradient>
              </Defs>
              {scale.ticks.map((tick) => {
                const y = top + (1 - tick / scale.maximum) * plotHeight;
                return (
                  <Line
                    key={tick}
                    stroke={colors.border}
                    strokeWidth={borderWidths.subtle}
                    x1={0}
                    x2={width}
                    y1={y}
                    y2={y}
                  />
                );
              })}
              {variant === 'line' ? (
                <>
                  <Path d={areaPath} fill="url(#goalHistoryArea)" />
                  {coordinates.length > 1 ? (
                    <Path
                      d={linePath}
                      fill="none"
                      stroke={colors.accent}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                    />
                  ) : null}
                  {coordinates.map(({ x, y }, index) => (
                    <Circle
                      cx={x}
                      cy={y}
                      fill={colors.accent}
                      key={points[index]?.matchId}
                      r={4}
                      stroke={colors.surfaceElevated}
                      strokeWidth={2}
                    />
                  ))}
                </>
              ) : (
                coordinates.map(({ y }, index) => {
                  const x =
                    index * barSlotWidth + (barSlotWidth - barWidth) / 2;
                  return (
                    <Rect
                      fill={colors.accent}
                      height={Math.max(0, bottom - y)}
                      key={points[index]?.matchId}
                      rx={3}
                      width={barWidth}
                      x={x}
                      y={y}
                    />
                  );
                })
              )}
            </Svg>
          ) : null}
        </View>
      </View>
      <View style={styles.xAxis}>
        {xAxisLabelIndices.map((index) => {
          const point = points[index];
          const x =
            points.length === 1
              ? width / 2
              : (index / Math.max(1, points.length - 1)) * width;
          const left = Math.min(
            Math.max(0, x - xAxisLabelWidth / 2),
            Math.max(0, width - xAxisLabelWidth),
          );
          return (
            <AppText
              key={point?.matchId}
              numberOfLines={1}
              variant="caption"
              tone="subtle"
              style={[styles.xAxisLabel, { left }]}
            >
              {point?.label}
            </AppText>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: spacing.xxs },
  chartBody: { flexDirection: 'row', gap: spacing.xs },
  yAxis: {
    height: chartHeight,
    justifyContent: 'space-between',
    width: 28,
  },
  chartPlot: { flex: 1, height: chartHeight },
  xAxis: {
    height: 18,
    marginLeft: 28 + spacing.xs,
    position: 'relative',
  },
  xAxisLabel: {
    position: 'absolute',
    textAlign: 'center',
    top: 0,
    width: xAxisLabelWidth,
  },
});

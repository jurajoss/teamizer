import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  borderWidths,
  radii,
  sizes,
  spacing,
  useTheme,
} from '@teamizer/ui';

export type SegmentedControlItem<Value extends string> = Readonly<{
  label: string;
  value: Value;
}>;

export function SegmentedControl<Value extends string>({
  accessibilityLabel,
  items,
  onChange,
  shrinkLabelsToFit = true,
  value,
}: {
  accessibilityLabel?: string;
  items: ReadonlyArray<SegmentedControlItem<Value>>;
  onChange(value: Value): void;
  shrinkLabelsToFit?: boolean;
  value: Value;
}) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="tablist"
      style={[
        styles.container,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      {items.map((item) => {
        const selected = value === item.value;
        return (
          <Pressable
            accessibilityLabel={item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item.value}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: colors.accent },
              pressed && !selected && { backgroundColor: colors.surfaceSubtle },
            ]}
          >
            <AppText
              {...(shrinkLabelsToFit
                ? { adjustsFontSizeToFit: true, minimumFontScale: 0.75 }
                : {})}
              numberOfLines={1}
              style={{
                color: selected ? colors.accentContrast : colors.textPrimary,
              }}
              variant="label"
            >
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    padding: spacing.xxs,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radii.sm,
    flex: 1,
    justifyContent: 'center',
    minHeight: sizes.minimumTouchTarget,
    paddingHorizontal: spacing.xxs,
  },
});

import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { layout, radii, spacing } from './theme';
import { useTheme } from './theme-provider';

export function NumberStepper({
  label,
  value,
  minimum,
  maximum,
  disabled = false,
  decreaseLabel,
  increaseLabel,
  valueLabel,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  disabled?: boolean;
  decreaseLabel?: string;
  increaseLabel?: string;
  valueLabel?: string;
  onChange(value: number): void;
}) {
  const mayDecrease = !disabled && value > minimum;
  const mayIncrease = !disabled && value < maximum;

  return (
    <View style={styles.row}>
      <AppText variant="bodyStrong" style={styles.label}>
        {label}
      </AppText>
      <View style={styles.controls}>
        <StepperButton
          label={decreaseLabel ?? `Decrease ${label}`}
          symbol="−"
          disabled={!mayDecrease}
          onPress={() => onChange(value - 1)}
        />
        <AppText
          accessibilityLabel={
            valueLabel ?? `${label}: ${value} out of ${maximum}`
          }
          variant="heading"
          style={styles.value}
        >
          {value}
        </AppText>
        <StepperButton
          label={increaseLabel ?? `Increase ${label}`}
          symbol="+"
          disabled={!mayIncrease}
          onPress={() => onChange(value + 1)}
        />
      </View>
    </View>
  );
}

function StepperButton({
  label,
  symbol,
  disabled,
  onPress,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onPress(): void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepperButton,
        { backgroundColor: colors.accentSoft },
        pressed && !disabled && { backgroundColor: colors.surfaceStrong },
        disabled && styles.disabled,
      ]}
    >
      <AppText variant="heading" style={{ color: colors.accent }}>
        {symbol}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  label: { flex: 1 },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  value: { minWidth: 32, textAlign: 'center' },
  stepperButton: {
    alignItems: 'center',
    borderRadius: radii.sm,
    height: layout.minimumTouchTarget,
    justifyContent: 'center',
    width: layout.minimumTouchTarget,
  },
  disabled: { opacity: 0.35 },
});

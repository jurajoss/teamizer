import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './app-text';
import { colors, layout, radii, spacing } from './theme';

export function NumberStepper({
  label,
  value,
  minimum,
  maximum,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  disabled?: boolean;
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
          label={`Decrease ${label}`}
          symbol="−"
          disabled={!mayDecrease}
          onPress={() => onChange(value - 1)}
        />
        <AppText
          accessibilityLabel={`${label}: ${value} out of ${maximum}`}
          variant="heading"
          style={styles.value}
        >
          {value}
        </AppText>
        <StepperButton
          label={`Increase ${label}`}
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
        pressed && !disabled && styles.stepperButtonPressed,
        disabled && styles.disabled,
      ]}
    >
      <AppText variant="heading" tone="brand">
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
    backgroundColor: colors.brandSoft,
    borderRadius: radii.sm,
    height: layout.minimumTouchTarget,
    justifyContent: 'center',
    width: layout.minimumTouchTarget,
  },
  stepperButtonPressed: { backgroundColor: colors.surfaceStrong },
  disabled: { opacity: 0.35 },
});

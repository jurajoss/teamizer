import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { layout, spacing, useTheme } from '@teamizer/ui';

export function AppScreen({
  children,
  centered = false,
  scroll = false,
  underHeader = false,
  contentStyle,
}: {
  children: ReactNode;
  centered?: boolean;
  scroll?: boolean;
  underHeader?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 700 ? layout.pagePaddingTablet : layout.pagePaddingPhone;
  const sharedContentStyle = [
    styles.content,
    {
      paddingHorizontal: horizontalPadding,
      paddingTop: underHeader ? spacing.sm : layout.pagePaddingPhone,
    },
    centered && styles.centered,
    contentStyle,
  ];

  return (
    <SafeAreaView
      edges={
        underHeader
          ? ['right', 'bottom', 'left']
          : ['top', 'right', 'bottom', 'left']
      }
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={sharedContentStyle}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={sharedContentStyle}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: layout.contentMaxWidth,
    paddingBottom: layout.pagePaddingPhone,
    width: '100%',
  },
  centered: { justifyContent: 'center' },
});

import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  contentMaxWidth,
  layout,
  spacing,
  useResponsiveLayout,
  useTheme,
  type ContentWidth,
} from '@teamizer/ui';

import { appScreenSafeAreaEdges } from './app-screen-safe-area';
import { useShellSafeAreaOwnership } from './app-screen-shell-context';

export function AppScreen({
  children,
  centered = false,
  scroll = false,
  underHeader = false,
  contentWidth = 'readable',
  keyboardAvoiding = false,
  keyboardVerticalOffset = 0,
  stickyHeaderIndices,
  contentStyle,
}: {
  children: ReactNode;
  centered?: boolean;
  scroll?: boolean;
  underHeader?: boolean;
  contentWidth?: ContentWidth;
  keyboardAvoiding?: boolean;
  keyboardVerticalOffset?: number;
  stickyHeaderIndices?: number[];
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const { horizontalPadding } = useResponsiveLayout();
  const shellSafeAreaOwnership = useShellSafeAreaOwnership();
  const sharedContentStyle = [
    styles.content,
    {
      maxWidth: contentMaxWidth(contentWidth),
      paddingHorizontal: horizontalPadding,
      paddingTop: underHeader ? spacing.sm : layout.pagePaddingPhone,
    },
    centered && styles.centered,
    contentStyle,
  ];
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={sharedContentStyle}
      contentInsetAdjustmentBehavior="never"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={stickyHeaderIndices}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={sharedContentStyle}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={appScreenSafeAreaEdges(underHeader, shellSafeAreaOwnership)}
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={keyboardVerticalOffset}
          style={styles.safe}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    paddingBottom: layout.pagePaddingPhone,
    width: '100%',
  },
  centered: { justifyContent: 'center' },
});

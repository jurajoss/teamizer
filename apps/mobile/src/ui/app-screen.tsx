import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, layout } from '@teamizer/ui';

export function AppScreen({
  children,
  centered = false,
  scroll = false,
  contentStyle,
}: {
  children: ReactNode;
  centered?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const horizontalPadding =
    width >= 700 ? layout.pagePaddingTablet : layout.pagePaddingPhone;
  const sharedContentStyle = [
    styles.content,
    { paddingHorizontal: horizontalPadding },
    centered && styles.centered,
    contentStyle,
  ];

  return (
    <SafeAreaView
      edges={['top', 'right', 'bottom', 'left']}
      style={styles.safe}
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
  safe: { backgroundColor: colors.canvas, flex: 1 },
  content: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: layout.contentMaxWidth,
    paddingBottom: layout.pagePaddingPhone,
    paddingTop: layout.pagePaddingPhone,
    width: '100%',
  },
  centered: { justifyContent: 'center' },
});

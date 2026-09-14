import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from './app-text';
import {
  avatarInitials,
  avatarInitialsLayout,
  avatarSizeMetrics,
  type AvatarSize,
} from './avatar-utils';
import { radii } from './theme';
import { useTheme } from './theme-provider';

export type { AvatarSize } from './avatar-utils';

export function Avatar({
  name,
  url,
  size = 'medium',
  style,
  accessibilityLabel,
}: {
  name: string;
  url: string | null;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { dimension, fontSize, lineHeight } = avatarSizeMetrics[size];

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? name}
      accessibilityRole="image"
      style={[
        styles.frame,
        {
          backgroundColor: colors.accentSoft,
          borderColor: colors.borderStrong,
          borderRadius: dimension / 2,
          height: dimension,
          width: dimension,
        },
        style,
      ]}
    >
      {url && failedUrl !== url ? (
        <Image
          onError={() => setFailedUrl(url)}
          resizeMode="cover"
          source={{ uri: url }}
          style={{ height: dimension, width: dimension }}
        />
      ) : (
        <AppText
          numberOfLines={1}
          style={[
            styles.initials,
            { color: colors.accent, fontSize, lineHeight },
          ]}
          variant="label"
        >
          {avatarInitials(name)}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: avatarInitialsLayout,
});

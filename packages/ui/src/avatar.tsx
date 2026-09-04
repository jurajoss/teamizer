import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { AppText } from './app-text';
import { avatarInitials } from './avatar-utils';
import { colors, radii } from './theme';

export type AvatarSize = 'small' | 'medium' | 'large' | 'hero';

const avatarSizes: Record<AvatarSize, number> = {
  small: 32,
  medium: 44,
  large: 64,
  hero: 96,
};

export function Avatar({
  name,
  url,
  size = 'medium',
  style,
}: {
  name: string;
  url: string | null;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const dimension = avatarSizes[size];

  return (
    <View
      accessibilityLabel={`${name} avatar`}
      accessibilityRole="image"
      style={[
        styles.frame,
        { borderRadius: dimension / 2, height: dimension, width: dimension },
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
          style={{ fontSize: Math.max(12, Math.round(dimension * 0.34)) }}
          tone="brand"
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
    backgroundColor: colors.brandSoft,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

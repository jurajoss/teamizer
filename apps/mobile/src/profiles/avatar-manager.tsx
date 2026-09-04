import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Avatar, Button, FeedbackBanner, spacing } from '@teamizer/ui';

import { prepareAvatar, type PreparedAvatar } from './avatar-picker';

export function AvatarManager({
  busy,
  name,
  url,
  onRemove,
  onUpload,
}: {
  busy: boolean;
  name: string;
  url: string | null;
  onRemove(): Promise<void>;
  onUpload(file: PreparedAvatar): Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);

  const choose = async (source: 'CAMERA' | 'LIBRARY') => {
    setMessage(null);
    try {
      const file = await prepareAvatar(source);
      if (file) await onUpload(file);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'The photo could not be used.',
      );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Avatar name={name} size="hero" url={url} />
        <View style={styles.copy}>
          <AppText variant="heading">Player photo</AppText>
          <AppText tone="muted">
            Photos are cropped to a square and stored with the Player identity.
          </AppText>
        </View>
      </View>
      {message ? <FeedbackBanner tone="error" message={message} /> : null}
      <View style={styles.actions}>
        <Button
          disabled={busy}
          fullWidth={false}
          label="Choose photo"
          onPress={() => void choose('LIBRARY')}
          variant="secondary"
        />
        <Button
          disabled={busy}
          fullWidth={false}
          label="Take photo"
          onPress={() => void choose('CAMERA')}
          variant="secondary"
        />
        {url ? (
          <Button
            disabled={busy}
            fullWidth={false}
            label="Remove photo"
            onPress={() => void onRemove()}
            variant="ghost"
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  identity: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  copy: { flex: 1, gap: spacing.xs, minWidth: 180 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

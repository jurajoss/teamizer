import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);

  const choose = async (source: 'CAMERA' | 'LIBRARY') => {
    setMessage(null);
    try {
      const file = await prepareAvatar(source);
      if (file) await onUpload(file);
    } catch {
      setMessage(t('profile.photoFailed'));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <Avatar name={name} size="hero" url={url} />
        <View style={styles.copy}>
          <AppText variant="heading">{t('profile.photo')}</AppText>
          <AppText tone="muted">{t('profile.photoHint')}</AppText>
        </View>
      </View>
      {message ? <FeedbackBanner tone="error" message={message} /> : null}
      <View style={styles.actions}>
        <Button
          disabled={busy}
          fullWidth={false}
          label={t('profile.choosePhoto')}
          onPress={() => void choose('LIBRARY')}
          variant="secondary"
        />
        <Button
          disabled={busy}
          fullWidth={false}
          label={t('profile.takePhoto')}
          onPress={() => void choose('CAMERA')}
          variant="secondary"
        />
        {url ? (
          <Button
            disabled={busy}
            fullWidth={false}
            label={t('profile.removePhoto')}
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

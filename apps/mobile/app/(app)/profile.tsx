import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  Button,
  FeedbackBanner,
  radii,
  spacing,
  StatusPill,
  Surface,
  TextField,
  useTheme,
} from '@teamizer/ui';

import type { PlayerDetail } from '../../src/api/contracts';
import { AvatarManager } from '../../src/profiles/avatar-manager';
import { useProfileController } from '../../src/profiles/use-profile-controller';
import { usePreferences } from '../../src/preferences/preferences-context';
import { useAppServices } from '../../src/providers/app-services-context';
import { useSession } from '../../src/session/session-context';
import {
  formatGoalsPerMatch,
  formatWinRate,
} from '../../src/statistics/statistics';
import { AppScreen } from '../../src/ui/app-screen';
import { FoundationScreen } from '../../src/ui/foundation-screen';

export default function ProfileRoute() {
  const { t } = useTranslation();
  const { state, refreshCurrentUser } = useSession();
  const { apiClient } = useAppServices();
  const playerId =
    state.status === 'AUTHENTICATED' ? state.currentUser.player.id : null;
  const profile = useProfileController({
    apiClient,
    playerId,
    refreshCurrentUser,
  });

  if (state.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message={t('home.checking')} />;
  }
  const { contentState, profileQuery } = profile;

  return (
    <AppScreen scroll underHeader contentStyle={styles.screen}>
      {contentState === 'LOADING' ? (
        <Surface tone="muted" style={styles.stateCard}>
          <AppText variant="heading">{t('profile.loading')}</AppText>
        </Surface>
      ) : null}
      {contentState === 'ERROR' ? (
        <View style={styles.stateCard}>
          <FeedbackBanner
            tone="error"
            title={t('profile.unavailable')}
            message={t('common.connectionRetry')}
          />
          <Button
            label={t('common.retry')}
            onPress={() => void profileQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}
      {contentState === 'EMPTY' ? (
        <FeedbackBanner
          tone="error"
          title={t('profile.unavailable')}
          message={t('profile.missing')}
        />
      ) : null}
      {contentState === 'READY' && profileQuery.data ? (
        <>
          <ProfileHeading player={profileQuery.data} />
          {profile.message ? (
            <FeedbackBanner tone="success" message={profile.message} />
          ) : null}
          {profile.errorMessage ? (
            <FeedbackBanner tone="error" message={profile.errorMessage} />
          ) : null}
          <Surface style={styles.formCard}>
            <View style={styles.sectionHeading}>
              <AppText variant="eyebrow" tone="brand">
                {t('profile.publicProfile').toUpperCase()}
              </AppText>
              <AppText variant="heading">{t('profile.displayName')}</AppText>
              <AppText tone="muted">{t('profile.privacy')}</AppText>
            </View>
            <TextField
              autoCapitalize="words"
              editable={!profile.namePending}
              label={t('profile.playerName')}
              maxLength={120}
              onChangeText={profile.setName}
              value={profile.name}
            />
            <Button
              busy={profile.namePending}
              disabled={
                !profile.name.trim() ||
                profile.name.trim() === profileQuery.data.name
              }
              label={t('profile.saveName')}
              onPress={profile.saveName}
            />
          </Surface>
          <Surface style={styles.formCard}>
            <AvatarManager
              busy={profile.avatarPending}
              name={profileQuery.data.name}
              url={profileQuery.data.avatarUrl}
              onRemove={async () => {
                await profile.removeAvatar();
              }}
              onUpload={async (file) => {
                await profile.uploadAvatar(file);
              }}
            />
          </Surface>
          <StatisticsCard player={profileQuery.data} />
        </>
      ) : null}
    </AppScreen>
  );
}

function ProfileHeading({ player }: { player: PlayerDetail }) {
  const { t } = useTranslation();
  return (
    <View style={styles.heading}>
      <Avatar name={player.name} size="hero" url={player.avatarUrl} />
      <View style={styles.headingCopy}>
        <View style={styles.pills}>
          <StatusPill
            label={
              player.status === 'ACTIVE'
                ? t('status.active')
                : t('status.inactive')
            }
            tone={player.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
          <StatusPill label={t('profile.regularPlayer')} tone="neutral" />
        </View>
        <AppText accessibilityRole="header" variant="title">
          {player.name}
        </AppText>
      </View>
    </View>
  );
}

function StatisticsCard({ player }: { player: PlayerDetail }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { language } = usePreferences();
  const metrics = [
    [t('common.matches'), String(player.statistics.matches)],
    [t('common.winRate'), formatWinRate(player.statistics.winRate, language)],
    [t('common.goals'), String(player.statistics.goals)],
    [
      t('common.goalsPerMatch'),
      formatGoalsPerMatch(player.statistics.goalsPerMatch, language),
    ],
  ] as const;
  return (
    <Surface tone="brand" style={styles.formCard}>
      <View style={styles.sectionHeading}>
        <AppText variant="eyebrow" tone="brand">
          {t('home.performance').toUpperCase()}
        </AppText>
        <AppText variant="heading">{t('profile.summary')}</AppText>
      </View>
      <View style={styles.metrics}>
        {metrics.map(([label, value]) => (
          <View
            key={label}
            style={[styles.metric, { backgroundColor: colors.surface }]}
          >
            <AppText variant="heading">{value}</AppText>
            <AppText variant="caption" tone="muted">
              {label}
            </AppText>
          </View>
        ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  heading: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xl,
  },
  headingCopy: { flex: 1, gap: spacing.sm, minWidth: 220 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stateCard: { gap: spacing.md },
  formCard: { gap: spacing.lg },
  sectionHeading: { gap: spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    borderRadius: radii.md,
    flexBasis: 120,
    flexGrow: 1,
    gap: spacing.xxs,
    padding: spacing.md,
  },
});

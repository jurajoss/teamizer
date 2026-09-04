import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Avatar,
  BrandLockup,
  Button,
  colors,
  FeedbackBanner,
  spacing,
  StatusPill,
  Surface,
} from '@teamizer/ui';

import { useSession } from '../../src/session/session-context';
import {
  formatMatchDate,
  matchRouteFor,
  primaryUpcomingMatch,
} from '../../src/matches/match-flow';
import { matchQueryKeys } from '../../src/matches/match-query-keys';
import { useAppServices } from '../../src/providers/app-services-context';
import { AppScreen } from '../../src/ui/app-screen';
import { FoundationScreen } from '../../src/ui/foundation-screen';
import { statisticsRoute } from '../../src/statistics/statistics';

export default function AuthenticatedHomeScreen() {
  const { state, signOut } = useSession();
  const { apiClient } = useAppServices();
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const upcomingQuery = useQuery({
    queryKey: matchQueryKeys.upcoming,
    queryFn: () => apiClient.getUpcomingMatches(),
    enabled: state.status === 'AUTHENTICATED',
  });

  if (state.status !== 'AUTHENTICATED') {
    return <FoundationScreen busy message="Checking your Teamizer profile…" />;
  }

  const roleLabel =
    state.currentUser.user.role === 'ADMIN' ? 'Administrator' : 'Player';
  const statusLabel =
    state.currentUser.player.status === 'ACTIVE' ? 'Active' : 'Inactive';

  const submitSignOut = async () => {
    setSigningOut(true);
    setMessage(null);

    try {
      await signOut();
    } catch {
      setMessage('Sign-out failed. Try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <AppScreen scroll contentStyle={styles.screen}>
      <View style={styles.topBar}>
        <BrandLockup compact />
        <Button
          busy={signingOut}
          fullWidth={false}
          label="Sign out"
          onPress={() => void submitSignOut()}
          variant="ghost"
        />
      </View>

      <View style={styles.hero}>
        <StatusPill label="TEAMIZER" />
        <View style={styles.heroCopy}>
          <AppText accessibilityRole="header" variant="display">
            Your next Match.
          </AppText>
          <AppText tone="muted">
            Welcome, {state.currentUser.player.name}. Respond, see who’s in, and
            get ready to play.
          </AppText>
        </View>
      </View>

      <UpcomingMatchSection
        error={upcomingQuery.isError}
        loading={upcomingQuery.isPending}
        match={primaryUpcomingMatch(upcomingQuery.data ?? [])}
        onOpen={(matchId) => router.push(matchRouteFor(matchId))}
        onRetry={() => void upcomingQuery.refetch()}
      />

      <Surface tone="brand" style={styles.statisticsCard}>
        <View style={styles.cardHeading}>
          <AppText variant="eyebrow" tone="brand">
            PERFORMANCE
          </AppText>
          <AppText variant="heading">Statistics & ranking</AppText>
          <AppText tone="muted">
            Compare finished-Match results, then open any Player’s recent
            history.
          </AppText>
        </View>
        <Button
          label="View player ranking"
          onPress={() => router.push(statisticsRoute())}
          variant="secondary"
        />
      </Surface>

      <Surface style={styles.profileCard}>
        <View style={styles.profileHeading}>
          <Avatar
            name={state.currentUser.player.name}
            size="large"
            url={state.currentUser.player.avatarUrl}
          />
          <View style={styles.cardHeading}>
            <AppText variant="eyebrow" tone="brand">
              YOUR PLAYER
            </AppText>
            <AppText variant="heading">{state.currentUser.player.name}</AppText>
          </View>
        </View>
        <View style={styles.detailRow}>
          <AppText variant="caption" tone="muted">
            Account role
          </AppText>
          <AppText variant="bodyStrong">{roleLabel}</AppText>
        </View>
        <View style={[styles.detailRow, styles.lastDetailRow]}>
          <AppText variant="caption" tone="muted">
            Player status
          </AppText>
          <StatusPill
            label={statusLabel.toUpperCase()}
            tone={statusLabel === 'Active' ? 'success' : 'neutral'}
          />
        </View>
        <Button
          label="Edit profile and photo"
          onPress={() => router.push('/profile' as Href)}
          variant="secondary"
        />
      </Surface>

      {state.currentUser.user.role === 'ADMIN' ? (
        <Surface tone="muted" style={styles.adminCard}>
          <View style={styles.cardHeading}>
            <AppText variant="eyebrow" tone="brand">
              ADMINISTRATION
            </AppText>
            <AppText variant="heading">Administration</AppText>
            <AppText tone="muted">
              Set up Matches and the weekly Schedule, or manage Player
              identities and status.
            </AppText>
          </View>
          <View style={styles.adminActions}>
            <Button
              label="Manage Matches"
              onPress={() => router.push('/admin/matches' as Href)}
            />
            <Button
              label="Manage Players"
              onPress={() => router.push('/admin/players' as Href)}
              variant="secondary"
            />
          </View>
        </Surface>
      ) : null}

      {message ? <FeedbackBanner tone="error" message={message} /> : null}
    </AppScreen>
  );
}

function UpcomingMatchSection({
  error,
  loading,
  match,
  onOpen,
  onRetry,
}: {
  error: boolean;
  loading: boolean;
  match: ReturnType<typeof primaryUpcomingMatch>;
  onOpen(matchId: string): void;
  onRetry(): void;
}) {
  if (loading) {
    return (
      <Surface tone="muted" style={styles.matchState}>
        <AppText variant="heading">Loading upcoming Match…</AppText>
        <AppText tone="muted">
          Checking the latest attendance and status.
        </AppText>
      </Surface>
    );
  }

  if (error) {
    return (
      <View style={styles.matchState}>
        <FeedbackBanner
          tone="error"
          title="Upcoming Match unavailable"
          message="Check your connection and try again."
        />
        <Button label="Try again" onPress={onRetry} variant="secondary" />
      </View>
    );
  }

  if (!match) {
    return (
      <Surface tone="muted" style={styles.matchState}>
        <AppText variant="heading">No upcoming Match</AppText>
        <AppText tone="muted">
          There is no open or in-progress Match scheduled right now.
        </AppText>
      </Surface>
    );
  }

  const attendance =
    match.myAttendance === 'GOING'
      ? 'GOING'
      : match.myAttendance === 'NOT_GOING'
        ? 'NOT GOING'
        : 'UNANSWERED';

  return (
    <Surface style={styles.upcomingCard}>
      <View style={styles.matchTopline}>
        <StatusPill
          label={
            match.status === 'IN_PROGRESS' ? 'IN PROGRESS' : 'REGISTRATION OPEN'
          }
          tone={match.status === 'IN_PROGRESS' ? 'info' : 'success'}
        />
        <AppText variant="caption" tone="muted">
          {attendance}
        </AppText>
      </View>
      <View style={styles.matchCopy}>
        <AppText variant="heading">{match.sport.name}</AppText>
        <AppText variant="bodyStrong">
          {formatMatchDate(match.startsAt)}
        </AppText>
        {match.location ? (
          <AppText tone="muted">{match.location}</AppText>
        ) : null}
      </View>
      <Button
        label={
          match.status === 'IN_PROGRESS' ? 'Open Match' : 'View attendance'
        }
        onPress={() => onOpen(match.id)}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.xxl,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  hero: {
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  heroCopy: { gap: spacing.sm, maxWidth: 600 },
  profileCard: { gap: 0 },
  profileHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  adminCard: { gap: spacing.lg },
  adminActions: { gap: spacing.sm },
  statisticsCard: { gap: spacing.lg },
  matchState: { gap: spacing.md },
  upcomingCard: { gap: spacing.lg },
  matchTopline: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  matchCopy: { gap: spacing.xs },
  cardHeading: {
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  detailRow: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  lastDetailRow: { paddingTop: spacing.xxs },
});

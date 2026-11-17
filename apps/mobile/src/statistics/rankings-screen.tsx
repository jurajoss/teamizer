import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  borderWidths,
  Button,
  FeedbackBanner,
  radii,
  sizes,
  spacing,
  useTheme,
} from '@teamizer/ui';

import type { RankingRow } from '../api/contracts';
import { FinishedMatchResultIndicator } from '../matches/match-list-row';
import { usePreferences } from '../preferences/preferences-context';
import { useAppServices } from '../providers/app-services-context';
import { AppScreen } from '../ui/app-screen';
import { AppIcon } from '../ui/icons/app-icon';
import { SegmentedControl } from '../ui/segmented-control';
import { RankingTrophy } from './ranking-trophy';
import { statisticsQueryKeys } from './statistics-query-keys';
import {
  fetchAllRankingRows,
  formatRankingStatistic,
  playerRouteFor,
  rankingCriteria,
  rankingRows,
  statisticsViewState,
  type RankingCriterion,
} from './statistics';

export function RankingsScreen() {
  const { apiClient } = useAppServices();
  const { language } = usePreferences();
  const { t } = useTranslation();
  const [criterion, setCriterion] = useState<RankingCriterion>('winRate');
  const rankingQuery = useQuery({
    queryKey: statisticsQueryKeys.rankings,
    queryFn: () =>
      fetchAllRankingRows((options) => apiClient.getRankings(options)),
  });
  const rows = rankingRows(rankingQuery.data ?? [], criterion);
  const viewState = statisticsViewState(
    rankingQuery.isPending,
    rankingQuery.isError,
    rows.length,
  );

  return (
    <AppScreen
      scroll
      underHeader
      contentWidth="readable"
      contentStyle={styles.screen}
    >
      <RankingCriterionControl criterion={criterion} onChange={setCriterion} />

      {viewState === 'loading' ? (
        <View style={styles.lightweightState}>
          <AppText tone="muted">{t('ranking.loading')}</AppText>
        </View>
      ) : null}

      {viewState === 'error' ? (
        <View style={styles.errorState}>
          <FeedbackBanner
            tone="error"
            title={t('ranking.unavailable')}
            message={t('common.connectionRetry')}
          />
          <Button
            fullWidth={false}
            label={t('common.retry')}
            onPress={() => void rankingQuery.refetch()}
            variant="secondary"
          />
        </View>
      ) : null}

      {viewState === 'empty' ? (
        <View style={styles.lightweightState}>
          <AppText tone="muted">{t('ranking.empty')}</AppText>
        </View>
      ) : null}

      {viewState === 'success' ? (
        <View accessibilityLabel={t('ranking.listLabel')} style={styles.list}>
          {rows.map((row) => (
            <RankingListRow
              criterion={criterion}
              key={row.player.id}
              language={language}
              row={row}
              onOpen={() => router.navigate(playerRouteFor(row.player.id))}
            />
          ))}
        </View>
      ) : null}
    </AppScreen>
  );
}

export function RankingCriterionControl({
  criterion,
  onChange,
}: {
  criterion: RankingCriterion;
  onChange(criterion: RankingCriterion): void;
}) {
  const { t } = useTranslation();

  return (
    <SegmentedControl
      items={rankingCriteria.map((item) => ({
        label: t(`ranking.criteria.${item}`),
        value: item,
      }))}
      onChange={onChange}
      shrinkLabelsToFit={false}
      value={criterion}
    />
  );
}

export function RankingListRow({
  criterion,
  language,
  row,
  onOpen,
}: {
  criterion: RankingCriterion;
  language: 'cs' | 'en';
  row: RankingRow;
  onOpen(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const statistic = formatRankingStatistic(row, criterion, language);
  const statisticSecondary =
    criterion === 'participation'
      ? t('ranking.participationSummary', {
          played: row.statistics.attendance.playedMatches,
          total: row.statistics.attendance.totalMatches,
        })
      : null;
  const winRateSecondary =
    criterion === 'winRate'
      ? t('ranking.winRateSummary', {
          draws: row.statistics.draws,
          losses: row.statistics.losses,
          wins: row.statistics.wins,
        })
      : null;
  const criterionLabel = t(`ranking.criteria.${criterion}`);

  return (
    <Pressable
      accessible
      accessibilityHint={t('ranking.openHint')}
      accessibilityLabel={`${row.rank}. ${row.player.name}. ${criterionLabel}: ${statistic}${winRateSecondary ? `, ${winRateSecondary}` : statisticSecondary ? `, ${statisticSecondary}` : ''}`}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed
            ? colors.surfaceStrong
            : colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      <RankingIndicator rank={row.rank} />
      <Avatar name={row.player.name} size="small" url={row.player.avatarUrl} />
      <View style={styles.identity}>
        <AppText numberOfLines={1} variant="bodyStrong">
          {row.player.name}
        </AppText>
        {row.player.type === 'GUEST' ? (
          <AppText numberOfLines={1} tone="muted" variant="caption">
            {t('common.guest')}
          </AppText>
        ) : null}
      </View>
      <View
        style={[
          styles.statisticGroup,
          criterion === 'winRate' && styles.winRateStatisticGroup,
        ]}
      >
        <AppText
          numberOfLines={1}
          style={[styles.statistic, { color: colors.textPrimary }]}
          variant="bodyStrong"
        >
          {statistic}
        </AppText>
        {criterion === 'winRate' ? (
          <RankingWinRateBreakdown
            draws={row.statistics.draws}
            losses={row.statistics.losses}
            wins={row.statistics.wins}
          />
        ) : statisticSecondary ? (
          <AppText
            numberOfLines={1}
            style={styles.statistic}
            tone="muted"
            variant="caption"
          >
            {statisticSecondary}
          </AppText>
        ) : null}
      </View>
      <AppIcon
        color={colors.textSecondary}
        name="next"
        size={sizes.icon.medium}
      />
    </Pressable>
  );
}

export function RankingWinRateBreakdown({
  draws,
  losses,
  wins,
}: {
  draws: number;
  losses: number;
  wins: number;
}) {
  const results = [
    { count: wins, result: 'WIN' },
    { count: draws, result: 'DRAW' },
    { count: losses, result: 'LOSS' },
  ] as const;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.winRateBreakdown}
    >
      {results.map(({ count, result }) => (
        <View key={result} style={styles.resultCount}>
          <FinishedMatchResultIndicator result={result} size="dense" />
          <AppText
            numberOfLines={1}
            style={styles.resultCountText}
            tone="muted"
            variant="caption"
          >
            {count}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function RankingIndicator({ rank }: { rank: number }) {
  const { colors } = useTheme();
  const trophyRank = rank === 1 || rank === 2 || rank === 3 ? rank : null;
  const trophyColor =
    trophyRank === 1
      ? colors.medalGold
      : trophyRank === 2
        ? colors.medalSilver
        : colors.medalBronze;

  return (
    <View style={styles.rank}>
      {trophyRank ? (
        <RankingTrophy
          color={trophyColor}
          numberColor={colors.medalNumber}
          rank={trophyRank}
        />
      ) : (
        <AppText
          style={[styles.rankNumber, { color: colors.textSecondary }]}
          variant="caption"
        >
          {rank}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  lightweightState: { paddingVertical: spacing.lg },
  errorState: { alignItems: 'flex-start', gap: spacing.sm },
  list: { gap: spacing.xxs },
  row: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 64,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rank: {
    alignItems: 'center',
    justifyContent: 'center',
    width: spacing.xxxl,
  },
  rankNumber: { fontVariant: ['tabular-nums'] },
  identity: { flex: 1, minWidth: 0 },
  statisticGroup: {
    alignItems: 'flex-end',
    flexShrink: 0,
    width: spacing.jumbo + spacing.xxxl + spacing.xs,
  },
  winRateStatisticGroup: {
    width: spacing.jumbo * 2 + spacing.lg,
  },
  statistic: {
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  winRateBreakdown: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    justifyContent: 'flex-end',
  },
  resultCount: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs / 2,
  },
  resultCountText: { fontVariant: ['tabular-nums'] },
});

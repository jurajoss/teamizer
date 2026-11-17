import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Path, Svg } from 'react-native-svg';

import {
  AppText,
  borderWidths,
  radii,
  sizes,
  spacing,
  statusColorSet,
  useTheme,
  type StatusTone,
} from '@teamizer/ui';

import type { Attendance, PlayerPublic } from '../api/contracts';
import { AppIcon } from '../ui/icons/app-icon';
import { PlayerAvatarStack } from '../ui/player-avatar-stack';
import {
  formatMatchListDate,
  matchListAvatarLimit,
  type MatchListScore,
  type PersonalMatchResult,
} from './matches-index-model';

const resultIndicatorSizes = {
  dense: spacing.sm * 0.75,
  compact: spacing.sm,
  row: spacing.sm * 1.25,
} as const;

export function MatchListRow({
  attendance,
  kind,
  language,
  personalGoals,
  players,
  result,
  score,
  startsAt,
  mode,
  viewportWidth,
  onOpen,
}: {
  attendance: Attendance | null;
  kind: 'upcoming' | 'finished';
  language: 'cs' | 'en';
  personalGoals: number | null;
  players: PlayerPublic[];
  result: PersonalMatchResult | null;
  score: MatchListScore | null;
  startsAt: string;
  mode: 'phone' | 'tablet';
  viewportWidth: number;
  onOpen(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const date = formatMatchListDate(startsAt, language);
  const attendanceBadge = attendance
    ? attendance === 'GOING'
      ? { label: t('matchesIndex.going'), tone: 'success' as const }
      : { label: t('matchesIndex.notGoing'), tone: 'danger' as const }
    : null;
  const resultLabel = matchResultLabel(result, {
    didNotPlay: t('matchesIndex.didNotPlay'),
    draw: t('matchesIndex.draw'),
    loss: t('matchesIndex.loss'),
    win: t('matchesIndex.win'),
  });
  const scoreLabel = score ? `${score.teamA} : ${score.teamB}` : null;
  const goalsLabel =
    personalGoals === null
      ? null
      : t('common.goalCount', { count: personalGoals });
  const accessibilityLabel = [
    `${date.weekday} ${date.date}`,
    players.map(({ name }) => name).join(', '),
    scoreLabel,
    goalsLabel,
    resultLabel ?? attendanceBadge?.label,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      accessibilityHint={t('matchesIndex.openHint')}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [
        styles.matchRow,
        kind === 'finished' && styles.finishedMatchRow,
        {
          backgroundColor: pressed
            ? colors.surfaceStrong
            : colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[styles.dateBlock, { backgroundColor: colors.surfaceSubtle }]}
      >
        <AppText numberOfLines={1} variant="label">
          {date.weekday}
        </AppText>
        <AppText numberOfLines={1} variant="bodyStrong">
          {date.date}
        </AppText>
      </View>
      <View style={styles.participantSlot}>
        <PlayerAvatarStack
          maxVisible={matchListAvatarLimit(mode, kind, viewportWidth)}
          players={players}
        />
      </View>
      {kind === 'finished' ? (
        <View style={styles.finishedResultBlock}>
          <FinishedMatchResultIndicator result={result} />
          <View style={styles.finishedScoreColumn}>
            <FinishedMatchScore score={score} />
            {goalsLabel ? (
              <AppText
                numberOfLines={1}
                style={styles.personalGoals}
                tone="muted"
                variant="caption"
              >
                {goalsLabel}
              </AppText>
            ) : null}
          </View>
        </View>
      ) : null}
      {attendanceBadge ? (
        <CompactMatchStatus
          label={attendanceBadge.label}
          tone={attendanceBadge.tone}
        />
      ) : null}
      <AppIcon color={colors.textSecondary} name="next" />
    </Pressable>
  );
}

export function FinishedMatchScore({
  score,
}: {
  score: MatchListScore | null;
}) {
  const teamAWidth = scoreSideWidthStyle(score?.teamA);
  const teamBWidth = scoreSideWidthStyle(score?.teamB);

  return (
    <View style={styles.finishedScore}>
      <AppText
        numberOfLines={1}
        style={[styles.scoreNumber, teamAWidth, styles.scoreLeft]}
        variant="bodyStrong"
      >
        {score?.teamA ?? ''}
      </AppText>
      <AppText
        numberOfLines={1}
        style={styles.scoreSeparator}
        variant="bodyStrong"
      >
        {score ? ':' : ''}
      </AppText>
      <AppText
        numberOfLines={1}
        style={[styles.scoreNumber, teamBWidth, styles.scoreRight]}
        variant="bodyStrong"
      >
        {score?.teamB ?? ''}
      </AppText>
    </View>
  );
}

function scoreSideWidthStyle(value: number | undefined) {
  return value === undefined || (value >= 0 && value <= 99)
    ? styles.scoreNumberNormal
    : styles.scoreNumberUnexpected;
}

export function FinishedMatchResultIndicator({
  result,
  size = 'row',
}: {
  result: PersonalMatchResult | null;
  size?: keyof typeof resultIndicatorSizes;
}) {
  const { colors } = useTheme();
  const indicatorSize = resultIndicatorSizes[size];
  let color = colors.textSecondary;
  let trianglePath: string | null = null;
  let glyph: string | null = null;
  if (result === 'WIN') {
    color = colors.success;
    trianglePath = 'M6 1 L11 11 H1 Z';
  } else if (result === 'LOSS') {
    color = colors.danger;
    trianglePath = 'M1 1 H11 L6 11 Z';
  } else if (result === 'DRAW') {
    trianglePath = 'M2 1 L11 6 L2 11 Z';
  } else if (result === 'DID_NOT_PLAY') {
    glyph = '—';
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.resultIndicatorSlot, { width: indicatorSize }]}
    >
      {trianglePath ? (
        <Svg height={indicatorSize} viewBox="0 0 12 12" width={indicatorSize}>
          <Path d={trianglePath} fill={color} />
        </Svg>
      ) : glyph ? (
        <AppText numberOfLines={1} style={{ color }} variant="caption">
          {glyph}
        </AppText>
      ) : null}
    </View>
  );
}

function matchResultLabel(
  result: PersonalMatchResult | null,
  labels: { didNotPlay: string; draw: string; loss: string; win: string },
): string | null {
  if (result === 'WIN') return labels.win;
  if (result === 'LOSS') return labels.loss;
  if (result === 'DRAW') return labels.draw;
  if (result === 'DID_NOT_PLAY') return labels.didNotPlay;
  return null;
}

function CompactMatchStatus({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  const { colors } = useTheme();
  const toneColors = statusColorSet(colors, tone);

  return (
    <View
      style={[
        styles.status,
        {
          backgroundColor: toneColors.background,
          borderColor: toneColors.border,
        },
      ]}
    >
      <AppText
        numberOfLines={1}
        variant="label"
        style={{ color: toneColors.foreground }}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  matchRow: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  finishedMatchRow: {
    gap: spacing.xxs,
    minHeight: sizes.minimumTouchTarget + spacing.lg,
    paddingVertical: spacing.xxs,
  },
  dateBlock: {
    alignItems: 'center',
    borderRadius: radii.sm,
    justifyContent: 'center',
    minHeight: 54,
    width: 64,
  },
  participantSlot: { flex: 1, minWidth: 0, overflow: 'hidden' },
  finishedScore: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
  },
  finishedResultBlock: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xxs,
    paddingRight: spacing.xs,
  },
  finishedScoreColumn: {
    alignItems: 'center',
    flexShrink: 0,
  },
  personalGoals: { minHeight: 18, textAlign: 'center' },
  scoreNumber: { fontVariant: ['tabular-nums'] },
  scoreNumberNormal: { width: spacing.xl },
  scoreNumberUnexpected: { minWidth: spacing.xxl },
  scoreLeft: { textAlign: 'right' },
  scoreSeparator: { textAlign: 'center', width: spacing.sm },
  scoreRight: { textAlign: 'left' },
  resultIndicatorSlot: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
  },
  status: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    flexShrink: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

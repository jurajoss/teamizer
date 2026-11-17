import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  borderWidths,
  Button,
  Card,
  FeedbackBanner,
  layout,
  radii,
  sizes,
  spacing,
  TeamTintAccent,
  TeamTintBackground,
  useResponsiveLayout,
  useTheme,
} from '@teamizer/ui';

import type { MatchDetail } from '../api/contracts';
import { AppScreen } from '../ui/app-screen';
import { AppIcon } from '../ui/icons/app-icon';
import type { LocalMatchDraftV1 } from './local-match-draft';
import {
  SCORING_PLAYER_TILE_MIN_HEIGHT,
  SCORING_SCOREBOARD_PHONE_MAX_WIDTH,
  SCORING_STICKY_SCORE_INDEX,
} from './scoring-layout';
import {
  activateScoringMinus,
  activateScoringPlayerTile,
  scoringGridRows,
  scoringPlayerTileModel,
  scoringTeamColorRoles,
  type ScoringPlayer,
} from './scoring-screen-model';
import { ScoringScorePanel } from './scoring-score-panel';
import type { ScoringSessionNotice } from './scoring-session-controller';
import { scoringNoticeTranslationKey } from './scoring-session-presentation';

export function ActiveScoringScreen({
  draft,
  match,
  notice,
  onAddGoal,
  onFinish,
  onRemoveGoal,
}: {
  draft: LocalMatchDraftV1;
  match: MatchDetail;
  notice: ScoringSessionNotice | null;
  onAddGoal(playerId: string): void;
  onFinish(): Promise<void>;
  onRemoveGoal(playerId: string): void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const pending = draft.completion.state === 'PENDING';
  const noticeKey = scoringNoticeTranslationKey(notice);

  const finish = async () => {
    setFinishing(true);
    try {
      await onFinish();
    } finally {
      setFinishing(false);
      setConfirming(false);
    }
  };

  return (
    <AppScreen
      contentStyle={styles.screen}
      contentWidth="working"
      scroll
      stickyHeaderIndices={[SCORING_STICKY_SCORE_INDEX]}
      underHeader
    >
      <StickyMatchScore score={draft.score} />
      <View style={styles.scoringContent}>
        {noticeKey ? (
          <FeedbackBanner message={t(noticeKey)} tone="warning" />
        ) : null}
        <ScoringPlayerGrid
          disabled={pending}
          match={match}
          playerGoals={draft.playerGoals}
          onAddGoal={onAddGoal}
          onRemoveGoal={onRemoveGoal}
        />
        <ScoringCompletionAction
          busy={finishing}
          confirming={confirming}
          pending={pending}
          score={draft.score}
          onBegin={() => setConfirming(true)}
          onConfirm={() => void finish()}
          onContinue={() => setConfirming(false)}
        />
      </View>
    </AppScreen>
  );
}

export function ScoringCompletionAction({
  busy,
  confirming,
  pending,
  score,
  onBegin,
  onConfirm,
  onContinue,
}: {
  busy: boolean;
  confirming: boolean;
  pending: boolean;
  score: LocalMatchDraftV1['score'];
  onBegin(): void;
  onConfirm(): void;
  onContinue(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const completionIcon = (
    <AppIcon
      color={colors.accentContrast}
      name="complete"
      size={sizes.icon.medium}
    />
  );

  return (
    <View style={styles.completionArea}>
      {confirming && !pending ? (
        <View style={styles.confirmation}>
          <FeedbackBanner
            message={t('match.authoritativeResult', {
              teamA: score.teamA,
              teamB: score.teamB,
            })}
            title={t('match.submitResult')}
            tone="warning"
          />
          <View style={styles.completionConfirmationActions}>
            <Button
              disabled={busy}
              fullWidth
              label={t('match.continueMatch')}
              onPress={onContinue}
              variant="secondary"
            />
            <Button
              busy={busy}
              fullWidth
              icon={completionIcon}
              label={t('match.confirmFinish')}
              onPress={onConfirm}
            />
          </View>
        </View>
      ) : (
        <Button
          busy={busy}
          fullWidth
          icon={completionIcon}
          label={pending ? t('match.retryCompletion') : t('match.finish')}
          onPress={pending ? onConfirm : onBegin}
        />
      )}
    </View>
  );
}

function StickyMatchScore({ score }: { score: LocalMatchDraftV1['score'] }) {
  const { colors } = useTheme();
  const { isTablet } = useResponsiveLayout();

  return (
    <View
      style={[
        styles.stickyScore,
        {
          backgroundColor: colors.background,
        },
      ]}
    >
      <View style={[styles.scoreboard, !isTablet && styles.scoreboardPhone]}>
        <ScoringScorePanel score={score.teamA} side="A" />
        <AppText accessibilityElementsHidden variant="title" tone="subtle">
          :
        </AppText>
        <ScoringScorePanel score={score.teamB} side="B" />
      </View>
    </View>
  );
}

function ScoringPlayerGrid({
  disabled,
  match,
  onAddGoal,
  onRemoveGoal,
  playerGoals,
}: {
  disabled: boolean;
  match: MatchDetail;
  onAddGoal(playerId: string): void;
  onRemoveGoal(playerId: string): void;
  playerGoals: LocalMatchDraftV1['playerGoals'];
}) {
  const { isTablet } = useResponsiveLayout();
  const rows = scoringGridRows(match.teams ?? []);

  return (
    <View style={[styles.playerGrid, isTablet && styles.playerGridTablet]}>
      {rows.map((row, index) => (
        <View
          key={`${row.teamA?.id ?? 'empty-a'}:${row.teamB?.id ?? 'empty-b'}:${index}`}
          style={[styles.playerGridRow, isTablet && styles.playerGridRowTablet]}
        >
          <ScoringGridCell
            disabled={disabled}
            goals={row.teamA ? (playerGoals[row.teamA.id] ?? 0) : 0}
            onAddGoal={onAddGoal}
            onRemoveGoal={onRemoveGoal}
            player={row.teamA}
            side="A"
          />
          <ScoringGridCell
            disabled={disabled}
            goals={row.teamB ? (playerGoals[row.teamB.id] ?? 0) : 0}
            onAddGoal={onAddGoal}
            onRemoveGoal={onRemoveGoal}
            player={row.teamB}
            side="B"
          />
        </View>
      ))}
    </View>
  );
}

function ScoringGridCell({
  disabled,
  goals,
  onAddGoal,
  onRemoveGoal,
  player,
  side,
}: {
  disabled: boolean;
  goals: number;
  onAddGoal(playerId: string): void;
  onRemoveGoal(playerId: string): void;
  player: ScoringPlayer | null;
  side: 'A' | 'B';
}) {
  return (
    <View style={styles.playerGridCell}>
      {player ? (
        <ScoringPlayerTile
          disabled={disabled}
          goals={goals}
          onAddGoal={onAddGoal}
          onRemoveGoal={onRemoveGoal}
          player={player}
          side={side}
        />
      ) : (
        <EmptyScoringGridSlot />
      )}
    </View>
  );
}

export function ScoringPlayerTile({
  disabled,
  goals,
  onAddGoal,
  onRemoveGoal,
  player,
  side,
}: {
  disabled: boolean;
  goals: number;
  onAddGoal(playerId: string): void;
  onRemoveGoal(playerId: string): void;
  player: ScoringPlayer;
  side: 'A' | 'B';
}) {
  const { colors } = useTheme();
  const { isTablet } = useResponsiveLayout();
  const { t } = useTranslation();
  const model = scoringPlayerTileModel(player, goals, disabled);
  const colorRoles = scoringTeamColorRoles(side);
  const accent = colors[colorRoles.accent];
  const border = colors[colorRoles.border];
  const pressedSurface = colors[colorRoles.pressedSurface];

  const removeGoal = (event: GestureResponderEvent) => {
    activateScoringMinus(event, model.removeDisabled, () =>
      onRemoveGoal(player.id),
    );
  };

  return (
    <Pressable
      accessibilityHint={t('match.addGoalHint')}
      accessibilityLabel={t('match.scoringPlayerLabel', {
        count: model.goals,
        name: model.name,
        side,
      })}
      accessibilityRole="button"
      accessibilityState={{ disabled: model.disabled }}
      disabled={model.disabled}
      onPress={() => activateScoringPlayerTile(() => onAddGoal(player.id))}
      style={styles.playerTilePressTarget}
    >
      {({ pressed }) => (
        <Card
          padding="none"
          pointerEvents="box-none"
          style={[
            styles.playerTile,
            {
              backgroundColor: model.disabled
                ? colors.disabledSurface
                : colors.surface,
              borderColor: model.disabled ? colors.borderDisabled : border,
            },
            isTablet && styles.playerTileTablet,
          ]}
        >
          {!model.disabled ? (
            <TeamTintBackground
              emphasis="subtle"
              side={side}
              style={styles.playerTintLayer}
            />
          ) : null}
          {pressed && !model.disabled ? (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={[
                styles.addGoalPressedOverlay,
                { backgroundColor: pressedSurface },
              ]}
            />
          ) : null}
          <TeamTintAccent
            edge="left"
            radius={radii.sm}
            side={side}
            tone="strong"
          />
          <View pointerEvents="box-none" style={styles.playerTileContent}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={styles.playerAvatar}
            >
              <Avatar
                name={model.avatarName}
                size="medium"
                url={model.avatarUrl}
              />
            </View>
            <View
              pointerEvents="box-none"
              style={[
                styles.playerDetails,
                isTablet && styles.playerDetailsTablet,
              ]}
            >
              <AppText
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                numberOfLines={2}
                pointerEvents="none"
                style={[styles.playerName, isTablet && styles.playerNameTablet]}
                tone={model.disabled ? 'disabled' : 'default'}
                variant="bodyStrong"
              >
                {model.name}
              </AppText>
              <View
                pointerEvents="box-none"
                style={[
                  styles.playerScoreControls,
                  isTablet && styles.playerScoreControlsTablet,
                ]}
              >
                <AppText
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={[
                    styles.playerGoalCount,
                    { color: model.disabled ? colors.textDisabled : accent },
                  ]}
                  variant="metric"
                >
                  {model.goals}
                </AppText>
                <Pressable
                  accessibilityLabel={t('match.removeGoal', {
                    name: model.name,
                  })}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: model.removeDisabled }}
                  // Keep the responder active at zero so this area cannot fall
                  // through to the enclosing add-goal Pressable.
                  onPress={removeGoal}
                  onPressIn={(event) => event.stopPropagation()}
                  style={styles.minusTouchTarget}
                >
                  {({ pressed: minusPressed }) => (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.minusVisual,
                        {
                          backgroundColor: model.removeDisabled
                            ? colors.disabledSurface
                            : minusPressed
                              ? pressedSurface
                              : colors.surfaceSubtle,
                          borderColor: model.removeDisabled
                            ? colors.borderDisabled
                            : colors.border,
                        },
                      ]}
                    >
                      <AppIcon
                        color={
                          model.removeDisabled
                            ? colors.textDisabled
                            : colors.textSecondary
                        }
                        name="remove"
                        size={sizes.icon.medium}
                      />
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

function EmptyScoringGridSlot() {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.emptyGridSlot}
    />
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 0 },
  stickyScore: {
    paddingBottom: spacing.xs,
    paddingTop: spacing.xxs,
  },
  scoreboard: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    maxWidth: layout.formMaxWidth,
    width: '100%',
  },
  scoreboardPhone: { maxWidth: SCORING_SCOREBOARD_PHONE_MAX_WIDTH },
  scoringContent: { gap: spacing.lg, paddingTop: spacing.xs },
  playerGrid: { gap: spacing.xxs },
  playerGridTablet: { gap: spacing.xs },
  playerGridRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  playerGridRowTablet: { gap: spacing.lg },
  playerGridCell: {
    flex: 1,
    minHeight: SCORING_PLAYER_TILE_MIN_HEIGHT,
    minWidth: 0,
  },
  playerTilePressTarget: {
    flex: 1,
    minWidth: 0,
  },
  playerTile: {
    borderRadius: radii.sm,
    flex: 1,
    minHeight: SCORING_PLAYER_TILE_MIN_HEIGHT,
    minWidth: 0,
    overflow: 'hidden',
    padding: spacing.xs,
    paddingLeft: spacing.xs + spacing.xxs - borderWidths.subtle,
  },
  playerTileTablet: {
    paddingLeft: spacing.sm + spacing.xxs - borderWidths.subtle,
    paddingRight: spacing.sm,
  },
  playerTintLayer: {
    borderRadius: radii.sm - borderWidths.subtle,
    bottom: borderWidths.subtle,
    left: borderWidths.subtle,
    right: borderWidths.subtle,
    top: borderWidths.subtle,
  },
  playerTileContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minWidth: 0,
  },
  playerAvatar: { flexShrink: 0 },
  playerDetails: {
    flex: 1,
    minWidth: 0,
  },
  playerDetailsTablet: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  playerName: { flexShrink: 1, minWidth: 0 },
  playerNameTablet: { flex: 1 },
  addGoalPressedOverlay: {
    borderRadius: radii.sm - borderWidths.subtle,
    bottom: borderWidths.subtle,
    left: borderWidths.subtle,
    overflow: 'hidden',
    position: 'absolute',
    right: borderWidths.subtle,
    top: borderWidths.subtle,
  },
  playerScoreControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: sizes.minimumTouchTarget,
  },
  playerScoreControlsTablet: {
    flexShrink: 0,
    gap: spacing.sm,
    justifyContent: 'flex-start',
  },
  playerGoalCount: {
    minWidth: sizes.compactControl,
    textAlign: 'left',
  },
  minusTouchTarget: {
    alignItems: 'center',
    height: sizes.minimumTouchTarget,
    justifyContent: 'center',
    width: sizes.minimumTouchTarget,
  },
  minusVisual: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    height: sizes.compactControl,
    justifyContent: 'center',
    width: sizes.compactControl,
  },
  emptyGridSlot: { flex: 1 },
  completionArea: {
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
    width: '100%',
  },
  confirmation: {
    gap: spacing.md,
    width: '100%',
  },
  completionConfirmationActions: { gap: spacing.sm },
});

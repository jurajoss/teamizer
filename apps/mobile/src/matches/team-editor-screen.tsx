import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  Avatar,
  borderWidths,
  Button,
  Card,
  FeedbackBanner,
  radii,
  sizes,
  spacing,
  useTheme,
} from '@teamizer/ui';

import type { MatchDetail } from '../api/contracts';
import { AppScreen } from '../ui/app-screen';
import { AppIcon } from '../ui/icons/app-icon';
import type { TransientTeamProposal } from './match-flow';
import { matchRouteFor } from './match-flow';
import { matchQueryKeys } from './match-query-keys';
import {
  applyEditorProposal,
  applyTeamDrop,
  beginTeamDrag,
  cancelTeamDrag,
  completeTeamDrag,
  reconcileEditorProposal,
  shouldConfirmEditorExit,
  sideForPlayer,
  teamEditorLayoutModel,
  updateTeamDragHover,
  type TeamDragSession,
  type TeamDropTarget,
  type TeamEditorDropResult,
  type TeamSide,
} from './team-editor-model';
import { isTeamDraftStale, useTeamDraft } from './team-draft-store';
import { resolveGeneratedProposal } from './use-match-proposal';
import { useAppServices } from '../providers/app-services-context';
import { useSession } from '../session/session-context';

export const TEAM_EDITOR_TILE_MIN_HEIGHT = 64;
const dragActivationDelayMs = 180;
const dragActivationDistance = 4;

type Player = MatchDetail['participants']['going'][number];
type TargetKey = `player:${string}` | `empty:${TeamSide}`;
type MeasuredTarget = {
  key: TargetKey;
  layout: LayoutRectangle;
  side: TeamSide;
  target: TeamDropTarget;
};
type DragOverlay = {
  frame: LayoutRectangle;
  playerId: string;
  side: TeamSide;
};
type TeamSideColors = { border: string; surface: string; text: string };

export function TeamEditorScreen({ matchId }: { matchId: string }) {
  const { apiClient } = useAppServices();
  const { state: session } = useSession();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const matchQuery = useQuery({
    queryKey: matchQueryKeys.detail(matchId),
    queryFn: () => apiClient.getMatch(matchId),
  });
  const appliedDraft = useTeamDraft(
    (state) => state.draftsByMatchId[matchId] ?? null,
  );
  const setDraft = useTeamDraft((state) => state.setDraft);
  const [workingProposal, setWorkingProposal] =
    useState<TransientTeamProposal | null>(null);
  const [baselineProposal, setBaselineProposal] =
    useState<TransientTeamProposal | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [preparationError, setPreparationError] = useState(false);
  const preparedKey = useRef<string | null>(null);
  const allowNavigation = useRef(false);
  const match = matchQuery.data ?? null;
  const mayEdit =
    session.status === 'AUTHENTICATED' &&
    session.currentUser.player.status === 'ACTIVE';
  const dirty = shouldConfirmEditorExit(baselineProposal, workingProposal);

  const preparationMutation = useMutation({
    mutationFn: async (currentMatch: MatchDetail) => {
      const participantIds = currentMatch.participants.going.map(
        ({ id }) => id,
      );
      if (appliedDraft && !isTeamDraftStale(appliedDraft, participantIds)) {
        return {
          status: 'LOCAL' as const,
          match: currentMatch,
          proposal: appliedDraft,
        };
      }
      const response = await apiClient.generateTeams(currentMatch.id);
      return resolveGeneratedProposal(apiClient, currentMatch, response);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(matchQueryKeys.detail(matchId), result.match);
      if (result.status === 'STALE') {
        setPreparationError(true);
        return;
      }

      const participantIds = result.match.participants.going.map(
        ({ id }) => id,
      );
      const proposal =
        result.status === 'READY' && appliedDraft
          ? reconcileEditorProposal(
              appliedDraft,
              result.proposal,
              participantIds,
            )
          : result.proposal;
      setWorkingProposal(proposal);
      setBaselineProposal(proposal);
      setPreparationError(false);
    },
    onError: () => setPreparationError(true),
  });

  useEffect(() => {
    if (!mayEdit || !match || match.status !== 'OPEN_FOR_REGISTRATION') return;
    const key = `${match.id}:${match.stateVersion}`;
    if (preparedKey.current === key || preparationMutation.isPending) return;
    preparedKey.current = key;
    preparationMutation.mutate(match);
  }, [appliedDraft, match, mayEdit, preparationMutation]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (!dirty || allowNavigation.current) return;
        event.preventDefault();
        showDiscardConfirmation(t, () => {
          allowNavigation.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [dirty, navigation, t],
  );

  if (matchQuery.isPending) {
    return (
      <EditorFrame>
        <AppText tone="muted">{t('match.loading')}</AppText>
      </EditorFrame>
    );
  }

  if (
    matchQuery.isError ||
    !match ||
    !mayEdit ||
    match.status !== 'OPEN_FOR_REGISTRATION'
  ) {
    return (
      <EditorFrame>
        <FeedbackBanner message={t('teams.editorUnavailable')} tone="error" />
      </EditorFrame>
    );
  }

  const playersById = new Map(
    [
      ...match.participants.going,
      ...match.participants.notGoing,
      ...match.participants.unanswered,
    ].map((player) => [player.id, player]),
  );
  const applyEnabled =
    workingProposal !== null &&
    applyEditorProposal(workingProposal, match) !== null;

  const apply = () => {
    if (!workingProposal) return;
    const draft = applyEditorProposal(workingProposal, match);
    if (!draft) return;
    setDraft(matchId, draft);
    allowNavigation.current = true;
    leaveEditor(matchId);
  };

  const retryPreparation = () => {
    preparedKey.current = null;
    setPreparationError(false);
    preparationMutation.mutate(match);
  };

  const commitDrop = (result: TeamEditorDropResult) => {
    if (result.operation !== 'NONE') setWorkingProposal(result.proposal);
    setSelectedPlayerId(null);
  };

  const select = (playerId: string) => {
    if (!workingProposal) return;
    if (!selectedPlayerId) {
      setSelectedPlayerId(playerId);
      return;
    }
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      return;
    }
    if (
      sideForPlayer(workingProposal, selectedPlayerId) ===
      sideForPlayer(workingProposal, playerId)
    ) {
      return;
    }
    commitDrop(
      applyTeamDrop(workingProposal, selectedPlayerId, {
        kind: 'player',
        playerId,
      }),
    );
  };

  return (
    <EditorFrame>
      <Card padding="compact" style={styles.instructions}>
        <View style={styles.instructionHeading}>
          <AppIcon color={colors.info} name="drag" />
          <AppText variant="bodyStrong">{t('teams.editorHint')}</AppText>
        </View>
        <AppText tone="muted" variant="caption">
          {t('teams.editorTapHint')}
        </AppText>
      </Card>

      {preparationMutation.isPending && !workingProposal ? (
        <AppText tone="muted">{t('teams.editorPreparing')}</AppText>
      ) : null}
      {preparationError ? (
        <View style={styles.preparationError}>
          <FeedbackBanner message={t('teams.editorUnavailable')} tone="error" />
          <Button
            fullWidth={false}
            label={t('common.retry')}
            onPress={retryPreparation}
            variant="secondary"
          />
        </View>
      ) : null}

      {workingProposal ? (
        <TeamEditorBoard
          playersById={playersById}
          proposal={workingProposal}
          selectedPlayerId={selectedPlayerId}
          onDropResult={commitDrop}
          onSelect={select}
        />
      ) : null}

      <Button
        disabled={!applyEnabled || preparationMutation.isPending}
        label={t('teams.apply')}
        onPress={apply}
      />
    </EditorFrame>
  );
}

function EditorFrame({ children }: { children: React.ReactNode }) {
  return (
    <AppScreen
      scroll
      underHeader
      contentStyle={styles.screen}
      contentWidth="working"
    >
      {children}
    </AppScreen>
  );
}

export function TeamEditorBoard({
  playersById,
  proposal,
  selectedPlayerId,
  onDropResult,
  onSelect,
}: {
  playersById: Map<string, Player>;
  proposal: TransientTeamProposal;
  selectedPlayerId: string | null;
  onDropResult(result: TeamEditorDropResult): void;
  onSelect(playerId: string): void;
}) {
  const boardRef = useRef<View>(null);
  const boardOrigin = useRef({ x: 0, y: 0 });
  const columnLayouts = useRef<Partial<Record<TeamSide, LayoutRectangle>>>({});
  const targetLayouts = useRef<Partial<Record<TargetKey, MeasuredTarget>>>({});
  const proposalRef = useRef(proposal);
  const onDropResultRef = useRef(onDropResult);
  const dragSession = useRef<TeamDragSession | null>(null);
  const [dragTranslation] = useState(() => new Animated.ValueXY());
  const [dragOverlay, setDragOverlay] = useState<DragOverlay | null>(null);
  const [highlightedTargetKey, setHighlightedTargetKey] =
    useState<TargetKey | null>(null);
  const emptySlotSide = teamEditorLayoutModel(proposal).emptySlot?.side ?? null;

  useEffect(() => {
    proposalRef.current = proposal;
  }, [proposal]);
  useEffect(() => {
    onDropResultRef.current = onDropResult;
  }, [onDropResult]);

  const registerColumn = useCallback(
    (side: TeamSide, layout: LayoutRectangle) => {
      columnLayouts.current[side] = layout;
    },
    [],
  );
  const registerTarget = useCallback(
    (
      side: TeamSide,
      key: TargetKey,
      target: TeamDropTarget,
      layout: LayoutRectangle,
    ) => {
      targetLayouts.current[key] = {
        key,
        side,
        target,
        layout,
      };
    },
    [],
  );
  const measureBoard = useCallback(() => {
    boardRef.current?.measureInWindow((x, y) => {
      boardOrigin.current = { x, y };
    });
  }, []);
  const clearDragVisuals = useCallback(() => {
    dragSession.current = null;
    setDragOverlay(null);
    setHighlightedTargetKey(null);
  }, []);
  const beginDrag = useCallback(
    (playerId: string, dx: number, dy: number) => {
      const source = targetLayouts.current[`player:${playerId}`];
      if (!source) return;
      const column = columnLayouts.current[source.side];
      if (!column) return;

      dragSession.current = beginTeamDrag(playerId);
      dragTranslation.setValue({ x: dx, y: dy });
      setDragOverlay({
        playerId,
        side: source.side,
        frame: {
          x: column.x + source.layout.x,
          y: column.y + source.layout.y,
          width: source.layout.width,
          height: source.layout.height,
        },
      });
      measureBoard();
    },
    [dragTranslation, measureBoard],
  );
  const moveDrag = useCallback(
    (dx: number, dy: number, pageX: number, pageY: number) => {
      const session = dragSession.current;
      if (!session) return;

      // The overlay's native animated position is updated before any semantic
      // hover state. React may now rerender highlights without owning position.
      dragTranslation.setValue({ x: dx, y: dy });
      const localX = pageX - boardOrigin.current.x;
      const localY = pageY - boardOrigin.current.y;
      const target = Object.values(targetLayouts.current).find((candidate) => {
        if (!candidate) return false;
        const column = columnLayouts.current[candidate.side];
        if (!column) return false;
        const x = column.x + candidate.layout.x;
        const y = column.y + candidate.layout.y;
        return (
          x <= localX &&
          x + candidate.layout.width >= localX &&
          y <= localY &&
          y + candidate.layout.height >= localY &&
          isValidTarget(
            proposalRef.current,
            session.draggedPlayerId,
            candidate.target,
          )
        );
      });
      dragSession.current = updateTeamDragHover(
        session,
        target?.target ?? null,
      );
      setHighlightedTargetKey(target?.key ?? null);
    },
    [dragTranslation],
  );
  const finishDrag = useCallback(() => {
    const session = dragSession.current;
    if (!session) {
      clearDragVisuals();
      return;
    }

    const completion = completeTeamDrag(proposalRef.current, session);
    clearDragVisuals();
    if (completion.result.operation !== 'NONE') {
      onDropResultRef.current(completion.result);
    }
  }, [clearDragVisuals]);
  const cancelDrag = useCallback(() => {
    cancelTeamDrag(proposalRef.current);
    clearDragVisuals();
  }, [clearDragVisuals]);
  const dropWithoutDragging = useCallback(
    (playerId: string, target: TeamDropTarget) => {
      onDropResultRef.current(
        applyTeamDrop(proposalRef.current, playerId, target),
      );
    },
    [],
  );

  return (
    <View ref={boardRef} onLayout={measureBoard} style={styles.board}>
      <EditorTeamColumn
        activeDragId={dragOverlay?.playerId ?? null}
        emptySlot={emptySlotSide === 'A'}
        highlightedTargetKey={highlightedTargetKey}
        playerIds={proposal.teamAPlayerIds}
        playersById={playersById}
        selectedPlayerId={selectedPlayerId}
        side="A"
        onBeginDrag={beginDrag}
        onDragCancel={cancelDrag}
        onColumnLayout={registerColumn}
        onDragEnd={finishDrag}
        onDragMove={moveDrag}
        onRegisterTarget={registerTarget}
        onDrop={dropWithoutDragging}
        onSelect={onSelect}
      />
      <EditorTeamColumn
        activeDragId={dragOverlay?.playerId ?? null}
        emptySlot={emptySlotSide === 'B'}
        highlightedTargetKey={highlightedTargetKey}
        playerIds={proposal.teamBPlayerIds}
        playersById={playersById}
        selectedPlayerId={selectedPlayerId}
        side="B"
        onBeginDrag={beginDrag}
        onDragCancel={cancelDrag}
        onColumnLayout={registerColumn}
        onDragEnd={finishDrag}
        onDragMove={moveDrag}
        onRegisterTarget={registerTarget}
        onDrop={dropWithoutDragging}
        onSelect={onSelect}
      />
      {dragOverlay ? (
        <FloatingPlayerTile
          frame={dragOverlay.frame}
          player={playersById.get(dragOverlay.playerId) ?? null}
          side={dragOverlay.side}
          translation={dragTranslation}
        />
      ) : null}
    </View>
  );
}

function EditorTeamColumn({
  activeDragId,
  emptySlot,
  highlightedTargetKey,
  playerIds,
  playersById,
  selectedPlayerId,
  side,
  onBeginDrag,
  onDragCancel,
  onColumnLayout,
  onDragEnd,
  onDragMove,
  onRegisterTarget,
  onDrop,
  onSelect,
}: {
  activeDragId: string | null;
  emptySlot: boolean;
  highlightedTargetKey: TargetKey | null;
  playerIds: string[];
  playersById: Map<string, Player>;
  selectedPlayerId: string | null;
  side: TeamSide;
  onBeginDrag(playerId: string, dx: number, dy: number): void;
  onDragCancel(): void;
  onColumnLayout(side: TeamSide, layout: LayoutRectangle): void;
  onDragEnd(): void;
  onDragMove(dx: number, dy: number, pageX: number, pageY: number): void;
  onRegisterTarget(
    side: TeamSide,
    key: TargetKey,
    target: TeamDropTarget,
    layout: LayoutRectangle,
  ): void;
  onDrop(playerId: string, target: TeamDropTarget): void;
  onSelect(playerId: string): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const sideColors =
    side === 'A'
      ? {
          border: colors.teamABorder,
          surface: colors.teamASurface,
          text: colors.teamAText,
        }
      : {
          border: colors.teamBBorder,
          surface: colors.teamBSurface,
          text: colors.teamBText,
        };
  const movingPlayerId = activeDragId ?? selectedPlayerId;
  const showEmptySlot =
    emptySlot &&
    movingPlayerId !== null &&
    sideForPlayer(
      {
        teamAPlayerIds: side === 'A' ? playerIds : [],
        teamBPlayerIds: side === 'B' ? playerIds : [],
      } as TransientTeamProposal,
      movingPlayerId,
    ) === null;

  return (
    <View
      onLayout={({ nativeEvent }) => onColumnLayout(side, nativeEvent.layout)}
      style={styles.editorColumn}
    >
      <AppText style={{ color: sideColors.text }} variant="heading">
        {t('common.team', { side })}
      </AppText>
      {playerIds.map((playerId) => {
        const player = playersById.get(playerId);
        if (!player) return null;
        const key = `player:${playerId}` as const;
        return (
          <DraggablePlayerTile
            active={activeDragId === playerId}
            highlighted={highlightedTargetKey === key}
            key={playerId}
            player={player}
            selected={selectedPlayerId === playerId}
            sideColors={sideColors}
            onBeginDrag={onBeginDrag}
            onDragCancel={onDragCancel}
            onDragEnd={onDragEnd}
            onDragMove={onDragMove}
            onLayout={(layout) =>
              onRegisterTarget(side, key, { kind: 'player', playerId }, layout)
            }
            onSelect={onSelect}
          />
        );
      })}
      {showEmptySlot ? (
        <EmptyPlayerSlot
          highlighted={highlightedTargetKey === `empty:${side}`}
          sideColors={sideColors}
          onLayout={(layout) =>
            onRegisterTarget(
              side,
              `empty:${side}`,
              { kind: 'empty-slot', side },
              layout,
            )
          }
          onPress={() => {
            if (movingPlayerId) {
              onDrop(movingPlayerId, { kind: 'empty-slot', side });
            }
          }}
        />
      ) : null}
    </View>
  );
}

function DraggablePlayerTile({
  active,
  highlighted,
  player,
  selected,
  sideColors,
  onBeginDrag,
  onDragCancel,
  onDragEnd,
  onDragMove,
  onLayout,
  onSelect,
}: {
  active: boolean;
  highlighted: boolean;
  player: Player;
  selected: boolean;
  sideColors: TeamSideColors;
  onBeginDrag(playerId: string, dx: number, dy: number): void;
  onDragCancel(): void;
  onDragEnd(): void;
  onDragMove(dx: number, dy: number, pageX: number, pageY: number): void;
  onLayout(layout: LayoutRectangle): void;
  onSelect(playerId: string): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [dragReady, setDragReady] = useState(false);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          dragReady &&
          Math.hypot(gesture.dx, gesture.dy) >= dragActivationDistance,
        onPanResponderGrant: (_event, gesture) => {
          onBeginDrag(player.id, gesture.dx, gesture.dy);
        },
        onPanResponderMove: (_event, gesture) => {
          onDragMove(gesture.dx, gesture.dy, gesture.moveX, gesture.moveY);
        },
        onPanResponderRelease: () => {
          setDragReady(false);
          onDragEnd();
        },
        onPanResponderTerminate: () => {
          setDragReady(false);
          onDragCancel();
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [dragReady, onBeginDrag, onDragCancel, onDragEnd, onDragMove, player.id],
  );

  return (
    <View
      {...panResponder.panHandlers}
      onLayout={({ nativeEvent }) => onLayout(nativeEvent.layout)}
      style={[
        styles.dropTileGeometry,
        styles.playerTile,
        {
          backgroundColor: sideColors.surface,
          borderColor:
            highlighted || selected ? colors.accent : sideColors.border,
        },
        active && styles.sourcePlaceholder,
        highlighted && { backgroundColor: colors.accentSoft },
      ]}
    >
      <Pressable
        accessibilityHint={t('teams.editorTapHint')}
        accessibilityLabel={
          selected ? t('teams.selected', { name: player.name }) : player.name
        }
        accessibilityRole="button"
        accessibilityState={{ selected }}
        delayLongPress={dragActivationDelayMs}
        onLongPress={() => setDragReady(true)}
        onPress={() => {
          setDragReady(false);
          onSelect(player.id);
        }}
        onPressIn={() => setDragReady(false)}
        style={styles.playerTilePressable}
      >
        <Avatar name={player.name} size="small" url={player.avatarUrl} />
        <AppText numberOfLines={2} style={styles.editorPlayerName}>
          {player.name}
        </AppText>
        <AppIcon color={sideColors.text} name="drag" size={sizes.icon.small} />
        {highlighted ? <AppIcon color={colors.accent} name="swap" /> : null}
      </Pressable>
    </View>
  );
}

function FloatingPlayerTile({
  frame,
  player,
  side,
  translation,
}: {
  frame: LayoutRectangle;
  player: Player | null;
  side: TeamSide;
  translation: Animated.ValueXY;
}) {
  const { colors, shadows } = useTheme();
  if (!player) return null;
  const sideColors =
    side === 'A'
      ? {
          border: colors.teamABorder,
          surface: colors.teamASurface,
          text: colors.teamAText,
        }
      : {
          border: colors.teamBBorder,
          surface: colors.teamBSurface,
          text: colors.teamBText,
        };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.floatingPlayerTile,
        shadows.raised,
        {
          backgroundColor: sideColors.surface,
          borderColor: sideColors.border,
          height: frame.height,
          left: frame.x,
          top: frame.y,
          transform: [
            { translateX: translation.x },
            { translateY: translation.y },
            { scale: 1.03 },
          ],
          width: frame.width,
        },
      ]}
    >
      <View style={styles.floatingPlayerContent}>
        <Avatar name={player.name} size="small" url={player.avatarUrl} />
        <AppText numberOfLines={2} style={styles.editorPlayerName}>
          {player.name}
        </AppText>
        <AppIcon color={sideColors.text} name="drag" size={sizes.icon.small} />
      </View>
    </Animated.View>
  );
}

function EmptyPlayerSlot({
  highlighted,
  sideColors,
  onLayout,
  onPress,
}: {
  highlighted: boolean;
  sideColors: TeamSideColors;
  onLayout(layout: LayoutRectangle): void;
  onPress(): void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityLabel={t('teams.emptySlot')}
      accessibilityRole="button"
      onLayout={({ nativeEvent }) => onLayout(nativeEvent.layout)}
      onPress={onPress}
      style={[
        styles.dropTileGeometry,
        styles.emptyPlayerSlot,
        {
          backgroundColor: highlighted ? colors.accentSoft : sideColors.surface,
          borderColor: highlighted ? colors.accent : sideColors.border,
        },
      ]}
    >
      <AppIcon color={sideColors.text} name="add" />
      <AppText style={{ color: sideColors.text }} variant="caption">
        {t('teams.moveHere')}
      </AppText>
    </Pressable>
  );
}

function isValidTarget(
  proposal: TransientTeamProposal,
  draggedPlayerId: string,
  target: TeamDropTarget,
): boolean {
  return applyTeamDrop(proposal, draggedPlayerId, target).operation !== 'NONE';
}

function leaveEditor(matchId: string): void {
  if (router.canGoBack()) router.back();
  else router.replace(matchRouteFor(matchId));
}

function showDiscardConfirmation(
  t: ReturnType<typeof useTranslation>['t'],
  discard: () => void,
): void {
  Alert.alert(t('teams.discardTitle'), t('teams.discardHint'), [
    { text: t('teams.keepEditingDraft'), style: 'cancel' },
    { text: t('teams.discard'), style: 'destructive', onPress: discard },
  ]);
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  instructions: { gap: spacing.xs },
  preparationError: { alignItems: 'flex-start', gap: spacing.sm },
  instructionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  board: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.xs,
    overflow: 'visible',
    position: 'relative',
  },
  editorColumn: { flex: 1, gap: spacing.xs, minWidth: 0 },
  dropTileGeometry: {
    borderRadius: radii.md,
    minHeight: TEAM_EDITOR_TILE_MIN_HEIGHT,
    width: '100%',
  },
  playerTile: {
    borderWidth: borderWidths.subtle,
    zIndex: 1,
  },
  sourcePlaceholder: { opacity: 0.28 },
  playerTilePressable: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    minHeight: TEAM_EDITOR_TILE_MIN_HEIGHT,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  editorPlayerName: { flex: 1, minWidth: 0 },
  floatingPlayerTile: {
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    elevation: 8,
    position: 'absolute',
    zIndex: 20,
  },
  floatingPlayerContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  emptyPlayerSlot: {
    alignItems: 'center',
    borderStyle: 'dashed',
    borderWidth: borderWidths.emphasized,
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
});

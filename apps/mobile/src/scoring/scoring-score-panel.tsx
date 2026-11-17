import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  AppText,
  borderWidths,
  radii,
  spacing,
  TeamTintAccent,
  TeamTintBackground,
  useTheme,
} from '@teamizer/ui';

import { SCORING_SCORE_PANEL_MIN_HEIGHT } from './scoring-layout';
import {
  scoringScorePanelPresentation,
  scoringTeamColorRoles,
} from './scoring-screen-model';

export function ScoringScorePanel({
  score,
  side,
}: {
  score: number;
  side: 'A' | 'B';
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const colorRoles = scoringTeamColorRoles(side);
  const presentation = scoringScorePanelPresentation(side);

  return (
    <View
      style={[
        styles.panel,
        presentation.accentEdge === 'left'
          ? styles.accentLeft
          : styles.accentRight,
        {
          backgroundColor: colors[colorRoles.pressedSurface],
          borderColor: colors[colorRoles.border],
        },
      ]}
    >
      <TeamTintBackground
        direction={presentation.gradientDirection}
        emphasis="prominent"
        side={side}
        style={styles.tintLayer}
      />
      <TeamTintAccent
        edge={presentation.accentEdge}
        radius={radii.md}
        side={side}
        tone="subdued"
      />
      <AppText
        accessibilityLabel={`${t('common.team', { side })}, ${score}`}
        style={{ color: colors[colorRoles.accent] }}
        variant="scoreCompact"
      >
        {score}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: borderWidths.subtle,
    flex: 1,
    justifyContent: 'center',
    minHeight: SCORING_SCORE_PANEL_MIN_HEIGHT,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: spacing.sm,
  },
  accentLeft: {
    paddingLeft: spacing.sm + spacing.xxs - borderWidths.subtle,
  },
  accentRight: {
    paddingRight: spacing.sm + spacing.xxs - borderWidths.subtle,
  },
  tintLayer: {
    borderRadius: radii.md - borderWidths.subtle,
    bottom: borderWidths.subtle,
    left: borderWidths.subtle,
    right: borderWidths.subtle,
    top: borderWidths.subtle,
  },
});

import type { MatchTeam } from '../api/contracts';

export type ScoringPlayer = MatchTeam['players'][number];

export type ScoringGridRow = {
  teamA: ScoringPlayer | null;
  teamB: ScoringPlayer | null;
};

export type ScoringPlayerTileModel = {
  avatarName: string;
  avatarUrl: string | null;
  disabled: boolean;
  goals: number;
  name: string;
  removeDisabled: boolean;
};

export type ScoringTeamColorRoles = {
  accent: 'teamAText' | 'teamBText';
  border: 'teamABorder' | 'teamBBorder';
  pressedSurface: 'teamASurface' | 'teamBSurface';
};

export type ScoringScorePanelPresentation = {
  accentEdge: 'left' | 'right';
  gradientDirection: 'to left' | 'to right';
};

export type PropagatingPressEvent = {
  stopPropagation(): void;
};

export function scoringGridRows(teams: MatchTeam[]): ScoringGridRow[] {
  const teamA = teams.find(({ side }) => side === 'A');
  const teamB = teams.find(({ side }) => side === 'B');
  const rowCount = Math.max(
    teamA?.players.length ?? 0,
    teamB?.players.length ?? 0,
  );

  return Array.from({ length: rowCount }, (_, index) => ({
    teamA: teamA?.players[index] ?? null,
    teamB: teamB?.players[index] ?? null,
  }));
}

export function scoringPlayerTileModel(
  player: ScoringPlayer,
  goals: number,
  disabled: boolean,
): ScoringPlayerTileModel {
  return {
    avatarName: player.name,
    avatarUrl: player.avatarUrl,
    disabled,
    goals,
    name: player.name,
    removeDisabled: disabled || goals === 0,
  };
}

export function activateScoringPlayerTile(onAddGoal: () => void): void {
  onAddGoal();
}

export function activateScoringMinus(
  event: PropagatingPressEvent,
  disabled: boolean,
  onRemoveGoal: () => void,
): void {
  event.stopPropagation();
  if (!disabled) {
    onRemoveGoal();
  }
}

export function scoringTeamColorRoles(side: 'A' | 'B'): ScoringTeamColorRoles {
  return side === 'A'
    ? {
        accent: 'teamAText',
        border: 'teamABorder',
        pressedSurface: 'teamASurface',
      }
    : {
        accent: 'teamBText',
        border: 'teamBBorder',
        pressedSurface: 'teamBSurface',
      };
}

export function scoringScorePanelPresentation(
  side: 'A' | 'B',
): ScoringScorePanelPresentation {
  return side === 'A'
    ? { accentEdge: 'left', gradientDirection: 'to right' }
    : { accentEdge: 'right', gradientDirection: 'to left' };
}

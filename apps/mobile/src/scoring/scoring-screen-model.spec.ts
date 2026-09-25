import { describe, expect, it, vi } from 'vitest';

import type { MatchTeam } from '../api/contracts';
import { ids, inProgressMatch } from './scoring-test-fixtures';
import {
  activateScoringMinus,
  activateScoringPlayerTile,
  scoringGridRows,
  scoringPlayerTileModel,
  scoringScorePanelPresentation,
  scoringTeamColorRoles,
} from './scoring-screen-model';

describe('scoring screen interaction model', () => {
  it('activates a Player tile as exactly one add-goal action', () => {
    const addGoal = vi.fn();

    activateScoringPlayerTile(addGoal);

    expect(addGoal).toHaveBeenCalledOnce();
  });

  it('registers every legitimate rapid Player-tile activation', () => {
    const addGoal = vi.fn();

    activateScoringPlayerTile(addGoal);
    activateScoringPlayerTile(addGoal);
    activateScoringPlayerTile(addGoal);

    expect(addGoal).toHaveBeenCalledTimes(3);
  });

  it('stops a minus press before invoking exactly one remove-goal action', () => {
    const addGoal = vi.fn();
    const removeGoal = vi.fn();
    const event = { stopPropagation: vi.fn() };

    activateScoringMinus(event, false, removeGoal);

    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(removeGoal).toHaveBeenCalledOnce();
    expect(addGoal).not.toHaveBeenCalled();
  });

  it('consumes a disabled minus press without decrementing or incrementing', () => {
    const addGoal = vi.fn();
    const removeGoal = vi.fn();
    const event = { stopPropagation: vi.fn() };

    activateScoringMinus(event, true, removeGoal);

    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(removeGoal).not.toHaveBeenCalled();
    expect(addGoal).not.toHaveBeenCalled();
  });

  it('disables minus at zero and preserves rendered identity/count inputs', () => {
    const player = {
      id: ids.playerA,
      name: 'Radoslav Novotný',
      type: 'REGULAR' as const,
      status: 'ACTIVE' as const,
      avatarUrl: null,
    };

    expect(scoringPlayerTileModel(player, 0, false)).toEqual({
      avatarName: 'Radoslav Novotný',
      avatarUrl: null,
      disabled: false,
      goals: 0,
      name: 'Radoslav Novotný',
      removeDisabled: true,
    });
    expect(scoringPlayerTileModel(player, 2, false)).toMatchObject({
      goals: 2,
      removeDisabled: false,
    });
    expect(scoringPlayerTileModel(player, 2, true)).toMatchObject({
      disabled: true,
      removeDisabled: true,
    });
  });
});

describe('scoring grid presentation model', () => {
  it('keeps Team A left and Team B right regardless of API order', () => {
    const match = inProgressMatch();
    const teams = [...(match.teams ?? [])].reverse();
    const rows = scoringGridRows(teams);

    expect(rows[0]?.teamA?.id).toBe(ids.playerA);
    expect(rows[0]?.teamB?.id).toBe(ids.playerC);
  });

  it.each([5, 9])(
    'uses the same paired-row model for %i-player teams',
    (playersPerTeam) => {
      const teams = makeTeams(playersPerTeam, playersPerTeam);
      const rows = scoringGridRows(teams);

      expect(rows).toHaveLength(playersPerTeam);
      expect(rows.every(({ teamA, teamB }) => teamA && teamB)).toBe(true);
    },
  );

  it('keeps four paired slots for a 3 vs 4 roster', () => {
    const rows = scoringGridRows(makeTeams(3, 4));

    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 3).every(({ teamA, teamB }) => teamA && teamB)).toBe(
      true,
    );
    expect(rows[3]).toMatchObject({
      teamA: null,
      teamB: { name: 'B Player 4' },
    });
  });

  it('keeps four paired slots for a 4 vs 3 roster', () => {
    const rows = scoringGridRows(makeTeams(4, 3));

    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 3).every(({ teamA, teamB }) => teamA && teamB)).toBe(
      true,
    );
    expect(rows[3]).toMatchObject({
      teamA: { name: 'A Player 4' },
      teamB: null,
    });
  });

  it('keeps every logical slot populated for a 5 vs 5 roster', () => {
    const rows = scoringGridRows(makeTeams(5, 5));

    expect(rows).toHaveLength(5);
    expect(rows.every(({ teamA, teamB }) => teamA && teamB)).toBe(true);
  });

  it('represents an absent Player as a null slot rather than a fake Player', () => {
    const rows = scoringGridRows(makeTeams(3, 4));
    const emptySlot = rows[3]?.teamA;

    expect(emptySlot).toBeNull();
  });

  it('maps both sides only through semantic Teamizer team color roles', () => {
    expect(scoringTeamColorRoles('A')).toEqual({
      accent: 'teamAText',
      border: 'teamABorder',
      pressedSurface: 'teamASurface',
    });
    expect(scoringTeamColorRoles('B')).toEqual({
      accent: 'teamBText',
      border: 'teamBBorder',
      pressedSurface: 'teamBSurface',
    });
  });

  it('mirrors only the score-panel emphasis toward the scoreboard center', () => {
    expect(scoringScorePanelPresentation('A')).toEqual({
      accentEdge: 'left',
      gradientDirection: 'to right',
    });
    expect(scoringScorePanelPresentation('B')).toEqual({
      accentEdge: 'right',
      gradientDirection: 'to left',
    });
  });
});

function makeTeams(teamACount: number, teamBCount: number): MatchTeam[] {
  return [
    {
      id: ids.teamA,
      side: 'A',
      players: makePlayers('A', teamACount),
    },
    {
      id: ids.teamB,
      side: 'B',
      players: makePlayers('B', teamBCount),
    },
  ];
}

function makePlayers(prefix: string, count: number): MatchTeam['players'] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${prefix === 'A' ? '1' : '2'}${String(index).padStart(11, '0')}`,
    name: index === 1 ? 'Radoslav Novotný' : `${prefix} Player ${index + 1}`,
    type: 'REGULAR' as const,
    status: 'ACTIVE' as const,
    avatarUrl: null,
  }));
}

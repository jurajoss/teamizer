import { describe, expect, it } from 'vitest';

import type { PlayerMatchHistoryItem } from '../api/contracts';
import {
  formatAttendancePercentage,
  formatPlayerPercentage,
  playerHistoryRouteFor,
  recentPlayerForm,
  recentPlayerMatches,
} from './player-statistics-model';

const playerId = '00000000-0000-4000-8000-000000000001';
const teammateId = '00000000-0000-4000-8000-000000000002';
const opponentId = '00000000-0000-4000-8000-000000000003';
const sportId = '00000000-0000-4000-8000-000000000004';

describe('Player statistics presentation model', () => {
  it('selects the five newest matches without mutating API order', () => {
    const history = [1, 6, 3, 2, 5, 4].map((day) => historyItem(day));

    expect(
      recentPlayerMatches(history).map(({ subjectGoals }) => subjectGoals),
    ).toEqual([6, 5, 4, 3, 2]);
    expect(history.map(({ subjectGoals }) => subjectGoals)).toEqual([
      1, 6, 3, 2, 5, 4,
    ]);
  });

  it('builds five-match form chronologically from the newest finished matches', () => {
    const history = [
      historyItem(1, 'LOSS'),
      historyItem(6, 'WIN'),
      historyItem(3, 'DRAW'),
      historyItem(2, 'WIN'),
      historyItem(5, 'LOSS'),
      historyItem(4, 'WIN'),
    ];

    expect(recentPlayerForm(history)).toEqual({
      results: ['WIN', 'DRAW', 'WIN', 'LOSS', 'WIN'],
      wins: 3,
    });
  });

  it('uses every actual result when fewer than five matches exist', () => {
    expect(
      recentPlayerForm([
        historyItem(3, 'WIN'),
        historyItem(1, 'LOSS'),
        historyItem(2, 'DRAW'),
      ]),
    ).toEqual({ results: ['LOSS', 'DRAW', 'WIN'], wins: 1 });
  });

  it('returns an empty form when the player has no finished matches', () => {
    expect(recentPlayerForm([])).toEqual({ results: [], wins: 0 });
  });

  it('builds selected-player history routes and localized percentages', () => {
    expect(playerHistoryRouteFor(playerId)).toBe(
      `/players/${playerId}/matches`,
    );
    expect(formatPlayerPercentage(0.688, 'cs')).toBe('68,8 %');
    expect(formatPlayerPercentage(0, 'en')).toBe('0 %');
    expect(formatPlayerPercentage(null, 'en')).toBe('—');
    expect(formatAttendancePercentage(85, 'en')).toBe('85 %');
    expect(formatAttendancePercentage(0, 'cs')).toBe('0 %');
    expect(formatAttendancePercentage(null, 'cs')).toBe('—');
  });
});

function historyItem(
  day: number,
  subjectResult: PlayerMatchHistoryItem['subjectResult'] = 'WIN',
): PlayerMatchHistoryItem {
  return {
    id: `00000000-0000-4000-8001-${String(day).padStart(12, '0')}`,
    location: null,
    playerGoals: [{ goals: day, playerId }],
    score: { teamA: day, teamB: 0 },
    sport: { id: sportId, name: 'Football' },
    startsAt: `2026-01-${String(day).padStart(2, '0')}T18:00:00.000Z`,
    subjectGoals: day,
    subjectResult,
    teams: [
      {
        id: '00000000-0000-4000-8000-000000000005',
        side: 'A',
        players: [player(playerId, 'Selected'), player(teammateId, 'Teammate')],
      },
      {
        id: '00000000-0000-4000-8000-000000000006',
        side: 'B',
        players: [player(opponentId, 'Opponent')],
      },
    ],
  };
}

function player(id: string, name: string) {
  return {
    avatarUrl: null,
    id,
    name,
    status: 'ACTIVE' as const,
    type: 'REGULAR' as const,
  };
}

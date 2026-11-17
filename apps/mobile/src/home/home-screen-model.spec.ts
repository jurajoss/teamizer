import { describe, expect, it } from 'vitest';

import type {
  PlayerMatchHistoryItem,
  PlayerStatistics,
  UpcomingMatch,
} from '../api/contracts';
import {
  formatHomeMatchDate,
  homeAttendancePresentation,
  homeFirstName,
  homeGoalHistory,
  homeGoalScale,
  homeGoalXAxisLabelIndices,
  homeStatisticsMetrics,
  homeUsesTwoColumns,
  selectHomeMatch,
} from './home-screen-model';

const ids = {
  match: '00000000-0000-4000-8000-000000000001',
  player: '00000000-0000-4000-8000-000000000002',
  sport: '00000000-0000-4000-8000-000000000003',
};

describe('Home presentation model', () => {
  it('uses the real Player name and prioritizes an active Match', () => {
    const open = upcomingMatch(
      'OPEN_FOR_REGISTRATION',
      '2026-10-01T18:00:00.000Z',
    );
    const active = {
      ...upcomingMatch('IN_PROGRESS', '2026-09-20T18:00:00.000Z'),
      id: '00000000-0000-4000-8000-000000000004',
    };

    expect(homeFirstName('  Jiří Syrový ')).toBe('Jiří');
    expect(selectHomeMatch([open, active])).toBe(active);
    expect(selectHomeMatch([])).toBeNull();
  });

  it.each([
    [null, 'unanswered'],
    ['GOING', 'going'],
    ['NOT_GOING', 'not-going'],
  ] as const)('maps attendance %s to %s', (attendance, kind) => {
    expect(
      homeAttendancePresentation(attendance, 'OPEN_FOR_REGISTRATION', 'ACTIVE'),
    ).toEqual({ kind, mayEdit: true });
  });

  it('prevents changing locked or inactive attendance', () => {
    expect(
      homeAttendancePresentation('GOING', 'IN_PROGRESS', 'ACTIVE'),
    ).toEqual({ kind: 'going', mayEdit: false });
    expect(
      homeAttendancePresentation(null, 'OPEN_FOR_REGISTRATION', 'INACTIVE'),
    ).toEqual({ kind: 'unanswered', mayEdit: false });
  });

  it('formats the three approved statistics without inventing metrics', () => {
    expect(homeStatisticsMetrics(statistics(), 'cs')).toEqual([
      { key: 'winRate', value: '68 %' },
      { key: 'goalsPerMatch', value: '2,1' },
      { key: 'matches', value: '18' },
    ]);
    expect(
      homeStatisticsMetrics(
        { ...statistics(), matches: 0, winRate: null, goalsPerMatch: null },
        'en',
      ),
    ).toEqual([
      { key: 'winRate', value: 'N/A' },
      { key: 'goalsPerMatch', value: 'N/A' },
      { key: 'matches', value: '0' },
    ]);
  });

  it('keeps only the newest ten matches and charts them chronologically', () => {
    const points = homeGoalHistory(
      Array.from({ length: 12 }, (_, index) => historyItem(index + 1)),
      'en',
    );

    expect(points).toHaveLength(10);
    expect(points.map(({ goals }) => goals)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(points[0]?.startsAt).toBe('2026-01-03T18:00:00.000Z');
    expect(points[0]?.label).toBe('3. 1.');
    expect(points[9]?.startsAt).toBe('2026-01-12T18:00:00.000Z');
    expect(points[9]?.label).toBe('12. 1.');
  });

  it('thins goal-date labels by plot width while retaining timeline endpoints', () => {
    expect(homeGoalXAxisLabelIndices(10, 300)).toEqual([0, 3, 6, 9]);
    expect(homeGoalXAxisLabelIndices(10, 340)).toEqual([0, 2, 5, 7, 9]);
    expect(homeGoalXAxisLabelIndices(10, 520)).toEqual([
      0, 1, 3, 4, 5, 6, 8, 9,
    ]);
    expect(homeGoalXAxisLabelIndices(3, 300)).toEqual([0, 1, 2]);
    expect(homeGoalXAxisLabelIndices(0, 300)).toEqual([]);
  });

  it('handles fewer than ten and empty histories without fake matches', () => {
    const points = homeGoalHistory([historyItem(2), historyItem(1)], 'en');

    expect(points.map(({ goals }) => goals)).toEqual([1, 2]);
    expect(homeGoalHistory([], 'en')).toEqual([]);
    expect(homeGoalScale([])).toEqual({
      maximum: 5,
      ticks: [5, 4, 3, 2, 1, 0],
    });
  });

  it('uses one column on phone and an intentional two-column tablet layout', () => {
    expect(homeUsesTwoColumns('phone')).toBe(false);
    expect(homeUsesTwoColumns('tablet')).toBe(true);
  });

  it('formats Match date and time in the selected locale and Prague timezone', () => {
    expect(formatHomeMatchDate('2026-12-16T18:00:00.000Z', 'cs')).toEqual({
      date: 'st 16. 12. 2026',
      time: '19:00',
    });
  });
});

function upcomingMatch(
  status: UpcomingMatch['status'],
  startsAt: string,
): UpcomingMatch {
  return {
    id: ids.match,
    location: 'Sportovní hala Kbely',
    myAttendance: null,
    sport: {
      id: ids.sport,
      name: 'Football',
      playersOnFieldPerTeam: 3,
      teamsPerMatch: 2,
    },
    startsAt,
    stateVersion: 1,
    status,
  };
}

function statistics(): PlayerStatistics {
  return {
    draws: 1,
    goals: 38,
    goalsPerMatch: 2.1,
    losses: 5,
    matches: 18,
    playerId: ids.player,
    winRate: 0.68,
    wins: 12,
    attendance: {
      playedMatches: 18,
      totalMatches: 20,
      percentage: 90,
    },
  };
}

function historyItem(day: number): PlayerMatchHistoryItem {
  return {
    id: `00000000-0000-4000-8000-${String(day).padStart(12, '0')}`,
    location: null,
    playerGoals: [{ goals: day, playerId: ids.player }],
    score: { teamA: day, teamB: 0 },
    sport: { id: ids.sport, name: 'Football' },
    startsAt: `2026-01-${String(day).padStart(2, '0')}T18:00:00.000Z`,
    subjectGoals: day,
    subjectResult: 'WIN',
    teams: [],
  };
}

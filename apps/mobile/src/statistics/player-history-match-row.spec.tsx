import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../matches/match-list-row', () => ({
  MatchListRow: 'MatchListRow',
}));

import type { PlayerMatchHistoryItem } from '../api/contracts';
import { PlayerHistoryMatchRow } from './player-history-match-row';

describe('Player history shared Match row adapter', () => {
  it('passes both ordered teams without duplicate participants to the shared Match row', () => {
    const onOpen = vi.fn();
    const row = PlayerHistoryMatchRow({
      language: 'cs',
      match: historyItem(),
      mode: 'phone',
      viewportWidth: 360,
      onOpen,
    }) as ReactElement<Record<string, unknown>>;

    expect(row.type).toBe('MatchListRow');
    expect(row.props).toMatchObject({
      attendance: null,
      kind: 'finished',
      language: 'cs',
      personalGoals: 0,
      result: 'DRAW',
      score: { teamA: 2, teamB: 2 },
      startsAt: '2026-01-03T18:00:00.000Z',
    });
    expect(
      (row.props.players as Array<{ id: string }>).map(({ id }) => id),
    ).toEqual([ids.selected, ids.teammate, ids.opponent]);
    expect(row.props).toMatchObject({ mode: 'phone', viewportWidth: 360 });
    expect(row.props.onOpen).toBe(onOpen);
  });
});

const ids = {
  selected: '00000000-0000-4000-8000-000000000001',
  teammate: '00000000-0000-4000-8000-000000000002',
  opponent: '00000000-0000-4000-8000-000000000003',
  sport: '00000000-0000-4000-8000-000000000004',
  teamA: '00000000-0000-4000-8000-000000000005',
  teamB: '00000000-0000-4000-8000-000000000006',
  match: '00000000-0000-4000-8000-000000000007',
};

function historyItem(): PlayerMatchHistoryItem {
  return {
    id: ids.match,
    location: null,
    playerGoals: [],
    score: { teamA: 2, teamB: 2 },
    sport: { id: ids.sport, name: 'Football' },
    startsAt: '2026-01-03T18:00:00.000Z',
    subjectGoals: 0,
    subjectResult: 'DRAW',
    teams: [
      {
        id: ids.teamA,
        side: 'A',
        players: [
          player(ids.selected, 'Selected'),
          player(ids.teammate, 'Teammate'),
        ],
      },
      {
        id: ids.teamB,
        side: 'B',
        players: [
          player(ids.opponent, 'Opponent'),
          player(ids.selected, 'Duplicate Selected'),
        ],
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

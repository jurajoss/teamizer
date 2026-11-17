import { describe, expect, it, vi } from 'vitest';

import type { MatchDetail, PlayersPage } from '../api/contracts';
import {
  canAccessParticipantEditor,
  participantAttendanceTransition,
  participantEditorGroups,
  participantEditorSearchOptions,
  updateParticipantAttendance,
} from './participant-editor-model';

const ids = {
  match: '00000000-0000-4000-8000-000000000010',
  sport: '00000000-0000-4000-8000-000000000011',
  going: '00000000-0000-4000-8000-000000000001',
  notGoing: '00000000-0000-4000-8000-000000000002',
  unanswered: '00000000-0000-4000-8000-000000000003',
  guest: '00000000-0000-4000-8000-000000000004',
};

describe('participant editor model', () => {
  it('groups paginated active Players without duplicates and retains persistent guests', () => {
    const pages: PlayersPage[] = [
      {
        items: [
          player(ids.going, 'Ada'),
          player(ids.notGoing, 'Ben'),
          player(ids.unanswered, 'Cara'),
        ],
        nextCursor: 'next-page',
      },
      {
        items: [
          player(ids.going, 'Ada'),
          { ...player(ids.guest, 'Guest Dan'), type: 'GUEST' as const },
        ],
        nextCursor: null,
      },
    ];
    const groups = participantEditorGroups(pages, matchDetail(), '');

    expect(groups.going.map(({ id }) => id)).toEqual([ids.going]);
    expect(groups.notGoing.map(({ id }) => id)).toEqual([ids.notGoing]);
    expect(groups.unanswered.map(({ id, type }) => ({ id, type }))).toEqual([
      { id: ids.unanswered, type: 'REGULAR' },
      { id: ids.guest, type: 'GUEST' },
    ]);
  });

  it('applies name-prefix search while preserving associated Players from Match Detail', () => {
    const groups = participantEditorGroups(
      [
        {
          items: [player(ids.unanswered, 'Cara')],
          nextCursor: null,
        },
      ],
      matchDetail(),
      'Be',
    );

    expect(groups.going).toEqual([]);
    expect(groups.notGoing.map(({ name }) => name)).toEqual(['Ben']);
    expect(groups.unanswered).toEqual([]);
  });

  it('reuses active-player search and cursor pagination parameters', () => {
    expect(participantEditorSearchOptions('  Ada ', 'cursor-2')).toEqual({
      cursor: 'cursor-2',
      limit: 25,
      q: 'Ada',
      status: 'ACTIVE',
    });
    expect(participantEditorSearchOptions('', null)).toEqual({
      limit: 25,
      status: 'ACTIVE',
    });
  });

  it('maps supported state transitions and rejects returning another Player to unanswered', () => {
    expect(participantAttendanceTransition(null, 'GOING')).toEqual({
      kind: 'ADD_GOING',
    });
    expect(participantAttendanceTransition(null, 'NOT_GOING')).toEqual({
      attendance: 'NOT_GOING',
      kind: 'UPDATE',
    });
    expect(participantAttendanceTransition('NOT_GOING', 'GOING')).toEqual({
      attendance: 'GOING',
      kind: 'UPDATE',
    });
    expect(participantAttendanceTransition('GOING', 'NOT_GOING')).toEqual({
      attendance: 'NOT_GOING',
      kind: 'UPDATE',
    });
    expect(participantAttendanceTransition('GOING', 'GOING')).toEqual({
      kind: 'NONE',
    });
    expect(participantAttendanceTransition('GOING', null)).toEqual({
      kind: 'UNSUPPORTED',
    });
  });

  it('uses addParticipant only for unanswered to Going', async () => {
    const api = participantApi();

    await expect(
      updateParticipantAttendance(
        api,
        ids.match,
        ids.unanswered,
        null,
        'GOING',
      ),
    ).resolves.toBe(true);

    expect(api.addParticipant).toHaveBeenCalledExactlyOnceWith(ids.match, {
      playerId: ids.unanswered,
    });
    expect(api.updateParticipant).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'NOT_GOING'],
    ['NOT_GOING', 'GOING'],
    ['GOING', 'NOT_GOING'],
  ] as const)(
    'uses the attendance patch for %s to %s',
    async (current, next) => {
      const api = participantApi();

      await expect(
        updateParticipantAttendance(
          api,
          ids.match,
          ids.notGoing,
          current,
          next,
        ),
      ).resolves.toBe(true);

      expect(api.updateParticipant).toHaveBeenCalledExactlyOnceWith(
        ids.match,
        ids.notGoing,
        next,
      );
      expect(api.addParticipant).not.toHaveBeenCalled();
    },
  );

  it('does not mutate an unchanged state or create a duplicate Player', async () => {
    const api = participantApi();

    await expect(
      updateParticipantAttendance(api, ids.match, ids.going, 'GOING', 'GOING'),
    ).resolves.toBe(false);

    expect(api.addParticipant).not.toHaveBeenCalled();
    expect(api.updateParticipant).not.toHaveBeenCalled();
  });

  it('does not fake an unsupported unanswered mutation', async () => {
    const api = participantApi();

    await expect(
      updateParticipantAttendance(api, ids.match, ids.going, 'GOING', null),
    ).rejects.toThrow('unsupported');
    expect(api.addParticipant).not.toHaveBeenCalled();
    expect(api.updateParticipant).not.toHaveBeenCalled();
  });

  it('moves a Player between groups after authoritative Match refresh', () => {
    const before = participantEditorGroups(undefined, matchDetail(), '');
    const refreshed = matchDetail({
      participants: {
        going: [player(ids.going, 'Ada'), player(ids.notGoing, 'Ben')],
        notGoing: [],
        unanswered: [player(ids.unanswered, 'Cara')],
      },
    });
    const after = participantEditorGroups(undefined, refreshed, '');

    expect(before.notGoing.map(({ id }) => id)).toContain(ids.notGoing);
    expect(after.going.map(({ id }) => id)).toContain(ids.notGoing);
    expect(after.notGoing).toEqual([]);
  });

  it('allows only active ADMIN users to manage an open Match', () => {
    expect(
      canAccessParticipantEditor('ADMIN', 'ACTIVE', 'OPEN_FOR_REGISTRATION'),
    ).toBe(true);
    expect(
      canAccessParticipantEditor('PLAYER', 'ACTIVE', 'OPEN_FOR_REGISTRATION'),
    ).toBe(false);
    expect(
      canAccessParticipantEditor('ADMIN', 'INACTIVE', 'OPEN_FOR_REGISTRATION'),
    ).toBe(false);
    expect(canAccessParticipantEditor('ADMIN', 'ACTIVE', 'IN_PROGRESS')).toBe(
      false,
    );
  });
});

function participantApi() {
  return {
    addParticipant: vi.fn().mockResolvedValue({}),
    updateParticipant: vi.fn().mockResolvedValue({}),
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

function matchDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    id: ids.match,
    sport: {
      id: ids.sport,
      name: 'Football',
      teamsPerMatch: 2,
      playersOnFieldPerTeam: 5,
    },
    startsAt: '2026-09-29T18:00:00.000Z',
    location: 'Pitch',
    status: 'OPEN_FOR_REGISTRATION',
    stateVersion: 2,
    myAttendance: 'GOING',
    participants: {
      going: [player(ids.going, 'Ada')],
      notGoing: [player(ids.notGoing, 'Ben')],
      unanswered: [player(ids.unanswered, 'Cara')],
    },
    teams: null,
    provenance: null,
    result: null,
    ...overrides,
  };
}

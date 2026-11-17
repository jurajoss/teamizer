import {
  PlayerInvitationStatus,
  PlayerStatus,
  PlayerType,
  TeamSide,
  UserRole,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedUser } from '../src/auth/auth.types';
import type { AvatarService } from '../src/avatars/avatar.service';
import { PlayerStatisticsService } from '../src/players/player-statistics.service';
import type { PrismaService } from '../src/prisma/prisma.service';

describe('Player statistics query strategy', () => {
  it('loads ranking W/D/L totals and the shared denominator without per-Player queries', async () => {
    const players = ['Ada', 'Berta', 'Cyril'].map((name, index) => ({
      id: `player-${index}`,
      name,
      type: PlayerType.REGULAR,
      status: PlayerStatus.ACTIVE,
      speed: 5,
      endurance: 5,
      defense: 5,
      attack: 5,
      technique: 5,
      avatarStorageKey: null,
      teamMemberships:
        index === 0
          ? [
              {
                matchId: 'match-1',
                team: {
                  side: TeamSide.A,
                  match: { teamAScore: 2, teamBScore: 1 },
                },
              },
            ]
          : [],
      matchPlayerStats: [],
    }));
    const findMany = vi.fn().mockResolvedValue(players);
    const count = vi.fn().mockResolvedValue(4);
    const transaction = vi.fn((queries: Promise<unknown>[]) =>
      Promise.all(queries),
    );
    const service = new PlayerStatisticsService(
      {
        player: { findMany },
        match: { count },
        $transaction: transaction,
      } as unknown as PrismaService,
      { urlFor: vi.fn().mockReturnValue(null) } as unknown as AvatarService,
    );

    const result = await service.rankings({ limit: 100 }, {
      role: UserRole.PLAYER,
    } as AuthenticatedUser);

    expect(result.items).toHaveLength(3);
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany.mock.calls[0]?.[0]?.select).not.toHaveProperty('user');
    expect(findMany.mock.calls[0]?.[0]?.select).not.toHaveProperty(
      'invitation',
    );
    expect(count).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledOnce();
    expect(result.items[0]?.statistics).toMatchObject({
      draws: 0,
      losses: 0,
      winRate: 1,
      wins: 1,
    });
    expect(result.items.map(({ statistics }) => statistics.attendance)).toEqual(
      [
        { playedMatches: 1, totalMatches: 4, percentage: 25 },
        { playedMatches: 0, totalMatches: 4, percentage: 0 },
        { playedMatches: 0, totalMatches: 4, percentage: 0 },
      ],
    );
  });

  it.each([
    {
      account: { state: 'UNLINKED' },
      invitation: null,
      user: null,
    },
    {
      account: {
        state: 'INVITED',
        email: 'ada@example.com',
        invitationStatus: 'SENT',
      },
      invitation: {
        email: 'ada@example.com',
        status: PlayerInvitationStatus.SENT,
      },
      user: null,
    },
    {
      account: { state: 'REGISTERED' },
      invitation: null,
      user: { id: 'user-1' },
    },
  ])(
    'maps privileged account state in the existing ADMIN detail request',
    async ({ account, invitation, user }) => {
      const player = {
        id: 'player-1',
        name: 'Ada',
        type: PlayerType.GUEST,
        status: PlayerStatus.ACTIVE,
        speed: 5,
        endurance: 5,
        defense: 5,
        attack: 5,
        technique: 5,
        avatarStorageKey: null,
        invitation,
        user,
        teamMemberships: [],
        matchPlayerStats: [],
      };
      const findUnique = vi.fn().mockResolvedValue(player);
      const count = vi.fn().mockResolvedValue(0);
      const transaction = vi.fn((queries: Promise<unknown>[]) =>
        Promise.all(queries),
      );
      const service = new PlayerStatisticsService(
        {
          player: { findUnique },
          match: { count },
          $transaction: transaction,
        } as unknown as PrismaService,
        { urlFor: vi.fn().mockReturnValue(null) } as unknown as AvatarService,
      );

      const result = await service.detail('player-1', {
        role: UserRole.ADMIN,
      } as AuthenticatedUser);

      expect(result).toMatchObject({ account });
      expect(findUnique).toHaveBeenCalledOnce();
      expect(count).toHaveBeenCalledOnce();
      expect(transaction).toHaveBeenCalledOnce();
    },
  );
});

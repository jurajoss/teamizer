import { describe, expect, it, vi } from 'vitest';

import type { AdminPlayerDetail, PlayerDetail } from '../api/contracts';
import { matchQueryKeys } from '../matches/match-query-keys';
import { statisticsQueryKeys } from '../statistics/statistics-query-keys';
import { profileQueryKeys } from './profile-query-keys';
import {
  convertGuestPlayer,
  inviteGuestPlayer,
  publishAdminPlayer,
  removeAdminPlayerAvatar,
  updateManagedPlayer,
} from './use-admin-player-controller';
import { publishOwnProfile, removeOwnAvatar } from './use-profile-controller';

const playerId = '00000000-0000-4000-8000-000000000001';

function playerDetail(): PlayerDetail {
  return {
    id: playerId,
    name: 'Ada',
    type: 'REGULAR',
    status: 'ACTIVE',
    avatarUrl: null,
    statistics: {
      matches: 2,
      wins: 1,
      draws: 0,
      losses: 1,
      winRate: 0.5,
      goals: 3,
      goalsPerMatch: 1.5,
    },
  };
}

function adminPlayerDetail(): AdminPlayerDetail {
  return {
    ...playerDetail(),
    type: 'GUEST',
    attributes: {
      speed: 5,
      endurance: 5,
      defense: 5,
      attack: 5,
      technique: 5,
    },
  };
}

function queryClient() {
  return {
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  };
}

describe('profile behavior seams', () => {
  it('publishes an own-profile mutation to profile/statistics caches and refreshes identity', async () => {
    const client = queryClient();
    const refreshCurrentUser = vi.fn().mockResolvedValue(undefined);
    const player = playerDetail();

    await publishOwnProfile(client, player, refreshCurrentUser);

    expect(client.setQueryData.mock.calls).toEqual([
      [profileQueryKeys.current(playerId), player],
      [statisticsQueryKeys.player(playerId), player],
    ]);
    expect(client.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: statisticsQueryKeys.root }],
      [{ queryKey: profileQueryKeys.root }],
    ]);
    expect(refreshCurrentUser).toHaveBeenCalledOnce();
  });

  it('removes an avatar before reloading the authoritative profile', async () => {
    const calls: string[] = [];
    const player = playerDetail();
    const api = {
      deletePlayerAvatar: vi.fn(async () => {
        calls.push('delete');
      }),
      getPlayerDetail: vi.fn(async () => {
        calls.push('reload');
        return player;
      }),
      updateOwnPlayer: vi.fn(),
      uploadOwnPlayerAvatar: vi.fn(),
    };

    await expect(removeOwnAvatar(api, playerId)).resolves.toEqual(player);
    expect(calls).toEqual(['delete', 'reload']);
  });
});

describe('admin Player behavior seams', () => {
  it('publishes edits to every dependent cache and refreshes identity only for self', async () => {
    const client = queryClient();
    const refreshCurrentUser = vi.fn().mockResolvedValue(undefined);
    const player = adminPlayerDetail();

    await publishAdminPlayer(client, player, player.id, refreshCurrentUser);

    expect(client.setQueryData.mock.calls).toEqual([
      [profileQueryKeys.adminDetail(playerId), player],
      [statisticsQueryKeys.player(playerId), player],
    ]);
    expect(client.invalidateQueries.mock.calls).toEqual([
      [{ queryKey: profileQueryKeys.root }],
      [{ queryKey: statisticsQueryKeys.root }],
      [{ queryKey: matchQueryKeys.root }],
    ]);
    expect(refreshCurrentUser).toHaveBeenCalledOnce();

    refreshCurrentUser.mockClear();
    await publishAdminPlayer(
      client,
      player,
      '00000000-0000-4000-8000-000000000099',
      refreshCurrentUser,
    );
    expect(refreshCurrentUser).not.toHaveBeenCalled();
  });

  it('preserves avatar removal and legacy conversion reload ordering', async () => {
    const calls: string[] = [];
    const player = adminPlayerDetail();
    const api = {
      convertGuest: vi.fn(async () => {
        calls.push('convert');
        return {
          user: {
            id: '00000000-0000-4000-8000-000000000010',
            role: 'PLAYER' as const,
            notificationsEnabled: true,
            createdAt: '2026-09-20T12:00:00.000Z',
          },
          player: {
            id: player.id,
            name: player.name,
            type: player.type,
            status: player.status,
            avatarUrl: player.avatarUrl,
            attributes: player.attributes,
          },
        };
      }),
      deletePlayerAvatar: vi.fn(async () => {
        calls.push('delete');
      }),
      getAdminPlayerDetail: vi.fn(async () => {
        calls.push('reload');
        return player;
      }),
      inviteGuest: vi.fn(),
      updateAdminPlayer: vi.fn(),
      uploadAdminPlayerAvatar: vi.fn(),
    };

    await removeAdminPlayerAvatar(api, playerId);
    await convertGuestPlayer(api, playerId, 'firebase-uid');

    expect(calls).toEqual(['delete', 'reload', 'convert']);
    expect(api.convertGuest).toHaveBeenCalledWith(playerId, 'firebase-uid');
  });

  it('keeps invitation resend/retry and status transitions as direct API operations', async () => {
    const player = adminPlayerDetail();
    const inviteGuest = vi.fn().mockResolvedValue({ status: 'SENT' });
    const updateAdminPlayer = vi.fn().mockResolvedValue(player);
    const api = {
      convertGuest: vi.fn(),
      deletePlayerAvatar: vi.fn(),
      getAdminPlayerDetail: vi.fn(),
      inviteGuest,
      updateAdminPlayer,
      uploadAdminPlayerAvatar: vi.fn(),
    };

    await inviteGuestPlayer(api, playerId, 'player@example.com');
    await inviteGuestPlayer(api, playerId, 'player@example.com');
    await updateManagedPlayer(api, playerId, { status: 'INACTIVE' });
    await updateManagedPlayer(api, playerId, { status: 'ACTIVE' });

    expect(inviteGuest).toHaveBeenCalledTimes(2);
    expect(inviteGuest).toHaveBeenNthCalledWith(
      2,
      playerId,
      'player@example.com',
    );
    expect(updateAdminPlayer.mock.calls).toEqual([
      [playerId, { status: 'INACTIVE' }],
      [playerId, { status: 'ACTIVE' }],
    ]);
  });
});

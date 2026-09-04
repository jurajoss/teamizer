import { UserRole } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import type {
  AdminPlayerDto,
  CurrentUserResponseDto,
  PlayerPublicDto,
  UserDto,
} from './player.dto';

type PlayerRecord = AuthenticatedUser['player'];
type PublicPlayerRecord = Pick<
  PlayerRecord,
  'id' | 'name' | 'type' | 'status' | 'avatarStorageKey'
>;
type AdminPlayerRecord = PublicPlayerRecord &
  Pick<
    PlayerRecord,
    'speed' | 'endurance' | 'defense' | 'attack' | 'technique'
  >;

export type AvatarUrlResolver = (storageKey: string | null) => string | null;

export function mapPlayerPublic(
  player: PublicPlayerRecord,
  avatarUrl: AvatarUrlResolver,
): PlayerPublicDto {
  return {
    id: player.id,
    name: player.name,
    type: player.type,
    status: player.status,
    avatarUrl: avatarUrl(player.avatarStorageKey),
  };
}

export function mapAdminPlayer(
  player: AdminPlayerRecord,
  avatarUrl: AvatarUrlResolver,
): AdminPlayerDto {
  return {
    ...mapPlayerPublic(player, avatarUrl),
    attributes: {
      speed: player.speed,
      endurance: player.endurance,
      defense: player.defense,
      attack: player.attack,
      technique: player.technique,
    },
  };
}

export function mapUser(user: AuthenticatedUser): UserDto {
  return {
    id: user.id,
    role: user.role,
    notificationsEnabled: user.notificationsEnabled,
    createdAt: user.createdAt.toISOString(),
  };
}

export function mapCurrentUser(
  user: AuthenticatedUser,
  avatarUrl: AvatarUrlResolver,
): CurrentUserResponseDto {
  return {
    user: mapUser(user),
    player:
      user.role === UserRole.ADMIN
        ? mapAdminPlayer(user.player, avatarUrl)
        : mapPlayerPublic(user.player, avatarUrl),
  };
}

import { Inject, Injectable } from '@nestjs/common';
import { PlayerStatus, UserRole } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { AvatarService } from '../avatars/avatar.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  PlayerListQueryDto,
  PlayersPageDto,
  UpdatePlayerRequestDto,
} from './player.dto';
import { mapPlayerPublic } from './player.mapper';

const DEFAULT_PAGE_SIZE = 25;
const CURSOR_VERSION = 1;

@Injectable()
export class PlayerProfileService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AvatarService) private readonly avatars: AvatarService,
  ) {}

  async list(
    query: PlayerListQueryDto,
    actor: AuthenticatedUser,
  ): Promise<PlayersPageDto> {
    const status = query.status ?? 'ACTIVE';
    if (actor.role !== UserRole.ADMIN && status !== 'ACTIVE') {
      throw this.forbidden('Only an administrator may list inactive Players.');
    }
    const normalizedQuery = query.q?.trim() ?? '';
    const offset = this.decodeCursor(query.cursor, status, normalizedQuery);
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const players = await this.prisma.player.findMany({
      where: {
        ...(status === 'ALL' ? {} : { status }),
        ...(normalizedQuery
          ? { name: { startsWith: normalizedQuery, mode: 'insensitive' } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        avatarStorageKey: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit + 1,
    });
    const hasNextPage = players.length > limit;
    return {
      items: players
        .slice(0, limit)
        .map((player) =>
          mapPlayerPublic(player, (key) => this.avatars.urlFor(key)),
        ),
      nextCursor: hasNextPage
        ? this.encodeCursor(status, normalizedQuery, offset + limit)
        : null,
    };
  }

  async update(
    playerId: string,
    request: UpdatePlayerRequestDto,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const hasName = request.name !== undefined;
    const hasAdminFields =
      request.status !== undefined || request.attributes !== undefined;
    if (!hasName && !hasAdminFields) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'At least one editable Player field is required.',
      );
    }

    if (actor.role !== UserRole.ADMIN) {
      if (actor.player.id !== playerId || hasAdminFields) {
        throw this.forbidden(
          hasAdminFields
            ? 'Only an administrator may update Player status or attributes.'
            : 'You may update only your own Player profile.',
        );
      }
    } else if (
      actor.player.status !== PlayerStatus.ACTIVE &&
      (actor.player.id !== playerId || hasAdminFields)
    ) {
      throw new ApiError(
        403,
        'PLAYER_INACTIVE',
        'An active administrator is required for Player administration.',
      );
    }

    const result = await this.prisma.player.updateMany({
      where: { id: playerId },
      data: {
        ...(request.name !== undefined ? { name: request.name.trim() } : {}),
        ...(request.status !== undefined ? { status: request.status } : {}),
        ...(request.attributes ?? {}),
      },
    });
    if (result.count === 0) {
      throw new ApiError(
        404,
        'RESOURCE_NOT_FOUND',
        'The requested Player does not exist.',
      );
    }
  }

  private encodeCursor(status: string, query: string, offset: number): string {
    return Buffer.from(
      JSON.stringify({ version: CURSOR_VERSION, status, query, offset }),
    ).toString('base64url');
  }

  private decodeCursor(
    cursor: string | undefined,
    status: string,
    query: string,
  ): number {
    if (!cursor) return 0;
    try {
      const value: unknown = JSON.parse(
        Buffer.from(cursor, 'base64url').toString('utf8'),
      );
      if (
        typeof value === 'object' &&
        value !== null &&
        'version' in value &&
        value.version === CURSOR_VERSION &&
        'status' in value &&
        value.status === status &&
        'query' in value &&
        value.query === query &&
        'offset' in value &&
        typeof value.offset === 'number' &&
        Number.isInteger(value.offset) &&
        value.offset >= 0
      ) {
        return value.offset;
      }
    } catch {
      // Fall through to the stable validation error.
    }
    throw new ApiError(400, 'VALIDATION_ERROR', 'The cursor is invalid.');
  }

  private forbidden(message: string): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common';
import { PlayerStatus, UserRole } from '@prisma/client';

import type { AuthenticatedUser } from '../auth/auth.types';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarImageService } from './avatar-image.service';
import { AVATAR_STORAGE, type AvatarStorage } from './avatar-storage';

@Injectable()
export class AvatarService {
  private readonly logger = new Logger(AvatarService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AvatarImageService) private readonly images: AvatarImageService,
    @Inject(AVATAR_STORAGE) private readonly storage: AvatarStorage,
  ) {}

  urlFor(storageKey: string | null): string | null {
    return storageKey ? this.storage.publicUrl(storageKey) : null;
  }

  async replace(
    playerId: string,
    actor: AuthenticatedUser,
    file: Express.Multer.File | undefined,
    now = new Date(),
  ): Promise<void> {
    this.authorize(playerId, actor);
    const normalized = await this.images.normalize(file);
    const newStorageKey = await this.storage.store(playerId, normalized);

    let oldStorageKey: string | null;
    try {
      oldStorageKey = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Player" WHERE "id" = ${playerId}::uuid FOR UPDATE`;
        const player = await transaction.player.findUnique({
          where: { id: playerId },
          select: { avatarStorageKey: true },
        });
        if (!player) throw this.notFound();
        await transaction.player.update({
          where: { id: playerId },
          data: {
            avatarStorageKey: newStorageKey,
            avatarContentType: 'image/jpeg',
            avatarUpdatedAt: now,
          },
        });
        return player.avatarStorageKey;
      });
    } catch (error) {
      await this.deleteBestEffort(newStorageKey);
      throw error;
    }
    if (oldStorageKey && oldStorageKey !== newStorageKey) {
      await this.deleteBestEffort(oldStorageKey);
    }
  }

  async remove(playerId: string, actor: AuthenticatedUser): Promise<void> {
    this.authorize(playerId, actor);
    const oldStorageKey = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Player" WHERE "id" = ${playerId}::uuid FOR UPDATE`;
        const player = await transaction.player.findUnique({
          where: { id: playerId },
          select: { avatarStorageKey: true },
        });
        if (!player) throw this.notFound();
        await transaction.player.update({
          where: { id: playerId },
          data: {
            avatarStorageKey: null,
            avatarContentType: null,
            avatarUpdatedAt: null,
          },
        });
        return player.avatarStorageKey;
      },
    );
    if (oldStorageKey) await this.deleteBestEffort(oldStorageKey);
  }

  private authorize(playerId: string, actor: AuthenticatedUser): void {
    if (actor.player.id === playerId) return;
    if (
      actor.role === UserRole.ADMIN &&
      actor.player.status === PlayerStatus.ACTIVE
    ) {
      return;
    }
    throw new ApiError(
      403,
      actor.role === UserRole.ADMIN ? 'PLAYER_INACTIVE' : 'FORBIDDEN',
      actor.role === UserRole.ADMIN
        ? 'An active administrator is required for this action.'
        : 'You may manage only your own avatar.',
    );
  }

  private notFound(): ApiError {
    return new ApiError(
      404,
      'RESOURCE_NOT_FOUND',
      'The requested Player does not exist.',
    );
  }

  private async deleteBestEffort(storageKey: string): Promise<void> {
    try {
      await this.storage.delete(storageKey);
    } catch (error) {
      this.logger.warn(
        `Could not delete superseded avatar object ${storageKey}: ${error instanceof Error ? error.message : 'unknown storage error'}`,
      );
    }
  }
}

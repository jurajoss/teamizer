import { Inject, Injectable } from '@nestjs/common';
import { PlayerType, Prisma } from '@prisma/client';

import {
  authenticatedUserSelect,
  type AuthenticatedUser,
} from '../auth/auth.types';
import { FirebaseIdentityLookup } from '../auth/firebase-identity-lookup.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ConvertGuestRequestDto,
  OnboardingRequestDto,
} from './player.dto';

@Injectable()
export class PlayerIdentityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FirebaseIdentityLookup)
    private readonly firebaseIdentityLookup: FirebaseIdentityLookup,
  ) {}

  async onboard(
    authProviderId: string,
    request: OnboardingRequestDto,
  ): Promise<AuthenticatedUser> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingUser = await transaction.user.findUnique({
          where: { authProviderId },
          select: { id: true },
        });

        if (existingUser) {
          throw new ApiError(
            409,
            'USER_ALREADY_ONBOARDED',
            'This Firebase identity is already onboarded.',
          );
        }

        return transaction.user.create({
          data: {
            authProviderId,
            player: {
              create: {
                name: request.name.trim(),
                type: PlayerType.REGULAR,
                ...request.attributes,
              },
            },
          },
          select: authenticatedUserSelect,
        });
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (this.isUniqueConstraint(error, 'authProviderId')) {
        throw new ApiError(
          409,
          'USER_ALREADY_ONBOARDED',
          'This Firebase identity is already onboarded.',
        );
      }

      throw error;
    }
  }

  async convertGuest(
    playerId: string,
    request: ConvertGuestRequestDto,
  ): Promise<AuthenticatedUser> {
    const authProviderId = request.authProviderId.trim();
    await this.validateGuestConversionCandidate(playerId, authProviderId);
    await this.validateFirebaseIdentity(authProviderId);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const lockedPlayers = await transaction.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "Player"
          WHERE "id" = ${playerId}::uuid
          FOR UPDATE
        `;

        if (lockedPlayers.length === 0) {
          throw new ApiError(
            404,
            'RESOURCE_NOT_FOUND',
            'The requested Player does not exist.',
          );
        }

        const player = await transaction.player.findUniqueOrThrow({
          where: { id: playerId },
          select: {
            type: true,
            user: { select: { id: true } },
          },
        });

        if (player.user) {
          throw new ApiError(
            409,
            'PLAYER_ALREADY_HAS_USER',
            'This Player is already linked to a User.',
          );
        }

        if (player.type !== PlayerType.GUEST) {
          throw new ApiError(
            422,
            'PLAYER_IS_NOT_GUEST',
            'Only a guest Player can be converted.',
          );
        }

        const linkedIdentity = await transaction.user.findUnique({
          where: { authProviderId },
          select: { id: true },
        });

        if (linkedIdentity) {
          throw new ApiError(
            409,
            'AUTH_PROVIDER_ALREADY_LINKED',
            'This Firebase identity is already linked to another User.',
          );
        }

        await transaction.player.update({
          where: { id: playerId },
          data: { type: PlayerType.REGULAR },
        });

        return transaction.user.create({
          data: {
            playerId,
            authProviderId,
          },
          select: authenticatedUserSelect,
        });
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      if (this.isUniqueConstraint(error, 'authProviderId')) {
        throw new ApiError(
          409,
          'AUTH_PROVIDER_ALREADY_LINKED',
          'This Firebase identity is already linked to another User.',
        );
      }

      if (this.isUniqueConstraint(error, 'playerId')) {
        throw new ApiError(
          409,
          'PLAYER_ALREADY_HAS_USER',
          'This Player is already linked to a User.',
        );
      }

      throw error;
    }
  }

  private async validateGuestConversionCandidate(
    playerId: string,
    authProviderId: string,
  ): Promise<void> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      select: { type: true, user: { select: { id: true } } },
    });

    if (!player) {
      throw new ApiError(
        404,
        'RESOURCE_NOT_FOUND',
        'The requested Player does not exist.',
      );
    }
    if (player.user) {
      throw new ApiError(
        409,
        'PLAYER_ALREADY_HAS_USER',
        'This Player is already linked to a User.',
      );
    }
    if (player.type !== PlayerType.GUEST) {
      throw new ApiError(
        422,
        'PLAYER_IS_NOT_GUEST',
        'Only a guest Player can be converted.',
      );
    }

    const linkedIdentity = await this.prisma.user.findUnique({
      where: { authProviderId },
      select: { id: true },
    });
    if (linkedIdentity) {
      throw new ApiError(
        409,
        'AUTH_PROVIDER_ALREADY_LINKED',
        'This Firebase identity is already linked to another User.',
      );
    }
  }

  private async validateFirebaseIdentity(
    authProviderId: string,
  ): Promise<void> {
    let exists: boolean;
    try {
      exists = await this.firebaseIdentityLookup.exists(authProviderId);
    } catch {
      throw new ApiError(
        503,
        'IDENTITY_PROVIDER_UNAVAILABLE',
        'Identity validation is temporarily unavailable.',
      );
    }

    if (!exists) {
      throw new ApiError(
        422,
        'FIREBASE_IDENTITY_NOT_FOUND',
        'The supplied identity does not exist.',
      );
    }
  }

  private isUniqueConstraint(error: unknown, field: string): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    return Array.isArray(target) && target.includes(field);
  }
}

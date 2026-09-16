import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerInvitationStatus, PlayerType, Prisma } from '@prisma/client';

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
  private readonly invitationAttemptLeaseMilliseconds: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FirebaseIdentityLookup)
    private readonly firebaseIdentityLookup: FirebaseIdentityLookup,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.invitationAttemptLeaseMilliseconds =
      config.getOrThrow<number>('INVITATION_ATTEMPT_LEASE_SECONDS') * 1_000;
  }

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
            invitation: {
              select: {
                id: true,
                authProviderId: true,
                attemptToken: true,
                attemptStartedAt: true,
              },
            },
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

        this.assertInvitationAllowsUidFallback(
          player.invitation,
          authProviderId,
        );

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

        if (player.invitation) {
          const acceptsInvitation =
            player.invitation.authProviderId === authProviderId;
          await transaction.playerInvitation.update({
            where: { id: player.invitation.id },
            data: {
              status: acceptsInvitation
                ? PlayerInvitationStatus.ACCEPTED
                : PlayerInvitationStatus.REVOKED,
              acceptedAt: acceptsInvitation ? new Date() : null,
              attemptToken: null,
              attemptStartedAt: null,
            },
          });
        }

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
      select: {
        type: true,
        user: { select: { id: true } },
        invitation: {
          select: {
            authProviderId: true,
            attemptToken: true,
            attemptStartedAt: true,
          },
        },
      },
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
    this.assertInvitationAllowsUidFallback(player.invitation, authProviderId);

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

  private assertInvitationAllowsUidFallback(
    invitation: {
      authProviderId: string | null;
      attemptToken: string | null;
      attemptStartedAt: Date | null;
    } | null,
    authProviderId: string,
  ): void {
    if (
      invitation?.attemptToken &&
      invitation.attemptStartedAt &&
      invitation.attemptStartedAt.getTime() >
        Date.now() - this.invitationAttemptLeaseMilliseconds
    ) {
      throw new ApiError(
        409,
        'INVITATION_IN_PROGRESS',
        'Wait for the invitation attempt to finish before using UID conversion.',
      );
    }
    if (
      invitation?.authProviderId &&
      invitation.authProviderId !== authProviderId
    ) {
      throw new ApiError(
        409,
        'INVITATION_IDENTITY_CONFLICT',
        'This Player already has an invitation for another Firebase identity.',
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

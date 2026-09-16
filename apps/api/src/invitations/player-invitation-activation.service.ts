import { Inject, Injectable } from '@nestjs/common';
import { PlayerInvitationStatus, PlayerType, Prisma } from '@prisma/client';

import {
  authenticatedUserSelect,
  type AuthenticatedUser,
  type VerifiedFirebaseIdentity,
} from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlayerInvitationActivationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async activate(
    identity: VerifiedFirebaseIdentity,
  ): Promise<AuthenticatedUser | null> {
    const normalizedEmail = identity.email?.trim().toLowerCase();
    const candidate = await this.prisma.playerInvitation.findFirst({
      where: {
        OR: [
          { authProviderId: identity.authProviderId },
          ...(normalizedEmail
            ? [{ authProviderId: null, email: normalizedEmail }]
            : []),
        ],
      },
      select: { playerId: true },
    });
    if (!candidate) return null;

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const lockedPlayers = await transaction.$queryRaw<
          Array<{ id: string }>
        >`
          SELECT "id"
          FROM "Player"
          WHERE "id" = ${candidate.playerId}::uuid
          FOR UPDATE
        `;
        if (lockedPlayers.length === 0) return null;

        const invitation = await transaction.playerInvitation.findUnique({
          where: { playerId: candidate.playerId },
          include: {
            player: {
              select: {
                type: true,
                user: { select: { authProviderId: true } },
              },
            },
          },
        });
        if (
          !invitation ||
          !this.matchesIdentity(
            invitation.authProviderId,
            invitation.email,
            identity,
          ) ||
          invitation.status === PlayerInvitationStatus.REVOKED
        ) {
          return null;
        }
        if (invitation.player.user) {
          if (
            invitation.player.user.authProviderId !== identity.authProviderId
          ) {
            return null;
          }
          await transaction.playerInvitation.update({
            where: { id: invitation.id },
            data: {
              status: PlayerInvitationStatus.ACCEPTED,
              acceptedAt: invitation.acceptedAt ?? new Date(),
              attemptToken: null,
              attemptStartedAt: null,
            },
          });
          return transaction.user.findUnique({
            where: { authProviderId: identity.authProviderId },
            select: authenticatedUserSelect,
          });
        }
        if (invitation.player.type !== PlayerType.GUEST) {
          await transaction.playerInvitation.update({
            where: { id: invitation.id },
            data: {
              status: PlayerInvitationStatus.REVOKED,
              attemptToken: null,
              attemptStartedAt: null,
            },
          });
          return null;
        }

        const user = await transaction.user.create({
          data: {
            playerId: invitation.playerId,
            authProviderId: identity.authProviderId,
          },
          select: authenticatedUserSelect,
        });
        await transaction.player.update({
          where: { id: invitation.playerId },
          data: { type: PlayerType.REGULAR },
        });
        await transaction.playerInvitation.update({
          where: { id: invitation.id },
          data: {
            status: PlayerInvitationStatus.ACCEPTED,
            authProviderId: identity.authProviderId,
            acceptedAt: new Date(),
            attemptToken: null,
            attemptStartedAt: null,
            lastErrorCode: null,
          },
        });

        return {
          ...user,
          player: { ...user.player, type: PlayerType.REGULAR },
        };
      });
    } catch (error) {
      if (!this.isUniqueConstraint(error)) throw error;
      return this.prisma.user.findUnique({
        where: { authProviderId: identity.authProviderId },
        select: authenticatedUserSelect,
      });
    }
  }

  private matchesIdentity(
    invitedAuthProviderId: string | null,
    invitedEmail: string,
    identity: VerifiedFirebaseIdentity,
  ): boolean {
    if (invitedAuthProviderId) {
      return invitedAuthProviderId === identity.authProviderId;
    }
    return identity.email?.trim().toLowerCase() === invitedEmail;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

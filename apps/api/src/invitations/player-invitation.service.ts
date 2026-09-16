import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlayerInvitationStatus, PlayerType, Prisma } from '@prisma/client';

import {
  firebaseAdminErrorCode,
  FirebaseIdentityLookup,
  type FirebaseIdentityRecord,
} from '../auth/firebase-identity-lookup.service';
import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationEmailSender } from './invitation-email.sender';

type InvitationClaim = {
  attemptToken: string;
  authProviderId: string | null;
  email: string;
  playerName: string;
};

export type PlayerInvitationResult = {
  status: 'SENT' | 'ACCEPTED';
};

@Injectable()
export class PlayerInvitationService {
  private readonly logger = new Logger(PlayerInvitationService.name);
  private readonly attemptLeaseMilliseconds: number;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FirebaseIdentityLookup)
    private readonly firebaseIdentities: FirebaseIdentityLookup,
    @Inject(InvitationEmailSender)
    private readonly invitationEmails: InvitationEmailSender,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.attemptLeaseMilliseconds =
      config.getOrThrow<number>('INVITATION_ATTEMPT_LEASE_SECONDS') * 1_000;
  }

  async invite(
    playerId: string,
    rawEmail: string,
  ): Promise<PlayerInvitationResult> {
    const email = normalizeInvitationEmail(rawEmail);
    const claim = await this.claimAttempt(playerId, email);

    let identity: FirebaseIdentityRecord;
    try {
      identity = await this.resolveFirebaseIdentity(claim);
      const alreadyAccepted = await this.recordFirebaseIdentity(
        claim,
        identity.authProviderId,
      );
      if (alreadyAccepted) return { status: 'ACCEPTED' };
    } catch (error) {
      if (error instanceof ApiError) {
        await this.releaseFailedAttempt(claim.attemptToken, error.code);
        throw error;
      }
      await this.releaseFailedAttempt(
        claim.attemptToken,
        'IDENTITY_PROVIDER_UNAVAILABLE',
      );
      throw new ApiError(
        503,
        'IDENTITY_PROVIDER_UNAVAILABLE',
        'Invitation identity preparation is temporarily unavailable.',
      );
    }

    let passwordSetupUrl: string | undefined;
    if (this.invitationEmails.requiresGeneratedPasswordSetupLink) {
      try {
        passwordSetupUrl =
          await this.firebaseIdentities.generatePasswordSetupLink(email);
      } catch {
        await this.releaseFailedAttempt(
          claim.attemptToken,
          'IDENTITY_PROVIDER_UNAVAILABLE',
        );
        throw new ApiError(
          503,
          'IDENTITY_PROVIDER_UNAVAILABLE',
          'Invitation identity preparation is temporarily unavailable.',
        );
      }
    }

    try {
      await this.invitationEmails.send({
        recipientEmail: email,
        playerName: claim.playerName,
        idempotencyKey: claim.attemptToken,
        ...(passwordSetupUrl ? { passwordSetupUrl } : {}),
      });
    } catch {
      await this.releaseFailedAttempt(
        claim.attemptToken,
        'INVITATION_DELIVERY_FAILED',
      );
      throw new ApiError(
        503,
        'INVITATION_DELIVERY_FAILED',
        'The invitation could not be delivered. It is safe to retry.',
      );
    }

    try {
      await this.markDelivered(claim.attemptToken);
    } catch {
      // Delivery has already crossed the external side-effect boundary. The
      // persisted Firebase mapping is enough for activation, so returning an
      // error here would encourage a needless duplicate email.
      this.logger.error(
        'Invitation delivery succeeded, but its delivery status could not be recorded. Activation remains recoverable.',
      );
    }

    return { status: 'SENT' };
  }

  private async claimAttempt(
    playerId: string,
    email: string,
    retryAfterUniqueConflict = true,
  ): Promise<InvitationClaim> {
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
            name: true,
            type: true,
            user: { select: { id: true } },
            invitation: true,
          },
        });
        this.assertGuestCanBeInvited(player.type, Boolean(player.user));

        const invitation = player.invitation;
        if (
          invitation?.attemptToken &&
          invitation.attemptStartedAt &&
          invitation.attemptStartedAt.getTime() >
            Date.now() - this.attemptLeaseMilliseconds
        ) {
          throw new ApiError(
            409,
            'INVITATION_IN_PROGRESS',
            'An invitation attempt is already in progress.',
          );
        }
        if (
          invitation &&
          invitation.email !== email &&
          invitation.authProviderId
        ) {
          throw new ApiError(
            409,
            'INVITATION_EMAIL_MISMATCH',
            'This Player already has an invitation for a different email.',
          );
        }

        const attemptToken = randomUUID();
        const attemptStartedAt = new Date();
        const claimedInvitation = invitation
          ? await transaction.playerInvitation.update({
              where: { id: invitation.id },
              data: {
                email,
                attemptToken,
                attemptStartedAt,
                deliveryAttemptCount: { increment: 1 },
                lastErrorCode: null,
              },
            })
          : await transaction.playerInvitation.create({
              data: {
                playerId,
                email,
                attemptToken,
                attemptStartedAt,
                deliveryAttemptCount: 1,
              },
            });

        return {
          attemptToken,
          authProviderId: claimedInvitation.authProviderId,
          email,
          playerName: player.name,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (this.isUniqueConstraint(error, 'email')) {
        throw new ApiError(
          409,
          'INVITATION_EMAIL_ALREADY_LINKED',
          'This email is already reserved by another Player invitation.',
        );
      }
      if (
        retryAfterUniqueConflict &&
        this.isUniqueConstraint(error, 'playerId')
      ) {
        return this.claimAttempt(playerId, email, false);
      }
      throw error;
    }
  }

  private async resolveFirebaseIdentity(
    claim: InvitationClaim,
  ): Promise<FirebaseIdentityRecord> {
    const existingIdentity = await this.firebaseIdentities.findByEmail(
      claim.email,
    );
    if (existingIdentity) {
      this.assertIdentityDidNotChange(claim, existingIdentity.authProviderId);
      return existingIdentity;
    }

    if (claim.authProviderId) {
      throw new ApiError(
        409,
        'INVITATION_IDENTITY_CHANGED',
        'The Firebase identity reserved for this invitation no longer exists.',
      );
    }

    try {
      return await this.firebaseIdentities.createEmailPasswordIdentity(
        claim.email,
        claim.playerName,
      );
    } catch (error) {
      if (firebaseAdminErrorCode(error) !== 'auth/email-already-exists') {
        throw error;
      }

      const identityAfterRace = await this.firebaseIdentities.findByEmail(
        claim.email,
      );
      if (!identityAfterRace) throw error;
      return identityAfterRace;
    }
  }

  private assertIdentityDidNotChange(
    claim: InvitationClaim,
    resolvedAuthProviderId: string,
  ): void {
    if (
      claim.authProviderId &&
      claim.authProviderId !== resolvedAuthProviderId
    ) {
      throw new ApiError(
        409,
        'INVITATION_IDENTITY_CHANGED',
        'The email now belongs to a different Firebase identity.',
      );
    }
  }

  private async recordFirebaseIdentity(
    claim: InvitationClaim,
    authProviderId: string,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "Player"
          WHERE "id" = (
            SELECT "playerId"
            FROM "PlayerInvitation"
            WHERE "attemptToken" = ${claim.attemptToken}::uuid
               OR (
                 "email" = ${claim.email}
                 AND "authProviderId" = ${authProviderId}
                 AND "status" = 'ACCEPTED'
               )
          )
          FOR UPDATE
        `;
        const invitation = await transaction.playerInvitation.findFirst({
          where: {
            OR: [
              { attemptToken: claim.attemptToken },
              {
                email: claim.email,
                authProviderId,
                status: PlayerInvitationStatus.ACCEPTED,
              },
            ],
          },
          include: {
            player: {
              select: {
                type: true,
                user: { select: { authProviderId: true } },
              },
            },
          },
        });
        if (!invitation) {
          throw new ApiError(
            409,
            'INVITATION_IN_PROGRESS',
            'The invitation attempt no longer owns the Player.',
          );
        }
        if (invitation.player.user) {
          if (
            invitation.player.user.authProviderId !== authProviderId ||
            invitation.authProviderId !== authProviderId
          ) {
            throw new ApiError(
              409,
              'PLAYER_ALREADY_HAS_USER',
              'This Player is already linked to another User.',
            );
          }
          await transaction.playerInvitation.update({
            where: { id: invitation.id },
            data: {
              status: PlayerInvitationStatus.ACCEPTED,
              acceptedAt: invitation.acceptedAt ?? new Date(),
              attemptToken: null,
              attemptStartedAt: null,
              lastErrorCode: null,
            },
          });
          return true;
        }
        this.assertGuestCanBeInvited(invitation.player.type, false);
        if (
          invitation.authProviderId &&
          invitation.authProviderId !== authProviderId
        ) {
          throw new ApiError(
            409,
            'INVITATION_IDENTITY_CHANGED',
            'The email now belongs to a different Firebase identity.',
          );
        }

        const linkedUser = await transaction.user.findUnique({
          where: { authProviderId },
          select: { playerId: true },
        });
        if (linkedUser) {
          throw new ApiError(
            409,
            'INVITATION_IDENTITY_ALREADY_LINKED',
            'This Firebase identity is already linked to another Player.',
          );
        }

        await transaction.playerInvitation.update({
          where: { id: invitation.id },
          data: { authProviderId },
        });
        return false;
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (this.isUniqueConstraint(error, 'authProviderId')) {
        throw new ApiError(
          409,
          'INVITATION_IDENTITY_ALREADY_LINKED',
          'This Firebase identity is already reserved or linked.',
        );
      }
      throw error;
    }
  }

  private async releaseFailedAttempt(
    attemptToken: string,
    errorCode: string,
  ): Promise<void> {
    try {
      await this.prisma.playerInvitation.updateMany({
        where: { attemptToken },
        data: {
          attemptToken: null,
          attemptStartedAt: null,
          lastErrorCode: errorCode,
        },
      });
    } catch {
      this.logger.error(
        'An invitation attempt failed and its retry marker could not be updated.',
      );
    }
  }

  private async markDelivered(attemptToken: string): Promise<void> {
    await this.prisma.playerInvitation.updateMany({
      where: { attemptToken },
      data: {
        status: PlayerInvitationStatus.SENT,
        sentAt: new Date(),
        attemptToken: null,
        attemptStartedAt: null,
        lastErrorCode: null,
      },
    });
  }

  private assertGuestCanBeInvited(
    playerType: PlayerType,
    hasUser: boolean,
  ): void {
    if (hasUser) {
      throw new ApiError(
        409,
        'PLAYER_ALREADY_HAS_USER',
        'This Player is already linked to a User.',
      );
    }
    if (playerType !== PlayerType.GUEST) {
      throw new ApiError(
        422,
        'PLAYER_IS_NOT_GUEST',
        'Only a guest Player can be invited.',
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

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

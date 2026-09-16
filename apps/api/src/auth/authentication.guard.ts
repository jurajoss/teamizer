import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ApiError } from '../common/errors/api-error';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerInvitationActivationService } from '../invitations/player-invitation-activation.service';
import { ALLOW_UNONBOARDED_KEY, PUBLIC_ROUTE_KEY } from './auth.decorators';
import {
  authenticatedUserSelect,
  type AuthenticatedRequest,
  type VerifiedFirebaseIdentity,
} from './auth.types';
import { FirebaseTokenVerifier } from './firebase-token-verifier.service';

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(FirebaseTokenVerifier)
    private readonly firebaseTokenVerifier: FirebaseTokenVerifier,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PlayerInvitationActivationService)
    private readonly invitationActivation: PlayerInvitationActivationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.bearerToken(request.headers.authorization);
    let identity: VerifiedFirebaseIdentity;

    try {
      identity = await this.firebaseTokenVerifier.verify(token);
    } catch {
      throw new ApiError(
        401,
        'UNAUTHENTICATED',
        'The bearer token is invalid or expired.',
      );
    }

    let user = await this.prisma.user.findUnique({
      where: { authProviderId: identity.authProviderId },
      select: authenticatedUserSelect,
    });
    if (!user) {
      user = await this.invitationActivation.activate(identity);
    }
    const allowUnonboarded = this.reflector.getAllAndOverride<boolean>(
      ALLOW_UNONBOARDED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!user && !allowUnonboarded) {
      throw new ApiError(
        403,
        'ONBOARDING_REQUIRED',
        'Complete onboarding before using this endpoint.',
      );
    }

    request.authentication = { identity, user };
    return true;
  }

  private bearerToken(authorizationHeader: string | undefined): string {
    const parts = authorizationHeader?.trim().split(/\s+/) ?? [];

    if (
      parts.length !== 2 ||
      parts[0]?.toLowerCase() !== 'bearer' ||
      !parts[1]
    ) {
      throw new ApiError(
        401,
        'UNAUTHENTICATED',
        'A Firebase bearer token is required.',
      );
    }

    return parts[1];
  }
}

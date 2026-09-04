import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlayerStatus } from '@prisma/client';

import { ApiError } from '../common/errors/api-error';
import { ACTIVE_PLAYER_REQUIRED_KEY } from './auth.decorators';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class ActivePlayerGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const activePlayerRequired = this.reflector.getAllAndOverride<boolean>(
      ACTIVE_PLAYER_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!activePlayerRequired) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.authentication.user;

    if (!user) {
      throw new ApiError(
        403,
        'ONBOARDING_REQUIRED',
        'Complete onboarding before using this endpoint.',
      );
    }

    if (user.player.status !== PlayerStatus.ACTIVE) {
      throw new ApiError(
        403,
        'PLAYER_INACTIVE',
        'An active Player is required for this action.',
      );
    }

    return true;
  }
}

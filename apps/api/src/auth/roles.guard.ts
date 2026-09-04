import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';

import { ApiError } from '../common/errors/api-error';
import { REQUIRED_ROLES_KEY } from './auth.decorators';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authentication.user) {
      throw new ApiError(
        403,
        'ONBOARDING_REQUIRED',
        'Complete onboarding before using this endpoint.',
      );
    }

    if (!requiredRoles.includes(request.authentication.user.role)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}

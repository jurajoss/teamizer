import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';

import { ApiError } from '../common/errors/api-error';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
  VerifiedFirebaseIdentity,
} from './auth.types';

export const PUBLIC_ROUTE_KEY = 'publicRoute';
export const ALLOW_UNONBOARDED_KEY = 'allowUnonboarded';
export const REQUIRED_ROLES_KEY = 'requiredRoles';
export const ACTIVE_PLAYER_REQUIRED_KEY = 'activePlayerRequired';

export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
export const AllowUnonboarded = () => SetMetadata(ALLOW_UNONBOARDED_KEY, true);
export const Roles = (...roles: UserRole[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
export const ActivePlayerRequired = () =>
  SetMetadata(ACTIVE_PLAYER_REQUIRED_KEY, true);

export const CurrentFirebaseIdentity = createParamDecorator(
  (_data: unknown, context: ExecutionContext): VerifiedFirebaseIdentity => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.authentication.identity;
  },
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.authentication.user;

    if (!user) {
      throw new ApiError(
        403,
        'ONBOARDING_REQUIRED',
        'Complete onboarding before using this endpoint.',
      );
    }

    return user;
  },
);

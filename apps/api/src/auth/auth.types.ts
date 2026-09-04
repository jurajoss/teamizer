import { Prisma } from '@prisma/client';
import type { Request } from 'express';

export const authenticatedUserSelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  role: true,
  notificationsEnabled: true,
  createdAt: true,
  player: {
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      speed: true,
      endurance: true,
      defense: true,
      attack: true,
      technique: true,
      avatarStorageKey: true,
      avatarContentType: true,
      avatarUpdatedAt: true,
    },
  },
});

export type AuthenticatedUser = Prisma.UserGetPayload<{
  select: typeof authenticatedUserSelect;
}>;

export type VerifiedFirebaseIdentity = {
  authProviderId: string;
};

export type RequestAuthentication = {
  identity: VerifiedFirebaseIdentity;
  user: AuthenticatedUser | null;
};

export interface AuthenticatedRequest extends Request {
  authentication: RequestAuthentication;
}

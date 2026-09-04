import { UserRole, type PrismaClient } from '@prisma/client';

export type AdminProvisioningResult = {
  userId: string;
  alreadyAdmin: boolean;
};

export async function provisionAdmin(
  prisma: PrismaClient,
  authProviderId: string,
): Promise<AdminProvisioningResult> {
  const normalizedAuthProviderId = authProviderId.trim();

  if (
    normalizedAuthProviderId.length === 0 ||
    normalizedAuthProviderId.length > 255
  ) {
    throw new Error(
      'authProviderId must contain between 1 and 255 characters.',
    );
  }

  const user = await prisma.user.findUnique({
    where: { authProviderId: normalizedAuthProviderId },
    select: { id: true, role: true },
  });

  if (!user) {
    throw new Error(
      'No onboarded User has this authProviderId. Onboard the identity before provisioning ADMIN access.',
    );
  }

  if (user.role === UserRole.ADMIN) {
    return { userId: user.id, alreadyAdmin: true };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: UserRole.ADMIN },
  });

  return { userId: user.id, alreadyAdmin: false };
}

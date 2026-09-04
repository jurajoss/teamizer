import { PrismaClient } from '@prisma/client';

import { provisionAdmin } from '../admin/admin-provisioning';

function readAuthProviderId(arguments_: string[]): string {
  const optionIndex = arguments_.indexOf('--auth-provider-id');
  const authProviderId = arguments_[optionIndex + 1];

  if (optionIndex === -1 || !authProviderId) {
    throw new Error(
      'Usage: pnpm --filter @teamizer/api admin:provision -- --auth-provider-id <firebase-uid>',
    );
  }

  return authProviderId;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const result = await provisionAdmin(
      prisma,
      readAuthProviderId(process.argv.slice(2)),
    );
    const outcome = result.alreadyAdmin ? 'already ADMIN' : 'promoted to ADMIN';
    process.stdout.write(`User ${result.userId} is ${outcome}.\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`ADMIN provisioning failed: ${message}\n`);
  process.exitCode = 1;
});

import { PrismaClient } from '@prisma/client';

import {
  bootstrapDefaultSport,
  DEFAULT_SPORT,
} from '../bootstrap/default-sport';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const result = await bootstrapDefaultSport(prisma);
    const outcome = result.created ? 'created' : 'already configured';
    process.stdout.write(
      `Default Sport ${DEFAULT_SPORT.name} is ${outcome}: ${result.sportId}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`Default Sport bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});

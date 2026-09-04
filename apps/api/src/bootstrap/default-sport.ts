import type { PrismaClient } from '@prisma/client';

export const DEFAULT_SPORT = {
  name: 'Football',
  teamsPerMatch: 2,
  playersOnFieldPerTeam: 3,
} as const;

export type DefaultSportBootstrapResult = {
  sportId: string;
  created: boolean;
};

export async function bootstrapDefaultSport(
  prisma: Pick<PrismaClient, 'sport'>,
): Promise<DefaultSportBootstrapResult> {
  const insert = await prisma.sport.createMany({
    data: [DEFAULT_SPORT],
    skipDuplicates: true,
  });
  const sport = await prisma.sport.findUniqueOrThrow({
    where: { name: DEFAULT_SPORT.name },
    select: {
      id: true,
      teamsPerMatch: true,
      playersOnFieldPerTeam: true,
    },
  });

  if (
    sport.teamsPerMatch !== DEFAULT_SPORT.teamsPerMatch ||
    sport.playersOnFieldPerTeam !== DEFAULT_SPORT.playersOnFieldPerTeam
  ) {
    throw new Error(
      `Default Sport "${DEFAULT_SPORT.name}" already exists with ` +
        `teamsPerMatch=${sport.teamsPerMatch} and ` +
        `playersOnFieldPerTeam=${sport.playersOnFieldPerTeam}; expected ` +
        `teamsPerMatch=${DEFAULT_SPORT.teamsPerMatch} and ` +
        `playersOnFieldPerTeam=${DEFAULT_SPORT.playersOnFieldPerTeam}. ` +
        'Refusing to change the existing Sport automatically.',
    );
  }

  return { sportId: sport.id, created: insert.count === 1 };
}

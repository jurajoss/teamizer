import { z } from 'zod';

export const playerPublicSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(['REGULAR', 'GUEST']),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  avatarUrl: z.url().nullable(),
});

export const playerAttributesInputSchema = z
  .object({
    speed: z.number().int().min(1).max(10),
    endurance: z.number().int().min(1).max(10),
    defense: z.number().int().min(1).max(10),
    attack: z.number().int().min(1).max(10),
    technique: z.number().int().min(1).max(10),
  })
  .strict();

export const adminPlayerSchema = playerPublicSchema.extend({
  attributes: playerAttributesInputSchema,
});

const userSchema = z.object({
  id: z.uuid(),
  role: z.enum(['PLAYER', 'ADMIN']),
  notificationsEnabled: z.boolean(),
  createdAt: z.string(),
});

export const currentUserResponseSchema = z.object({
  user: userSchema,
  player: playerPublicSchema,
});

export const matchStatusSchema = z.enum([
  'OPEN_FOR_REGISTRATION',
  'IN_PROGRESS',
  'FINISHED',
  'CANCELLED',
]);

export const attendanceSchema = z.enum(['GOING', 'NOT_GOING']);

export const sportSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  teamsPerMatch: z.number().int().positive(),
  playersOnFieldPerTeam: z.number().int().positive(),
});

export const matchSummarySchema = z.object({
  id: z.uuid(),
  sport: sportSummarySchema,
  startsAt: z.iso.datetime(),
  location: z.string().nullable(),
  status: matchStatusSchema,
  stateVersion: z.number().int().nonnegative(),
});

export const upcomingMatchSchema = matchSummarySchema.extend({
  myAttendance: attendanceSchema.nullable(),
});

export const upcomingMatchesSchema = z.array(upcomingMatchSchema);

export const adminSportsSchema = z.array(sportSummarySchema);

export const createManualMatchInputSchema = z
  .object({
    sportId: z.uuid(),
    localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    localStartTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
    location: z.string().max(255).nullable(),
  })
  .strict();

export const weekdaySchema = z.enum([
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const scheduleSchema = z.object({
  id: z.uuid(),
  weekday: weekdaySchema,
  localStartTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/),
  timeZone: z.string().min(1).max(64),
  enabled: z.boolean(),
  sportId: z.uuid(),
  location: z.string().nullable(),
  generationHorizonDays: z.number().int().positive(),
  registrationReminderMinutes: z.number().int().nonnegative(),
  finalReminderMinutes: z.number().int().nonnegative(),
});

export const updateScheduleInputSchema = scheduleSchema
  .omit({ id: true })
  .strict();

export const generatedScheduledMatchSchema = z.object({
  match: matchSummarySchema,
  created: z.boolean(),
});

export const playerStatisticsSummarySchema = z.object({
  matches: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1).nullable(),
  goals: z.number().int().nonnegative(),
  goalsPerMatch: z.number().nonnegative().nullable(),
});

export const playerStatisticsSchema = playerStatisticsSummarySchema.extend({
  playerId: z.uuid(),
});

export const playerDetailSchema = playerPublicSchema.extend({
  statistics: playerStatisticsSummarySchema,
});

export const adminPlayerDetailSchema = playerDetailSchema.extend({
  attributes: playerAttributesInputSchema,
});

export const playersPageSchema = z.object({
  items: z.array(playerPublicSchema),
  nextCursor: z.string().nullable(),
});

export const updateOwnPlayerInputSchema = z
  .object({ name: z.string().trim().min(1).max(120) })
  .strict();

export const updateAdminPlayerInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    attributes: playerAttributesInputSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one Player field is required.',
  });

export const convertGuestInputSchema = z
  .object({ authProviderId: z.string().trim().min(1).max(255) })
  .strict();

export const convertedGuestResponseSchema = z.object({
  user: userSchema,
  player: adminPlayerSchema,
});

export const rankingRowSchema = z.object({
  rank: z.number().int().positive(),
  player: playerPublicSchema,
  statistics: playerStatisticsSummarySchema,
});

export const rankingsPageSchema = z.object({
  items: z.array(rankingRowSchema),
  nextCursor: z.string().nullable(),
});

const teamSchema = z.object({
  id: z.uuid(),
  side: z.enum(['A', 'B']),
  players: z.array(playerPublicSchema),
});

export const playerMatchHistoryItemSchema = z.object({
  id: z.uuid(),
  sport: z.object({ id: z.uuid(), name: z.string() }),
  startsAt: z.iso.datetime(),
  location: z.string().nullable(),
  score: z.object({
    teamA: z.number().int().nonnegative(),
    teamB: z.number().int().nonnegative(),
  }),
  teams: z.array(teamSchema),
  playerGoals: z.array(
    z.object({
      playerId: z.uuid(),
      goals: z.number().int().nonnegative(),
    }),
  ),
  subjectGoals: z.number().int().nonnegative(),
  subjectResult: z.enum(['WIN', 'DRAW', 'LOSS']),
});

export const playerMatchHistoryPageSchema = z.object({
  items: z.array(playerMatchHistoryItemSchema),
  nextCursor: z.string().nullable(),
});

export const pushDeviceSchema = z.object({
  id: z.uuid(),
  provider: z.enum(['EXPO', 'FCM']),
  platform: z.enum(['IOS', 'ANDROID']),
  isActive: z.boolean(),
  tokenSuffix: z.string(),
  deviceLabel: z.string().nullable(),
});

export const registerPushDeviceInputSchema = z
  .object({
    provider: z.enum(['EXPO', 'FCM']),
    platform: z.enum(['IOS', 'ANDROID']),
    pushToken: z.string().min(1).max(4096),
    deviceLabel: z.string().max(120).optional(),
  })
  .strict();

export const matchDetailSchema = matchSummarySchema.extend({
  myAttendance: attendanceSchema.nullable(),
  participants: z.object({
    going: z.array(playerPublicSchema),
    notGoing: z.array(playerPublicSchema),
    unanswered: z.array(playerPublicSchema),
  }),
  teams: z.array(teamSchema).nullable(),
  provenance: z
    .object({
      mode: z.enum(['ALGORITHM', 'MANUAL_ADJUSTMENT', 'MANUAL']),
      algorithmVersion: z.string(),
      configurationVersion: z.string(),
    })
    .nullable(),
  result: z
    .object({
      score: z.object({
        teamA: z.number().int().nonnegative(),
        teamB: z.number().int().nonnegative(),
      }),
      playerGoals: z.array(
        z.object({
          playerId: z.uuid(),
          goals: z.number().int().nonnegative(),
        }),
      ),
    })
    .nullable(),
});

export const matchParticipantSchema = z.object({
  matchId: z.uuid(),
  playerId: z.uuid(),
  attendance: attendanceSchema,
});

export const attendanceInputSchema = z
  .object({ attendance: attendanceSchema })
  .strict();

export const guestInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    attributes: playerAttributesInputSchema,
  })
  .strict();

export const addParticipantInputSchema = z.union([
  z.object({ playerId: z.uuid() }).strict(),
  z.object({ guest: guestInputSchema }).strict(),
]);

export const addParticipantResponseSchema = z.object({
  participant: matchParticipantSchema,
  player: playerPublicSchema.optional(),
});

export const teamProposalSchema = z.object({
  teamAPlayerIds: z.array(z.uuid()),
  teamBPlayerIds: z.array(z.uuid()),
  balance: z.object({
    balanceScore: z.number().nonnegative(),
    historyScore: z.number().nonnegative(),
  }),
  algorithmVersion: z.string().min(1),
  configurationVersion: z.string().min(1),
  proposalReceipt: z.string().min(1),
});

export const startMatchInputSchema = z
  .object({
    teamAPlayerIds: z.array(z.uuid()),
    teamBPlayerIds: z.array(z.uuid()),
    proposalReceipt: z.string().min(1),
  })
  .strict();

export const completeMatchInputSchema = z
  .object({
    score: z.object({
      teamA: z.number().int().nonnegative(),
      teamB: z.number().int().nonnegative(),
    }),
    playerGoals: z.array(
      z.object({
        playerId: z.uuid(),
        goals: z.number().int().nonnegative(),
      }),
    ),
  })
  .strict();

export const matchIdSchema = z.uuid();
export const idempotencyKeySchema = z.string().min(8).max(255);

export const onboardingInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    attributes: playerAttributesInputSchema,
  })
  .strict();

export type CurrentUser = z.infer<typeof currentUserResponseSchema>;
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
export type MatchDetail = z.infer<typeof matchDetailSchema>;
export type MatchTeam = NonNullable<MatchDetail['teams']>[number];
export type CompleteMatchInput = z.infer<typeof completeMatchInputSchema>;
export type Attendance = z.infer<typeof attendanceSchema>;
export type UpcomingMatch = z.infer<typeof upcomingMatchSchema>;
export type SportSummary = z.infer<typeof sportSummarySchema>;
export type MatchSummary = z.infer<typeof matchSummarySchema>;
export type CreateManualMatchInput = z.infer<
  typeof createManualMatchInputSchema
>;
export type Weekday = z.infer<typeof weekdaySchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleInputSchema>;
export type GeneratedScheduledMatch = z.infer<
  typeof generatedScheduledMatchSchema
>;
export type MatchParticipant = z.infer<typeof matchParticipantSchema>;
export type GuestInput = z.infer<typeof guestInputSchema>;
export type AddParticipantInput = z.infer<typeof addParticipantInputSchema>;
export type AddParticipantResponse = z.infer<
  typeof addParticipantResponseSchema
>;
export type TeamProposal = z.infer<typeof teamProposalSchema>;
export type StartMatchInput = z.infer<typeof startMatchInputSchema>;
export type PlayerStatisticsSummary = z.infer<
  typeof playerStatisticsSummarySchema
>;
export type PlayerStatistics = z.infer<typeof playerStatisticsSchema>;
export type PlayerDetail = z.infer<typeof playerDetailSchema>;
export type AdminPlayerDetail = z.infer<typeof adminPlayerDetailSchema>;
export type PlayersPage = z.infer<typeof playersPageSchema>;
export type UpdateOwnPlayerInput = z.infer<typeof updateOwnPlayerInputSchema>;
export type UpdateAdminPlayerInput = z.infer<
  typeof updateAdminPlayerInputSchema
>;
export type ConvertedGuestResponse = z.infer<
  typeof convertedGuestResponseSchema
>;
export type RankingRow = z.infer<typeof rankingRowSchema>;
export type RankingsPage = z.infer<typeof rankingsPageSchema>;
export type PlayerMatchHistoryItem = z.infer<
  typeof playerMatchHistoryItemSchema
>;
export type PlayerMatchHistoryPage = z.infer<
  typeof playerMatchHistoryPageSchema
>;
export type PushDevice = z.infer<typeof pushDeviceSchema>;
export type RegisterPushDeviceInput = z.infer<
  typeof registerPushDeviceInputSchema
>;

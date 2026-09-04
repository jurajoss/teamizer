-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PlayerType" AS ENUM ('REGULAR', 'GUEST');

-- CreateEnum
CREATE TYPE "PlayerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('OPEN_FOR_REGISTRATION', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Attendance" AS ENUM ('GOING', 'NOT_GOING');

-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "TeamGenerationMode" AS ENUM ('ALGORITHM', 'MANUAL_ADJUSTMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "PushProvider" AS ENUM ('EXPO', 'FCM');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "authProviderId" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "type" "PlayerType" NOT NULL,
    "status" "PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "speed" SMALLINT NOT NULL,
    "endurance" SMALLINT NOT NULL,
    "defense" SMALLINT NOT NULL,
    "attack" SMALLINT NOT NULL,
    "technique" SMALLINT NOT NULL,
    "avatarStorageKey" VARCHAR(512),
    "avatarContentType" VARCHAR(100),
    "avatarUpdatedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "player_attributes_range" CHECK (
        "speed" BETWEEN 1 AND 10
        AND "endurance" BETWEEN 1 AND 10
        AND "defense" BETWEEN 1 AND 10
        AND "attack" BETWEEN 1 AND 10
        AND "technique" BETWEEN 1 AND 10
    )
);

-- CreateTable
CREATE TABLE "Sport" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "teamsPerMatch" SMALLINT NOT NULL,
    "playersOnFieldPerTeam" SMALLINT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Sport_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sport_team_shape_positive" CHECK (
        "teamsPerMatch" >= 2
        AND "playersOnFieldPerTeam" >= 1
    )
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" UUID NOT NULL,
    "weekday" "Weekday" NOT NULL DEFAULT 'TUESDAY',
    "localStartTime" TIME(0) NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Prague',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sportId" UUID NOT NULL,
    "location" VARCHAR(255),
    "generationHorizonDays" INTEGER NOT NULL DEFAULT 7,
    "registrationReminderMinutes" INTEGER NOT NULL DEFAULT 2880,
    "finalReminderMinutes" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "schedule_positive_intervals" CHECK (
        "generationHorizonDays" > 0
        AND "registrationReminderMinutes" >= 0
        AND "finalReminderMinutes" >= 0
    )
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "scheduleId" UUID,
    "sportId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "location" VARCHAR(255),
    "status" "MatchStatus" NOT NULL DEFAULT 'OPEN_FOR_REGISTRATION',
    "teamAScore" INTEGER,
    "teamBScore" INTEGER,
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "cancelledByUserId" UUID,
    "teamGenerationMode" "TeamGenerationMode",
    "algorithmVersion" VARCHAR(64),
    "configurationVersion" VARCHAR(64),
    "stateVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "match_scores_non_negative" CHECK (
        ("teamAScore" IS NULL OR "teamAScore" >= 0)
        AND ("teamBScore" IS NULL OR "teamBScore" >= 0)
    ),
    CONSTRAINT "match_scores_both_or_neither" CHECK (
        ("teamAScore" IS NULL AND "teamBScore" IS NULL)
        OR ("teamAScore" IS NOT NULL AND "teamBScore" IS NOT NULL)
    ),
    CONSTRAINT "match_finished_has_result" CHECK (
        (
            "status" = 'FINISHED'
            AND "teamAScore" IS NOT NULL
            AND "teamBScore" IS NOT NULL
            AND "completedAt" IS NOT NULL
        )
        OR (
            "status" <> 'FINISHED'
            AND "completedAt" IS NULL
        )
    )
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "matchId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "attendance" "Attendance" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("matchId", "playerId")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "side" "TeamSide" NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "matchId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("matchId", "playerId")
);

-- CreateTable
CREATE TABLE "MatchPlayerStat" (
    "matchId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "goals" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchPlayerStat_pkey" PRIMARY KEY ("matchId", "playerId"),
    CONSTRAINT "match_player_stats_non_negative" CHECK ("goals" >= 0)
);

-- CreateTable
CREATE TABLE "MatchCompletionIdempotency" (
    "matchId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "requestHash" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchCompletionIdempotency_pkey" PRIMARY KEY ("matchId", "idempotencyKey")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "PushProvider" NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "pushToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "invalidatedAt" TIMESTAMPTZ(6),
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceLabel" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_playerId_key" ON "User"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "User_authProviderId_key" ON "User"("authProviderId");

-- CreateIndex
CREATE INDEX "Player_status_name_idx" ON "Player"("status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Sport_name_key" ON "Sport"("name");

-- CreateIndex
CREATE INDEX "Schedule_enabled_weekday_idx" ON "Schedule"("enabled", "weekday");

-- CreateIndex
CREATE INDEX "Match_status_startsAt_idx" ON "Match"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Match_sportId_startsAt_idx" ON "Match"("sportId", "startsAt");

-- CreateIndex
CREATE INDEX "Match_scheduleId_startsAt_idx" ON "Match"("scheduleId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Match_scheduleId_startsAt_key" ON "Match"("scheduleId", "startsAt");

-- CreateIndex
CREATE INDEX "MatchParticipant_matchId_attendance_idx" ON "MatchParticipant"("matchId", "attendance");

-- CreateIndex
CREATE INDEX "MatchParticipant_playerId_matchId_idx" ON "MatchParticipant"("playerId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_matchId_side_key" ON "Team"("matchId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "Team_id_matchId_key" ON "Team"("id", "matchId");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_matchId_idx" ON "TeamMembership"("teamId", "matchId");

-- CreateIndex
CREATE INDEX "MatchPlayerStat_playerId_matchId_idx" ON "MatchPlayerStat"("playerId", "matchId");

-- CreateIndex
CREATE INDEX "MatchCompletionIdempotency_createdAt_idx" ON "MatchCompletionIdempotency"("createdAt");

-- CreateIndex
CREATE INDEX "PushDevice_userId_isActive_idx" ON "PushDevice"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_provider_pushToken_key" ON "PushDevice"("provider", "pushToken");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_sportId_fkey" FOREIGN KEY ("sportId") REFERENCES "Sport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_cancelledByUserId_fkey" FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_matchId_fkey" FOREIGN KEY ("teamId", "matchId") REFERENCES "Team"("id", "matchId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayerStat" ADD CONSTRAINT "MatchPlayerStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayerStat" ADD CONSTRAINT "MatchPlayerStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCompletionIdempotency" ADD CONSTRAINT "MatchCompletionIdempotency_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

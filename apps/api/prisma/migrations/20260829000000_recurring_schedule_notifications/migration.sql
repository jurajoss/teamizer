-- Durable attendance-reminder identity and delivery state.
CREATE TYPE "ReminderType" AS ENUM ('REGISTRATION', 'FINAL');
CREATE TYPE "ReminderDeliveryStatus" AS ENUM (
    'PENDING',
    'DELIVERED',
    'TRANSIENT_FAILURE',
    'INVALID_TOKEN'
);

CREATE TABLE "MatchReminderDelivery" (
    "matchId" UUID NOT NULL,
    "pushDeviceId" UUID NOT NULL,
    "reminderType" "ReminderType" NOT NULL,
    "status" "ReminderDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "errorCode" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "MatchReminderDelivery_pkey"
        PRIMARY KEY ("matchId", "pushDeviceId", "reminderType"),
    CONSTRAINT "match_reminder_attempts_non_negative"
        CHECK ("attemptCount" >= 0)
);

CREATE INDEX "MatchReminderDelivery_status_lastAttemptAt_idx"
    ON "MatchReminderDelivery"("status", "lastAttemptAt");

CREATE INDEX "MatchReminderDelivery_pushDeviceId_createdAt_idx"
    ON "MatchReminderDelivery"("pushDeviceId", "createdAt");

ALTER TABLE "MatchReminderDelivery"
    ADD CONSTRAINT "MatchReminderDelivery_matchId_fkey"
    FOREIGN KEY ("matchId") REFERENCES "Match"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MatchReminderDelivery"
    ADD CONSTRAINT "MatchReminderDelivery_pushDeviceId_fkey"
    FOREIGN KEY ("pushDeviceId") REFERENCES "PushDevice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

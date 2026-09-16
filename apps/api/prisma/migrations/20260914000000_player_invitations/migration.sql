-- CreateEnum
CREATE TYPE "PlayerInvitationStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REVOKED');

-- CreateTable
CREATE TABLE "PlayerInvitation" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "authProviderId" VARCHAR(255),
    "status" "PlayerInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "deliveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "attemptToken" UUID,
    "attemptStartedAt" TIMESTAMPTZ(6),
    "sentAt" TIMESTAMPTZ(6),
    "acceptedAt" TIMESTAMPTZ(6),
    "lastErrorCode" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PlayerInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvitation_playerId_key" ON "PlayerInvitation"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvitation_email_key" ON "PlayerInvitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvitation_authProviderId_key" ON "PlayerInvitation"("authProviderId");

-- CreateIndex
CREATE INDEX "PlayerInvitation_status_attemptStartedAt_idx" ON "PlayerInvitation"("status", "attemptStartedAt");

-- AddForeignKey
ALTER TABLE "PlayerInvitation" ADD CONSTRAINT "PlayerInvitation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Fence reminder attempts so a worker whose lease expired cannot overwrite
-- the result recorded by a newer worker. Nullable preserves existing rows;
-- every application-created/reclaimed claim receives a token.
ALTER TABLE "MatchReminderDelivery"
    ADD COLUMN "claimToken" UUID;

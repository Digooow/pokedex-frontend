CREATE TYPE "TrainerRole" AS ENUM ('TRAINER', 'MODERATOR', 'ADMIN');

ALTER TABLE "Trainer" ADD COLUMN "role" "TrainerRole" NOT NULL DEFAULT 'TRAINER';

CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorTrainerId" UUID,
    "actorRole" VARCHAR(24) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "resource" VARCHAR(120) NOT NULL,
    "outcome" VARCHAR(24) NOT NULL,
    "ipHash" VARCHAR(64),
    "traceId" VARCHAR(64),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_actorTrainerId_createdAt_idx" ON "AuditLog"("actorTrainerId", "createdAt" DESC);
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt" DESC);

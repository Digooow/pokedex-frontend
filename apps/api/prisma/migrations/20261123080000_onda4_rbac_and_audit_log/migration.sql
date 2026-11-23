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

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog table is append-only and immutable (REQ-SEC-35)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_no_update
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER trg_audit_log_no_delete
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

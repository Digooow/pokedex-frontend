-- AlterTable
ALTER TABLE "Trainer" ADD COLUMN     "emailVerifiedAt" TIMESTAMPTZ(6),
ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecretEncrypted" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MfaBackupCode" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "codeHash" VARCHAR(64) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaBackupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerOAuthAccount" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerAccountId" VARCHAR(191) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerOAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerPasskey" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "credentialId" VARCHAR(255) NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceType" VARCHAR(32) NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" VARCHAR(32)[],
    "label" VARCHAR(80) NOT NULL DEFAULT 'Dispositivo',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6),

    CONSTRAINT "TrainerPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MfaBackupCode_trainerId_usedAt_idx" ON "MfaBackupCode"("trainerId", "usedAt");

-- CreateIndex
CREATE INDEX "TrainerOAuthAccount_trainerId_idx" ON "TrainerOAuthAccount"("trainerId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerOAuthAccount_provider_providerAccountId_key" ON "TrainerOAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerPasskey_credentialId_key" ON "TrainerPasskey"("credentialId");

-- CreateIndex
CREATE INDEX "TrainerPasskey_trainerId_idx" ON "TrainerPasskey"("trainerId");

-- AddForeignKey
ALTER TABLE "MfaBackupCode" ADD CONSTRAINT "MfaBackupCode_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerOAuthAccount" ADD CONSTRAINT "TrainerOAuthAccount_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPasskey" ADD CONSTRAINT "TrainerPasskey_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

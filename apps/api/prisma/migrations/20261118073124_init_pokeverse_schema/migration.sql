-- CreateEnum
CREATE TYPE "ArcadeConsole" AS ENUM ('GB', 'GBC', 'GBA', 'NDS');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "BattleMode" AS ENUM ('PVE', 'PVP');

-- CreateEnum
CREATE TYPE "BattleStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'FINISHED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Trainer" (
    "id" UUID NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarConfig" JSONB NOT NULL DEFAULT '{}',
    "lastMapId" VARCHAR(64) NOT NULL DEFAULT 'pokeverse-town',
    "lastX" INTEGER NOT NULL DEFAULT 400,
    "lastY" INTEGER NOT NULL DEFAULT 320,
    "badgesCount" INTEGER NOT NULL DEFAULT 0,
    "eloRating" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Trainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PokedexSlot" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "slotIndex" SMALLINT NOT NULL,
    "pokemonId" INTEGER NOT NULL,
    "pokemonName" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(40),
    "spriteUrl" VARCHAR(512),
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PokedexSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PokemonTeam" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "formatRule" VARCHAR(32) NOT NULL DEFAULT 'standard-6v6',
    "synergyScore" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "PokemonTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PokemonTeamMember" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "pokemonId" INTEGER NOT NULL,
    "species" VARCHAR(64) NOT NULL,
    "nickname" VARCHAR(40),
    "level" SMALLINT NOT NULL DEFAULT 50,
    "nature" VARCHAR(24) NOT NULL,
    "ability" VARCHAR(48) NOT NULL,
    "heldItem" VARCHAR(48),
    "ivs" JSONB NOT NULL,
    "evs" JSONB NOT NULL,
    "moves" VARCHAR(48)[],

    CONSTRAINT "PokemonTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcadeRom" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "console" "ArcadeConsole" NOT NULL,
    "generation" SMALLINT NOT NULL,
    "releaseYear" SMALLINT NOT NULL,
    "regionName" VARCHAR(40) NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "coverUrl" VARCHAR(512) NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArcadeRom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcadeSaveState" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "romId" UUID NOT NULL,
    "slotNumber" SMALLINT NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "screenshotKey" VARCHAR(255),
    "checksumSha256" CHAR(64) NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "playTimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ArcadeSaveState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinigameScore" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "gameKey" VARCHAR(40) NOT NULL,
    "score" INTEGER NOT NULL,
    "streak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinigameScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleMatch" (
    "id" UUID NOT NULL,
    "mode" "BattleMode" NOT NULL,
    "status" "BattleStatus" NOT NULL DEFAULT 'WAITING',
    "playerOneId" UUID NOT NULL,
    "playerTwoId" UUID,
    "npcOpponentId" VARCHAR(64),
    "winnerId" UUID,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "summaryLog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(6),

    CONSTRAINT "BattleMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" UUID NOT NULL,
    "aggregateType" VARCHAR(48) NOT NULL,
    "aggregateId" VARCHAR(64) NOT NULL,
    "eventType" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trainer_username_key" ON "Trainer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Trainer_email_key" ON "Trainer"("email");

-- CreateIndex
CREATE INDEX "Trainer_eloRating_id_idx" ON "Trainer"("eloRating" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_trainerId_revokedAt_expiresAt_idx" ON "RefreshToken"("trainerId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "PokedexSlot_trainerId_pokemonId_idx" ON "PokedexSlot"("trainerId", "pokemonId");

-- CreateIndex
CREATE UNIQUE INDEX "PokedexSlot_trainerId_slotIndex_key" ON "PokedexSlot"("trainerId", "slotIndex");

-- CreateIndex
CREATE INDEX "PokemonTeam_trainerId_updatedAt_id_idx" ON "PokemonTeam"("trainerId", "updatedAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "PokemonTeamMember_teamId_position_key" ON "PokemonTeamMember"("teamId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ArcadeRom_slug_key" ON "ArcadeRom"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ArcadeRom_storageKey_key" ON "ArcadeRom"("storageKey");

-- CreateIndex
CREATE INDEX "ArcadeRom_isActive_console_generation_idx" ON "ArcadeRom"("isActive", "console", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "ArcadeSaveState_storageKey_key" ON "ArcadeSaveState"("storageKey");

-- CreateIndex
CREATE INDEX "ArcadeSaveState_trainerId_updatedAt_idx" ON "ArcadeSaveState"("trainerId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ArcadeSaveState_trainerId_romId_slotNumber_key" ON "ArcadeSaveState"("trainerId", "romId", "slotNumber");

-- CreateIndex
CREATE INDEX "MinigameScore_gameKey_score_createdAt_id_idx" ON "MinigameScore"("gameKey", "score" DESC, "createdAt", "id");

-- CreateIndex
CREATE INDEX "MinigameScore_trainerId_gameKey_createdAt_idx" ON "MinigameScore"("trainerId", "gameKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BattleMatch_playerOneId_createdAt_id_idx" ON "BattleMatch"("playerOneId", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "BattleMatch_status_mode_createdAt_idx" ON "BattleMatch"("status", "mode", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PokedexSlot" ADD CONSTRAINT "PokedexSlot_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PokemonTeam" ADD CONSTRAINT "PokemonTeam_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PokemonTeamMember" ADD CONSTRAINT "PokemonTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "PokemonTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcadeSaveState" ADD CONSTRAINT "ArcadeSaveState_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcadeSaveState" ADD CONSTRAINT "ArcadeSaveState_romId_fkey" FOREIGN KEY ("romId") REFERENCES "ArcadeRom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinigameScore" ADD CONSTRAINT "MinigameScore_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleMatch" ADD CONSTRAINT "BattleMatch_playerOneId_fkey" FOREIGN KEY ("playerOneId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleMatch" ADD CONSTRAINT "BattleMatch_playerTwoId_fkey" FOREIGN KEY ("playerTwoId") REFERENCES "Trainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial Index: keeps Outbox polling O(log pending) even with millions of published rows
CREATE INDEX "idx_outbox_pending"
  ON "OutboxEvent" ("createdAt" ASC)
  WHERE "status" = 'PENDING';

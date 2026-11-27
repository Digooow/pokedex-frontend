CREATE TYPE "CharacterPresenceMode" AS ENUM ('ONLINE', 'OFFLINE_ROUTINE', 'OFFLINE_SHOP', 'OFFLINE_GUARD');

CREATE TABLE "Character" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "name" VARCHAR(24) NOT NULL,
    "normalizedName" VARCHAR(24) NOT NULL,
    "originKey" VARCHAR(32) NOT NULL,
    "appearance" JSONB NOT NULL,
    "level" SMALLINT NOT NULL DEFAULT 1,
    "totalSkillMilestones" BIGINT NOT NULL DEFAULT 0,
    "availableAttributePoints" SMALLINT NOT NULL DEFAULT 0,
    "hpCurrent" SMALLINT NOT NULL,
    "staminaCurrent" SMALLINT NOT NULL,
    "manaCurrent" SMALLINT NOT NULL,
    "hungerCurrent" SMALLINT NOT NULL DEFAULT 100,
    "thirstCurrent" SMALLINT NOT NULL DEFAULT 100,
    "fatigueCurrent" SMALLINT NOT NULL DEFAULT 0,
    "hexQ" INTEGER NOT NULL DEFAULT 0,
    "hexR" INTEGER NOT NULL DEFAULT 0,
    "hexZ" INTEGER NOT NULL DEFAULT 0,
    "presenceMode" "CharacterPresenceMode" NOT NULL DEFAULT 'ONLINE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Character_level_check" CHECK ("level" >= 1),
    CONSTRAINT "Character_availableAttributePoints_check" CHECK ("availableAttributePoints" >= 0)
);

CREATE TABLE "CharacterAttribute" (
    "characterId" UUID NOT NULL,
    "physique" SMALLINT NOT NULL DEFAULT 5,
    "dexterity" SMALLINT NOT NULL DEFAULT 5,
    "stamina" SMALLINT NOT NULL DEFAULT 5,
    "magic" SMALLINT NOT NULL DEFAULT 5,
    "perception" SMALLINT NOT NULL DEFAULT 5,
    "willpower" SMALLINT NOT NULL DEFAULT 5,
    "handling" SMALLINT NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CharacterAttribute_pkey" PRIMARY KEY ("characterId"),
    CONSTRAINT "CharacterAttribute_physique_check" CHECK ("physique" >= 1),
    CONSTRAINT "CharacterAttribute_dexterity_check" CHECK ("dexterity" >= 1),
    CONSTRAINT "CharacterAttribute_stamina_check" CHECK ("stamina" >= 1),
    CONSTRAINT "CharacterAttribute_magic_check" CHECK ("magic" >= 1),
    CONSTRAINT "CharacterAttribute_perception_check" CHECK ("perception" >= 1),
    CONSTRAINT "CharacterAttribute_willpower_check" CHECK ("willpower" >= 1),
    CONSTRAINT "CharacterAttribute_handling_check" CHECK ("handling" >= 1)
);

CREATE UNIQUE INDEX "Character_normalizedName_key" ON "Character"("normalizedName");

CREATE INDEX "Character_accountId_createdAt_id_idx" ON "Character"("accountId", "createdAt" DESC, "id");

ALTER TABLE "Character" ADD CONSTRAINT "Character_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Trainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CharacterAttribute" ADD CONSTRAINT "CharacterAttribute_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

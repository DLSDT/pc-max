-- A game's description is shown to the player, and the audience reads Persian.
-- One `description` column could only ever hold one language, so the catalogue
-- had to choose whose readers it served.
--
-- The old column is left in place and copied into the English side rather than
-- renamed: a rename is not reversible mid-deploy, and an API that is briefly
-- older than its database must not start failing on a missing column.
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "description_en" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "description_fa" text;--> statement-breakpoint
UPDATE "games" SET "description_en" = "description"
  WHERE "description_en" IS NULL AND "description" IS NOT NULL AND "description" <> '';

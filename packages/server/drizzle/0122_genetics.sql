-- A character's genetic and gene trees in a ruleset (see shared/genetics.ts). Climaxx is never
-- stored: it is worked out from these each time. By hand like 0038+.
ALTER TABLE `mania4k_character` ADD COLUMN IF NOT EXISTS `genetics` json;
--> statement-breakpoint
ALTER TABLE `mania7k_character` ADD COLUMN IF NOT EXISTS `genetics` json;
--> statement-breakpoint
ALTER TABLE `osu_character` ADD COLUMN IF NOT EXISTS `genetics` json;

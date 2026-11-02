-- Plays of a map that still train memory with the character's genes counted in. `memory` stays
-- what XP reads. Starts equal to it. By hand like 0038+.
ALTER TABLE `mania4k_beatmaps_played` ADD COLUMN IF NOT EXISTS `recall` double DEFAULT 0 NOT NULL AFTER `memory`;
--> statement-breakpoint
ALTER TABLE `mania7k_beatmaps_played` ADD COLUMN IF NOT EXISTS `recall` double DEFAULT 0 NOT NULL AFTER `memory`;
--> statement-breakpoint
ALTER TABLE `osu_beatmaps_played` ADD COLUMN IF NOT EXISTS `recall` double DEFAULT 0 NOT NULL AFTER `memory`;
--> statement-breakpoint
UPDATE `mania4k_beatmaps_played` SET `recall` = `memory`;
--> statement-breakpoint
UPDATE `mania7k_beatmaps_played` SET `recall` = `memory`;
--> statement-breakpoint
UPDATE `osu_beatmaps_played` SET `recall` = `memory`;

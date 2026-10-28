-- Memory plays fade by DAILY_DECAY a day: kept as a fraction, as of memory_at, on every ruleset's played maps. By hand like 0038+.
ALTER TABLE `mania4k_beatmaps_played` MODIFY `memory` double NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS `memory_at` timestamp NOT NULL DEFAULT (now());
--> statement-breakpoint
ALTER TABLE `mania7k_beatmaps_played` MODIFY `memory` double NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS `memory_at` timestamp NOT NULL DEFAULT (now());
--> statement-breakpoint
ALTER TABLE `osu_beatmaps_played` MODIFY `memory` double NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS `memory_at` timestamp NOT NULL DEFAULT (now());

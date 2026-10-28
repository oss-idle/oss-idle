-- The score version each play was simulated on: the score reprocessor brings older ones up to the server's. By hand like 0038+.
ALTER TABLE `mania4k_score` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania4k_unranked_score` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania4k_best` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania4k_best_pp` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania4k_first_place` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania7k_score` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania7k_unranked_score` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania7k_best` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania7k_best_pp` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `mania7k_first_place` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `osu_score` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `osu_unranked_score` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `osu_best` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `osu_best_pp` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `osu_first_place` ADD COLUMN IF NOT EXISTS `version` smallint NOT NULL DEFAULT 1;

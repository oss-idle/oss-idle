-- Rate and mods belong to a ruleset: every character keeps its own in each one, and
-- picking another ruleset leaves them as they were. By hand like 0038+.
ALTER TABLE `mania4k_character` ADD COLUMN IF NOT EXISTS `play_rate` double DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `mania4k_character` ADD COLUMN IF NOT EXISTS `play_mods` json;
--> statement-breakpoint
ALTER TABLE `mania7k_character` ADD COLUMN IF NOT EXISTS `play_rate` double DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `mania7k_character` ADD COLUMN IF NOT EXISTS `play_mods` json;
--> statement-breakpoint
ALTER TABLE `osu_character` ADD COLUMN IF NOT EXISTS `play_rate` double DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `osu_character` ADD COLUMN IF NOT EXISTS `play_mods` json;
--> statement-breakpoint
UPDATE `mania4k_character` p JOIN `character` c ON c.`id` = p.`id`
SET p.`play_rate` = c.`play_rate`, p.`play_mods` = c.`play_mods` WHERE c.`ruleset` = 'mania4k';
--> statement-breakpoint
UPDATE `mania7k_character` p JOIN `character` c ON c.`id` = p.`id`
SET p.`play_rate` = c.`play_rate`, p.`play_mods` = c.`play_mods` WHERE c.`ruleset` = 'mania7k';
--> statement-breakpoint
UPDATE `osu_character` p JOIN `character` c ON c.`id` = p.`id`
SET p.`play_rate` = c.`play_rate`, p.`play_mods` = c.`play_mods` WHERE c.`ruleset` = 'osu';
--> statement-breakpoint
ALTER TABLE `character` DROP COLUMN IF EXISTS `play_rate`, DROP COLUMN IF EXISTS `play_mods`;

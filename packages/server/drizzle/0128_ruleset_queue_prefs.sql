-- Autopilot mode, delay and play once belong to a ruleset, as rate and mods do: every
-- ruleset starts from the character's current choice. By hand like 0038+.
ALTER TABLE `mania4k_character` ADD COLUMN IF NOT EXISTS `autopilot_mode` varchar(10) DEFAULT 'NEXT' NOT NULL,
	ADD COLUMN IF NOT EXISTS `autopilot_delay` int DEFAULT 30 NOT NULL,
	ADD COLUMN IF NOT EXISTS `queue_play_once` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `mania7k_character` ADD COLUMN IF NOT EXISTS `autopilot_mode` varchar(10) DEFAULT 'NEXT' NOT NULL,
	ADD COLUMN IF NOT EXISTS `autopilot_delay` int DEFAULT 30 NOT NULL,
	ADD COLUMN IF NOT EXISTS `queue_play_once` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `osu_character` ADD COLUMN IF NOT EXISTS `autopilot_mode` varchar(10) DEFAULT 'NEXT' NOT NULL,
	ADD COLUMN IF NOT EXISTS `autopilot_delay` int DEFAULT 30 NOT NULL,
	ADD COLUMN IF NOT EXISTS `queue_play_once` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `mania4k_character` p JOIN `character` c ON c.`id` = p.`id`
SET p.`autopilot_mode` = c.`autopilot_mode`, p.`autopilot_delay` = c.`autopilot_delay`, p.`queue_play_once` = c.`queue_play_once`;
--> statement-breakpoint
UPDATE `mania7k_character` p JOIN `character` c ON c.`id` = p.`id`
SET p.`autopilot_mode` = c.`autopilot_mode`, p.`autopilot_delay` = c.`autopilot_delay`, p.`queue_play_once` = c.`queue_play_once`;
--> statement-breakpoint
UPDATE `osu_character` p JOIN `character` c ON c.`id` = p.`id`
SET p.`autopilot_mode` = c.`autopilot_mode`, p.`autopilot_delay` = c.`autopilot_delay`, p.`queue_play_once` = c.`queue_play_once`;
--> statement-breakpoint
ALTER TABLE `character` DROP COLUMN IF EXISTS `autopilot_mode`, DROP COLUMN IF EXISTS `autopilot_delay`, DROP COLUMN IF EXISTS `queue_play_once`;

-- Beatmap Nominators: a group, and the rulesets each one ranks maps in. By hand like 0038+.
ALTER TABLE `user_group` MODIFY COLUMN `group` enum('admin','gmt','bn') NOT NULL;
--> statement-breakpoint
CREATE TABLE `user_nominates` (
	`user_id` int NOT NULL,
	`ruleset` varchar(16) NOT NULL,
	PRIMARY KEY (`user_id`, `ruleset`),
	CONSTRAINT `user_nominates_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
-- 7K's queue, for nominators to work on before players get the ruleset.
INSERT IGNORE INTO `mania7k_beatmapset_status` (`set_id`, `status`)
	SELECT DISTINCT b.`set_id`, IF(s.`uploaded_at` IS NULL, 'pending', 'unranked')
	FROM `beatmap` b JOIN `beatmapset` s ON s.`id` = b.`set_id`
	WHERE b.`mode` = 3 AND b.`keys` = 7;
